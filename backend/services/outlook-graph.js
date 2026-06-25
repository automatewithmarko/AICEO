// Microsoft Graph send-mail. Replaces direct SMTP for Outlook OAuth
// accounts because Microsoft has been disabling SMTP AUTH at the
// mailbox level — `transport.sendMail` returns
//   "535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication
//    is disabled for the Mailbox"
// even with a valid XOAUTH2 access token. Graph `sendMail` works over
// HTTPS, doesn't need port 587 outbound, and uses the same OAuth
// access_token (when issued with the `Mail.Send` scope).

const GRAPH_SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

function toRecipientList(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr.map((r) => ({
    emailAddress: { address: typeof r === 'string' ? r : (r.email || r.address) },
  }));
}

/**
 * Send an email via Microsoft Graph. The caller is responsible for
 * ensuring `account.oauth_access_token` is fresh (use
 * `getValidAccessToken` from outlook-oauth-refresh.js first).
 */
export async function sendViaGraph(account, { to, cc, subject, text, html, inReplyTo, references, attachments }) {
  if (account.auth_type !== 'oauth' || !account.oauth_access_token) {
    throw new Error('Graph send requires an OAuth account with a valid access_token');
  }

  const message = {
    subject: subject || '',
    body: {
      contentType: html ? 'HTML' : 'Text',
      content: html || text || '',
    },
    toRecipients: toRecipientList(to),
  };
  if (cc && cc.length) message.ccRecipients = toRecipientList(cc);

  if (inReplyTo) {
    // Graph honours these headers for threading. References must be a
    // single space-separated string per RFC 5322.
    const refStr = Array.isArray(references) ? references.join(' ') : (references || inReplyTo);
    message.internetMessageHeaders = [
      { name: 'In-Reply-To', value: inReplyTo },
      { name: 'References', value: refStr },
    ];
  }

  // Graph wants fileAttachment with name, contentType, contentBytes (base64).
  // The 3MB-per-attachment inline limit is fine for typical email payloads;
  // anything bigger should use the upload-session flow which we don't need yet.
  if (Array.isArray(attachments) && attachments.length > 0) {
    message.attachments = attachments.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.mimeType,
      contentBytes: a.content,
    }));
  }

  const recipientLog = message.toRecipients.map((r) => r.emailAddress.address).join(', ');
  console.log(`[graph] Sending mail to ${recipientLog} as ${account.email}`);

  const res = await fetch(GRAPH_SEND_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${account.oauth_access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  // Graph returns 202 Accepted with no body on success.
  if (res.status === 202) {
    console.log('[graph] Sent successfully');
    return {
      messageId: null,             // Graph doesn't surface a message id at send time
      accepted: message.toRecipients.map((r) => r.emailAddress.address),
      rejected: [],
    };
  }

  // Surface Graph's error code so a missing scope / consent issue is obvious.
  let detail = `Graph sendMail returned ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error?.message) {
      detail = `${body.error.code || 'GraphError'}: ${body.error.message}`;
    }
  } catch { /* not JSON */ }
  throw new Error(detail);
}
