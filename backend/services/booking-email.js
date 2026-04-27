// Platform-level transactional emails (e.g., "you paid the setup fee, please
// book your call"). Distinct from services/smtp.js which sends AS the user
// from their connected SMTP account — this sends FROM the platform via
// Resend HTTP API, so we don't need per-user SMTP credentials.

import { supabase } from './storage.js';

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Look up an auth user's email address.
 * Returns null if missing — caller decides whether that's fatal.
 */
async function getAuthEmail(userId) {
  if (!userId || userId === 'anonymous') return null;
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) return null;
    return data?.user?.email || null;
  } catch {
    return null;
  }
}

/**
 * Send a transactional email FROM the platform via Resend.
 * Returns { ok: boolean, id?, error? } — never throws so callers don't
 * have to wrap in try/catch on every invocation. Logs everything.
 */
async function sendPlatformEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PLATFORM_EMAIL_FROM
    || process.env.RESEND_FROM_EMAIL
    || null;

  if (!apiKey) {
    console.warn('[booking-email] RESEND_API_KEY not set — skipping email send');
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  if (!from) {
    console.warn('[booking-email] PLATFORM_EMAIL_FROM (or RESEND_FROM_EMAIL) not set — skipping');
    return { ok: false, error: 'PLATFORM_EMAIL_FROM not configured' };
  }
  if (!to) {
    return { ok: false, error: 'recipient missing' };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: html || undefined,
        text: text || undefined,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[booking-email] Resend ${res.status}: ${errBody.slice(0, 400)}`);
      return { ok: false, error: `Resend HTTP ${res.status}` };
    }
    const data = await res.json();
    console.log(`[booking-email] Sent to ${Array.isArray(to) ? to.join(',') : to} (id=${data.id})`);
    return { ok: true, id: data.id };
  } catch (err) {
    console.error(`[booking-email] Send failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Trigger: setup fee just paid for a given user. Send the "book your
 * onboarding call" email with the Calendly link.
 *
 * Pulls the recipient address from auth.users; never throws. Designed
 * to be called from inside a Stripe webhook handler where we don't want
 * email failures to mask payment success.
 */
export async function sendBookingInvite({ userId, plan, calendlyUrl, displayName }) {
  const email = await getAuthEmail(userId);
  if (!email) {
    console.warn(`[booking-email] No auth email for user ${userId} — cannot send booking invite`);
    return { ok: false, error: 'no recipient email' };
  }

  // Customise the subject + body slightly per plan tier (Diamond gets a
  // higher-touch tone). Keep it short — the call-to-action is the link.
  const planLabel = plan === 'diamond' ? 'Diamond' : 'Complete';
  const subject = `Your ${planLabel} setup is paid — book your onboarding call`;
  const safeName = (displayName || '').trim() || 'there';

  const text = [
    `Hi ${safeName},`,
    '',
    `Thanks for joining the AI CEO ${planLabel} plan. Your setup fee just landed.`,
    '',
    `The next step is your onboarding call. Pick a time that works for you here:`,
    calendlyUrl || '(booking link will be sent shortly)',
    '',
    'On the call we will configure your AI CEO around your business, then unlock the platform on your monthly plan right after.',
    '',
    'Talk soon,',
    'The AI CEO team',
  ].join('\n');

  const html = `
<div style="font-family: 'Inter', system-ui, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
  <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">Setup paid — book your onboarding call</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #374151; margin: 0 0 14px;">
    Hi ${escapeHtml(safeName)},
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #374151; margin: 0 0 14px;">
    Thanks for joining the AI CEO <strong>${planLabel}</strong> plan. Your setup fee just landed.
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #374151; margin: 0 0 22px;">
    The next step is your onboarding call. Pick a time that works for you:
  </p>
  ${calendlyUrl
    ? `<p style="margin: 0 0 28px;"><a href="${escapeAttr(calendlyUrl)}" style="display: inline-block; padding: 12px 22px; background: #0a0a0a; color: #fff; font-weight: 700; text-decoration: none; border-radius: 10px;">Book your call</a></p>`
    : '<p style="font-size: 14px; color: #6b7280; margin: 0 0 28px;">Your booking link will arrive in a follow-up shortly.</p>'}
  <p style="font-size: 14px; line-height: 1.6; color: #6b7280; margin: 0 0 6px;">
    On the call we will configure your AI CEO around your business, then unlock the platform on your monthly plan right after.
  </p>
  <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0;">— The AI CEO team</p>
</div>`.trim();

  return sendPlatformEmail({ to: email, subject, html, text });
}

// Minimal HTML-escape — only the contexts we actually use here.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) {
  return escapeHtml(s);
}
