import nodemailer from 'nodemailer';
import { getValidAccessToken } from './outlook-oauth-refresh.js';

const CONNECTION_TIMEOUT = 15000;

/**
 * Send an email via Resend HTTP API (works on hosts that block SMTP ports).
 * Falls back to direct SMTP if Resend API key is not configured.
 */
async function sendViaResend(account, { to, cc, subject, text, html, inReplyTo, references }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null; // No Resend key — skip

  const toAddresses = Array.isArray(to)
    ? to.map((r) => r.email || r)
    : [to];

  const body = {
    from: account.display_name
      ? `${account.display_name} <${process.env.RESEND_FROM_EMAIL || account.email}>`
      : (process.env.RESEND_FROM_EMAIL || account.email),
    to: toAddresses,
    subject: subject || '',
    text: text || undefined,
    html: html || undefined,
    reply_to: account.email, // replies go to user's real email
  };

  if (cc && cc.length > 0) {
    body.cc = Array.isArray(cc) ? cc.map((r) => r.email || r) : [cc];
  }

  if (inReplyTo) {
    body.headers = {
      'In-Reply-To': inReplyTo,
      'References': Array.isArray(references) ? references.join(' ') : (references || inReplyTo),
    };
  }

  console.log(`[email] Sending via Resend API to ${toAddresses.join(', ')}...`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Resend API error' }));
    throw new Error(err.message || `Resend API returned ${res.status}`);
  }

  const data = await res.json();
  console.log(`[email] Sent via Resend: ${data.id}`);
  return {
    messageId: data.id,
    accepted: toAddresses,
    rejected: [],
  };
}

/**
 * Send an email via direct SMTP.
 */
async function sendViaSmtp(account, mailOptions) {
  const isOAuth = account.auth_type === 'oauth' && account.oauth_access_token;
  const ports = isOAuth ? [587] : [465, 587]; // Outlook OAuth uses 587 with STARTTLS
  let lastError = null;

  for (const port of ports) {
    try {
      console.log(`[smtp] Trying ${account.smtp_host}:${port}${isOAuth ? ' (XOAUTH2)' : ''}...`);

      const auth = isOAuth
        ? { type: 'OAuth2', user: account.username || account.email, accessToken: account.oauth_access_token }
        : { user: account.username, pass: account.password };

      const transport = nodemailer.createTransport({
        host: account.smtp_host,
        port,
        secure: port === 465,
        auth,
        connectionTimeout: CONNECTION_TIMEOUT,
        greetingTimeout: CONNECTION_TIMEOUT,
        socketTimeout: 30000,
      });

      const info = await transport.sendMail(mailOptions);
      return {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
      };
    } catch (err) {
      console.log(`[smtp] Port ${port} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error('All SMTP attempts failed');
}

/**
 * Send an email. Tries Resend API first (HTTPS), falls back to direct SMTP.
 */
export async function sendEmail(account, { to, cc, subject, text, html, inReplyTo, references }) {
  // Refresh OAuth token if needed
  if (account.auth_type === 'oauth') {
    account = await getValidAccessToken(account);
  }
  // Try Resend API first (works on hosts that block SMTP)
  try {
    const resendResult = await sendViaResend(account, { to, cc, subject, text, html, inReplyTo, references });
    if (resendResult) return resendResult;
  } catch (err) {
    console.error(`[email] Resend failed: ${err.message}`);
    // Fall through to SMTP
  }

  // Build nodemailer options for SMTP fallback
  const mailOptions = {
    from: account.display_name
      ? `"${account.display_name}" <${account.email}>`
      : account.email,
    to: Array.isArray(to) ? to.map((r) => r.email || r).join(', ') : to,
    subject,
    text,
    html: html || undefined,
  };

  if (cc && cc.length > 0) {
    mailOptions.cc = Array.isArray(cc) ? cc.map((r) => r.email || r).join(', ') : cc;
  }

  if (inReplyTo) {
    mailOptions.inReplyTo = inReplyTo;
    mailOptions.references = references || inReplyTo;
  }

  try {
    return await sendViaSmtp(account, mailOptions);
  } catch (err) {
    // Give a clear error message about why sending fails
    if (err.message.includes('timeout') || err.message.includes('ECONNREFUSED')) {
      throw new Error(
        'Cannot send email — your hosting provider blocks outbound SMTP. ' +
        'Add a RESEND_API_KEY to your environment to send via Resend (https://resend.com).'
      );
    }
    throw err;
  }
}

/**
 * Validate SMTP connection credentials.
 */
export async function validateSmtpConnection(account) {
  if (account.auth_type === 'oauth') {
    account = await getValidAccessToken(account);
  }

  const isOAuth = account.auth_type === 'oauth' && account.oauth_access_token;
  const auth = isOAuth
    ? { type: 'OAuth2', user: account.username || account.email, accessToken: account.oauth_access_token }
    : { user: account.username, pass: account.password };

  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    auth,
    connectionTimeout: CONNECTION_TIMEOUT,
    greetingTimeout: CONNECTION_TIMEOUT,
    socketTimeout: 30000,
  });

  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
