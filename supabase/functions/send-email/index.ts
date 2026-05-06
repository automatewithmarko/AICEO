import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Microsoft OAuth refresh — mirrors backend/services/outlook-oauth.js so the
// Edge Function is self-contained (doesn't rely on the backend's IDLE service
// to keep tokens warm). Refresh if the access token expires within 5 minutes.
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const OUTLOOK_SCOPES = [
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "https://outlook.office.com/SMTP.Send",
  "offline_access",
  "openid",
  "email",
  "profile",
].join(" ");

async function refreshOutlookToken(refreshToken: string) {
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID");
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set on this edge function");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: OUTLOOK_SCOPES,
  });
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || `Microsoft token refresh failed (${res.status})`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token || refreshToken) as string,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function getValidAccessToken(account: any, adminClient: any) {
  if (account.auth_type !== "oauth") return account;
  if (!account.oauth_refresh_token) {
    throw new Error("OAuth account is missing refresh_token — user must reconnect");
  }
  const expiresAt = account.oauth_expires_at ? new Date(account.oauth_expires_at).getTime() : 0;
  const needsRefresh = !account.oauth_access_token || Date.now() > expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  if (!needsRefresh) return account;

  console.log(`[send-email] Refreshing OAuth token for ${account.email}`);
  const tokens = await refreshOutlookToken(account.oauth_refresh_token);
  await adminClient.from("email_accounts").update({
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token,
    oauth_expires_at: tokens.expires_at,
  }).eq("id", account.id);
  return {
    ...account,
    oauth_access_token: tokens.access_token,
    oauth_refresh_token: tokens.refresh_token,
    oauth_expires_at: tokens.expires_at,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { account_id, to, cc, subject, body_text, body_html, in_reply_to, references, _user_id } = body;

    if (!account_id || !to || !subject) {
      return jsonResponse({ error: "account_id, to, and subject required" }, 400);
    }

    // Determine user ID from either JWT or _user_id (server-to-server)
    let userId: string | null = null;

    if (_user_id) {
      // Server-to-server call from backend (AI agents)
      // _user_id is trusted because verify_jwt is false and only our backend sends this
      userId = _user_id;
      console.log(`[send-email] Server call for user ${userId}`);
    } else {
      // Frontend call with user JWT
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
      userId = user.id;
    }

    if (!userId) return jsonResponse({ error: "Could not determine user" }, 401);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let { data: account, error: accError } = await adminClient
      .from("email_accounts")
      .select("*")
      .eq("id", account_id)
      .eq("user_id", userId)
      .single();

    if (accError || !account) return jsonResponse({ error: "Account not found" }, 404);

    // Ensure OAuth accounts have a fresh access_token before we hand it to
    // the SMTP transport. The earlier version skipped this and relied on
    // account.password, which is null for OAuth rows — every Outlook send
    // failed with `Missing credentials for "LOGIN"`.
    if (account.auth_type === "oauth") {
      account = await getValidAccessToken(account, adminClient);
    }

    const toAddresses = (Array.isArray(to) ? to : [to]).map((r: any) =>
      typeof r === "string" ? r : r.email
    );

    const isOAuth = account.auth_type === "oauth" && account.oauth_access_token;
    const isSSL = account.smtp_port === 465;
    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: isSSL,
      auth: isOAuth
        ? {
            type: "OAuth2",
            user: account.username || account.email,
            accessToken: account.oauth_access_token,
          }
        : {
            user: account.username,
            pass: account.password,
          },
      tls: { rejectUnauthorized: true },
    });

    const fromAddress = account.display_name
      ? `${account.display_name} <${account.email}>`
      : account.email;

    const mailOptions: any = {
      from: fromAddress,
      to: toAddresses.join(", "),
      subject: subject || "",
    };

    if (body_html) {
      mailOptions.text = body_text || "";
      mailOptions.html = body_html;
    } else {
      mailOptions.text = body_text || "";
    }

    if (cc && cc.length > 0) {
      const ccAddresses = (Array.isArray(cc) ? cc : [cc]).map((r: any) =>
        typeof r === "string" ? r : r.email
      );
      mailOptions.cc = ccAddresses.join(", ");
    }

    if (in_reply_to) {
      mailOptions.inReplyTo = in_reply_to;
      mailOptions.references = Array.isArray(references) ? references.join(" ") : (references || in_reply_to);
    }

    console.log(`[send-email] Sending to ${toAddresses.join(", ")} via ${account.smtp_host}:${account.smtp_port}${isOAuth ? " (XOAUTH2)" : ""}`);
    await transporter.sendMail(mailOptions);
    console.log(`[send-email] Sent successfully`);

    const toEmails = toAddresses.map((email: string) => ({ name: "", email }));

    await adminClient.from("emails").insert({
      user_id: userId,
      account_id: account.id,
      message_id: null,
      thread_id: (Array.isArray(references) ? references[0] : references) || in_reply_to || null,
      folder: "sent",
      from_name: account.display_name || "",
      from_email: account.email,
      to_emails: toEmails,
      cc_emails: cc || [],
      subject: subject || "",
      body_text: body_text || "",
      body_html: body_html || null,
      is_read: true,
      date: new Date().toISOString(),
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[send-email] Error:", err);
    return jsonResponse({ error: err.message || "Failed to send" }, 500);
  }
});
