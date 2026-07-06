// ZorroMail transactional email — thin API wrapper.
//
// Reference: docs/zorromail-transactional-llm.md
//
// This module is the raw provider layer. It does NOT own retries, templates,
// or "which user to email". Callers (services/booking-email.js) compose the
// message and pick the recipient; we handle auth, JSON shape, and error
// translation only.
//
// Never throws — callers get { ok, id?, suppressed?, error?, status? } so the
// same call site can also fall through to another provider (Resend) on failure
// without a try/catch.

const ZORRO_URL = 'https://api.zorromail.app/tx/v1/messages';

/**
 * Send one transactional email via ZorroMail.
 *
 * @param {object} msg
 * @param {string} msg.from - verified sending address (e.g. receipts@yourdomain.com)
 * @param {string|string[]} msg.to
 * @param {string} msg.subject
 * @param {string} [msg.html]
 * @param {string} [msg.text]
 * @param {string[]} [msg.cc]
 * @param {string[]} [msg.bcc]
 * @param {string} [msg.replyTo]
 * @param {object} [msg.headers]
 * @param {Array<{filename, contentBase64, contentType}>} [msg.attachments]
 * @param {string} [msg.idempotencyKey] - optional; pass for anything triggered
 *   by webhooks or retryable jobs so ZorroMail dedupes retries server-side.
 * @returns {Promise<{ok: boolean, id?: string, suppressed?: string[], error?: string, status?: number}>}
 */
export async function sendZorroMail({
  from,
  to,
  subject,
  html,
  text,
  cc,
  bcc,
  replyTo,
  headers,
  attachments,
  idempotencyKey,
}) {
  const apiKey = process.env.ZORROMAIL_API_KEY;
  if (!apiKey) return { ok: false, error: 'ZORROMAIL_API_KEY not configured' };
  if (!from) return { ok: false, error: 'from address missing' };
  if (!to) return { ok: false, error: 'recipient missing' };
  if (!subject) return { ok: false, error: 'subject missing' };
  if (!html && !text) return { ok: false, error: 'html or text required' };

  const body = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (cc && cc.length > 0) body.cc = Array.isArray(cc) ? cc : [cc];
  if (bcc && bcc.length > 0) body.bcc = Array.isArray(bcc) ? bcc : [bcc];
  if (replyTo) body.replyTo = replyTo;
  if (headers && Object.keys(headers).length > 0) body.headers = headers;
  if (Array.isArray(attachments) && attachments.length > 0) body.attachments = attachments;

  const reqHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) reqHeaders['Idempotency-Key'] = idempotencyKey;

  try {
    const res = await fetch(ZORRO_URL, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(body),
    });

    // 202 Accepted is the documented success. Anything 2xx we treat as ok.
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const recips = Array.isArray(body.to) ? body.to.join(',') : body.to;
      console.log(`[zorromail] Sent id=${data.id || 'n/a'} to=${recips}${data.suppressedRecipients?.length ? ` suppressed=${data.suppressedRecipients.length}` : ''}`);
      return {
        ok: true,
        id: data.id,
        suppressed: data.suppressedRecipients || [],
        status: res.status,
      };
    }

    // Non-2xx: read the error body once, log, translate.
    const errText = await res.text().catch(() => '');
    console.error(`[zorromail] HTTP ${res.status}: ${errText.slice(0, 400)}`);
    return {
      ok: false,
      status: res.status,
      error: `ZorroMail HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`,
    };
  } catch (err) {
    console.error(`[zorromail] Send failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Cheap runtime check — true only when the env is configured. Callers use
 * this to decide whether to attempt ZorroMail at all (vs jumping straight
 * to the Resend fallback).
 */
export function isZorroMailConfigured() {
  return !!(process.env.ZORROMAIL_API_KEY && (process.env.ZORROMAIL_FROM_EMAIL || process.env.PLATFORM_EMAIL_FROM));
}
