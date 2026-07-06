// Platform-level transactional emails (welcome, receipts, payment failures,
// booking invites). Distinct from services/smtp.js which sends AS the user
// from their connected SMTP account — this sends FROM the platform, so we
// don't need per-user SMTP credentials.
//
// Provider strategy: ZorroMail first (see docs/zorromail-transactional-llm.md),
// with Resend as an automatic fallback when ZORROMAIL_API_KEY is unset OR
// ZorroMail returns a 5xx. That way an outage on either side doesn't stop
// receipts from going out.
//
// This file intentionally stays a single hub instead of splitting per-event
// modules — every template has the same envelope + escapeHtml + brand tone,
// and centralising them makes the "change the from-address in one place"
// operation trivial.

import { supabase } from './storage.js';
import { sendZorroMail } from './zorromail.js';

const RESEND_URL = 'https://api.resend.com/emails';

const BRAND_NAME = process.env.PLATFORM_BRAND_NAME || 'AI CEO';
const APP_URL = process.env.FRONTEND_URL || process.env.APP_URL || 'https://aiceo.com';

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
 * Try Resend as a fallback. Same shape as sendZorroMail return: never throws,
 * returns { ok, id?, error? }. Called from sendPlatformEmail on ZorroMail
 * miss (no key) or 5xx.
 */
async function sendResendEmail({ to, from, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };

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
      console.error(`[platform-email] Resend HTTP ${res.status}: ${errBody.slice(0, 400)}`);
      return { ok: false, error: `Resend HTTP ${res.status}` };
    }
    const data = await res.json();
    console.log(`[platform-email] Sent via Resend id=${data.id} to=${Array.isArray(to) ? to.join(',') : to}`);
    return { ok: true, id: data.id };
  } catch (err) {
    console.error(`[platform-email] Resend send failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Send a transactional email FROM the platform.
 *
 * Provider order:
 *   1. ZorroMail (if ZORROMAIL_API_KEY set) — primary.
 *   2. Resend    (if RESEND_API_KEY set)    — fallback on missing key or 5xx.
 *
 * 4xx from ZorroMail is a bug in our payload/domain config, NOT a transient
 * outage — do NOT fall through to Resend, because Resend would likely fail
 * for the same reason. Surface the error to the caller.
 *
 * Returns { ok, id?, provider?, error? } — never throws. Logs everything.
 */
async function sendPlatformEmail({ to, subject, html, text, idempotencyKey, replyTo }) {
  if (!to) return { ok: false, error: 'recipient missing' };
  if (!subject) return { ok: false, error: 'subject missing' };

  const zorroFrom = process.env.ZORROMAIL_FROM_EMAIL
    || process.env.PLATFORM_EMAIL_FROM
    || null;
  const resendFrom = process.env.PLATFORM_EMAIL_FROM
    || process.env.RESEND_FROM_EMAIL
    || null;

  // 1) ZorroMail first
  if (process.env.ZORROMAIL_API_KEY && zorroFrom) {
    const result = await sendZorroMail({
      from: zorroFrom,
      to,
      subject,
      html,
      text,
      replyTo,
      idempotencyKey,
    });
    if (result.ok) return { ok: true, id: result.id, provider: 'zorromail' };

    // 5xx (or network fail with no status) → fall through to Resend.
    // 4xx → do NOT fall through; the payload is bad, Resend will reject it too.
    const isTransient = !result.status || result.status >= 500;
    if (!isTransient) {
      console.warn(`[platform-email] ZorroMail ${result.status} — NOT falling through to Resend (payload/config issue)`);
      return { ok: false, error: result.error, provider: 'zorromail' };
    }
    console.warn(`[platform-email] ZorroMail failed (status=${result.status || 'network'}), trying Resend fallback…`);
  }

  // 2) Resend fallback
  if (process.env.RESEND_API_KEY && resendFrom) {
    const result = await sendResendEmail({ to, from: resendFrom, subject, html, text });
    if (result.ok) return { ok: true, id: result.id, provider: 'resend' };
    return { ok: false, error: result.error, provider: 'resend' };
  }

  // Neither provider configured. Log loudly so ops notices; return an error
  // so callers see the miss (though most call sites intentionally swallow it).
  const missing = !process.env.ZORROMAIL_API_KEY && !process.env.RESEND_API_KEY
    ? 'no provider key set (ZORROMAIL_API_KEY or RESEND_API_KEY)'
    : 'no verified from address (ZORROMAIL_FROM_EMAIL or RESEND_FROM_EMAIL)';
  console.warn(`[platform-email] Not sent — ${missing}`);
  return { ok: false, error: missing };
}

// ──────────────────────────────────────────────────────────────
// Shared HTML helpers — small, on purpose. Every template is a
// single-column card wrapped in the same brand envelope.
// ──────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

/**
 * Wrap body content in the shared brand shell — same header/footer for
 * every transactional email so the from-address + tone stay coherent.
 */
function wrapHtml({ preview, bodyHtml, footerHtml }) {
  const previewSpan = preview
    ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preview)}</span>`
    : '';
  const footer = footerHtml || `
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;line-height:1.5;">
      Sent by ${escapeHtml(BRAND_NAME)} · <a href="${escapeAttr(APP_URL)}" style="color:#9ca3af;">${escapeAttr(APP_URL.replace(/^https?:\/\//, ''))}</a>
    </p>`;
  return `${previewSpan}
<div style="font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;color:#1a1a2e;background:#ffffff;">
${bodyHtml}
${footer}
</div>`.trim();
}

/**
 * Currency formatter — Stripe amounts are integer cents.
 * Falls back to a raw string if Intl is unavailable.
 */
function formatMoney(amountCents, currency = 'usd') {
  const amount = (Number(amountCents) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

// ──────────────────────────────────────────────────────────────
// Public triggers — one per user-facing lifecycle event.
// Each is safe to call from a webhook handler: never throws,
// always returns { ok, id?, error? }.
// ──────────────────────────────────────────────────────────────

/**
 * WELCOME — sent once, right after signup. Callers should dedupe via
 * the welcome_emails_sent table (see routes/auth-notify.js).
 */
export async function sendWelcomeEmail({ email, displayName }) {
  if (!email) return { ok: false, error: 'no recipient email' };
  const safeName = (displayName || '').trim() || 'there';
  const subject = `Welcome to ${BRAND_NAME}`;

  const text = [
    `Hi ${safeName},`,
    '',
    `Welcome to ${BRAND_NAME}. Your account is live.`,
    '',
    `Log in and get started here: ${APP_URL}`,
    '',
    'If you have any questions, just reply to this email — a real person reads them.',
    '',
    `— The ${BRAND_NAME} team`,
  ].join('\n');

  const html = wrapHtml({
    preview: `Welcome to ${BRAND_NAME} — your account is live.`,
    bodyHtml: `
      <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;">Welcome to ${escapeHtml(BRAND_NAME)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Hi ${escapeHtml(safeName)},</p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">
        Your account is live. When you're ready, jump in and set up your first workspace.
      </p>
      <p style="margin:0 0 22px;">
        <a href="${escapeAttr(APP_URL)}" style="display:inline-block;padding:12px 22px;background:#0a0a0a;color:#fff;font-weight:700;text-decoration:none;border-radius:10px;">Open ${escapeHtml(BRAND_NAME)}</a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0 0 6px;">
        Any questions? Just reply to this email — a real person reads them.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">— The ${escapeHtml(BRAND_NAME)} team</p>`,
  });

  return sendPlatformEmail({
    to: email,
    subject,
    html,
    text,
    idempotencyKey: `welcome:${email.toLowerCase()}`,
  });
}

/**
 * BOOKING INVITE — setup fee paid, book your onboarding call.
 * (Kept for backwards compatibility with the existing webhook.)
 */
export async function sendBookingInvite({ userId, plan, calendlyUrl, displayName }) {
  const email = await getAuthEmail(userId);
  if (!email) {
    console.warn(`[platform-email] No auth email for user ${userId} — cannot send booking invite`);
    return { ok: false, error: 'no recipient email' };
  }

  const planLabel = plan === 'diamond' ? 'Diamond' : 'Complete';
  const subject = `Your ${planLabel} setup is paid — book your onboarding call`;
  const safeName = (displayName || '').trim() || 'there';

  const text = [
    `Hi ${safeName},`,
    '',
    `Thanks for joining the ${BRAND_NAME} ${planLabel} plan. Your setup fee just landed.`,
    '',
    `The next step is your onboarding call. Pick a time that works for you here:`,
    calendlyUrl || '(booking link will be sent shortly)',
    '',
    `On the call we will configure your ${BRAND_NAME} around your business, then unlock the platform on your monthly plan right after.`,
    '',
    'Talk soon,',
    `The ${BRAND_NAME} team`,
  ].join('\n');

  const html = wrapHtml({
    preview: `Setup paid — book your onboarding call`,
    bodyHtml: `
      <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;">Setup paid — book your onboarding call</h1>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Hi ${escapeHtml(safeName)},</p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">
        Thanks for joining the ${escapeHtml(BRAND_NAME)} <strong>${escapeHtml(planLabel)}</strong> plan. Your setup fee just landed.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 22px;">
        The next step is your onboarding call. Pick a time that works for you:
      </p>
      ${calendlyUrl
        ? `<p style="margin:0 0 28px;"><a href="${escapeAttr(calendlyUrl)}" style="display:inline-block;padding:12px 22px;background:#0a0a0a;color:#fff;font-weight:700;text-decoration:none;border-radius:10px;">Book your call</a></p>`
        : '<p style="font-size:14px;color:#6b7280;margin:0 0 28px;">Your booking link will arrive in a follow-up shortly.</p>'}
      <p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0 0 6px;">
        On the call we will configure your ${escapeHtml(BRAND_NAME)} around your business, then unlock the platform on your monthly plan right after.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">— The ${escapeHtml(BRAND_NAME)} team</p>`,
  });

  return sendPlatformEmail({
    to: email,
    subject,
    html,
    text,
    idempotencyKey: `booking:${userId}:${plan}`,
  });
}

/**
 * SUBSCRIPTION ACTIVATED — fired from checkout.session.completed when
 * mode=subscription (recurring plan just activated). "Your plan is live"
 * receipt with the first invoice's amount.
 */
export async function sendSubscriptionActivatedEmail({ userId, planLabel, tierLabel, amountCents, currency, invoiceUrl, displayName }) {
  const email = await getAuthEmail(userId);
  if (!email) return { ok: false, error: 'no recipient email' };

  const safeName = (displayName || '').trim() || 'there';
  const label = planLabel || 'Your plan';
  const money = amountCents ? formatMoney(amountCents, currency) : null;
  const subject = `${label} is live${money ? ` — receipt for ${money}` : ''}`;

  const text = [
    `Hi ${safeName},`,
    '',
    `Your ${label}${tierLabel ? ` (${tierLabel})` : ''} plan on ${BRAND_NAME} is now active.`,
    money ? `First charge: ${money}.` : '',
    invoiceUrl ? `View your receipt: ${invoiceUrl}` : '',
    '',
    `Head to ${APP_URL} to start using it.`,
    '',
    `— The ${BRAND_NAME} team`,
  ].filter(Boolean).join('\n');

  const html = wrapHtml({
    preview: `${label} is live${money ? ` — ${money}` : ''}`,
    bodyHtml: `
      <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;">${escapeHtml(label)} is live</h1>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Hi ${escapeHtml(safeName)},</p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">
        Your <strong>${escapeHtml(label)}</strong>${tierLabel ? ` (${escapeHtml(tierLabel)})` : ''} plan on ${escapeHtml(BRAND_NAME)} is now active.
      </p>
      ${money ? `<p style="font-size:15px;color:#374151;margin:0 0 22px;">First charge: <strong>${escapeHtml(money)}</strong>.</p>` : ''}
      <p style="margin:0 0 28px;">
        <a href="${escapeAttr(APP_URL)}" style="display:inline-block;padding:12px 22px;background:#0a0a0a;color:#fff;font-weight:700;text-decoration:none;border-radius:10px;">Open ${escapeHtml(BRAND_NAME)}</a>
        ${invoiceUrl ? `<a href="${escapeAttr(invoiceUrl)}" style="display:inline-block;padding:12px 22px;margin-left:8px;background:#f3f4f6;color:#111;font-weight:600;text-decoration:none;border-radius:10px;">View receipt</a>` : ''}
      </p>
      <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">— The ${escapeHtml(BRAND_NAME)} team</p>`,
  });

  return sendPlatformEmail({
    to: email,
    subject,
    html,
    text,
    idempotencyKey: `sub-active:${userId}:${planLabel || 'plan'}`,
  });
}

/**
 * RENEWAL RECEIPT — fired from invoice.paid with billing_reason='subscription_cycle'.
 * The recurring monthly charge went through.
 */
export async function sendRenewalReceiptEmail({ userId, planLabel, amountCents, currency, invoiceUrl, periodEnd, displayName }) {
  const email = await getAuthEmail(userId);
  if (!email) return { ok: false, error: 'no recipient email' };

  const safeName = (displayName || '').trim() || 'there';
  const label = planLabel || 'your plan';
  const money = formatMoney(amountCents || 0, currency);
  const nextPeriod = periodEnd ? new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const subject = `${BRAND_NAME} renewal — ${money}`;

  const text = [
    `Hi ${safeName},`,
    '',
    `Your ${label} renewed for ${money}. Thanks for staying with ${BRAND_NAME}.`,
    nextPeriod ? `Next renewal: ${nextPeriod}.` : '',
    invoiceUrl ? `Receipt: ${invoiceUrl}` : '',
    '',
    `— The ${BRAND_NAME} team`,
  ].filter(Boolean).join('\n');

  const html = wrapHtml({
    preview: `Renewal receipt — ${money}`,
    bodyHtml: `
      <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;">Renewal receipt</h1>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Hi ${escapeHtml(safeName)},</p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">
        Your <strong>${escapeHtml(label)}</strong> just renewed for <strong>${escapeHtml(money)}</strong>. Thanks for staying with ${escapeHtml(BRAND_NAME)}.
      </p>
      ${nextPeriod ? `<p style="font-size:14px;color:#6b7280;margin:0 0 22px;">Next renewal: ${escapeHtml(nextPeriod)}.</p>` : ''}
      ${invoiceUrl ? `<p style="margin:0 0 28px;"><a href="${escapeAttr(invoiceUrl)}" style="display:inline-block;padding:12px 22px;background:#f3f4f6;color:#111;font-weight:600;text-decoration:none;border-radius:10px;">View receipt</a></p>` : ''}
      <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">— The ${escapeHtml(BRAND_NAME)} team</p>`,
  });

  return sendPlatformEmail({
    to: email,
    subject,
    html,
    text,
    // include invoice id-ish key via period so a retry of the same cycle
    // is deduped by ZorroMail server-side.
    idempotencyKey: `renewal:${userId}:${periodEnd || 'cycle'}`,
  });
}

/**
 * PAYMENT FAILED — fired from invoice.payment_failed. Tells the user to
 * update their card. billingPortalUrl is optional (frontend link that
 * opens the Stripe billing portal).
 */
export async function sendPaymentFailedEmail({ userId, planLabel, amountCents, currency, billingPortalUrl, displayName }) {
  const email = await getAuthEmail(userId);
  if (!email) return { ok: false, error: 'no recipient email' };

  const safeName = (displayName || '').trim() || 'there';
  const label = planLabel || 'your plan';
  const money = amountCents ? formatMoney(amountCents, currency) : null;
  const subject = `${BRAND_NAME} — we couldn't charge your card`;

  const text = [
    `Hi ${safeName},`,
    '',
    `We tried to charge ${money ? money : 'your card'} for ${label} on ${BRAND_NAME}, but it didn't go through.`,
    '',
    'To keep your account active, please update your payment method:',
    billingPortalUrl || `${APP_URL}/settings/billing`,
    '',
    'If you leave this unresolved for a few days, Stripe will retry automatically — after which your access may pause.',
    '',
    `— The ${BRAND_NAME} team`,
  ].join('\n');

  const html = wrapHtml({
    preview: `We couldn't charge your card${money ? ` (${money})` : ''}`,
    bodyHtml: `
      <h1 style="font-size:22px;font-weight:800;margin:0 0 16px;">We couldn't charge your card</h1>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">Hi ${escapeHtml(safeName)},</p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 14px;">
        We tried to charge ${money ? `<strong>${escapeHtml(money)}</strong>` : 'your card'} for <strong>${escapeHtml(label)}</strong> on ${escapeHtml(BRAND_NAME)}, but it didn't go through.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 22px;">
        To keep your account active, please update your payment method:
      </p>
      <p style="margin:0 0 22px;">
        <a href="${escapeAttr(billingPortalUrl || `${APP_URL}/settings/billing`)}" style="display:inline-block;padding:12px 22px;background:#dc2626;color:#fff;font-weight:700;text-decoration:none;border-radius:10px;">Update payment method</a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 6px;">
        If you leave this unresolved for a few days, Stripe will retry automatically — after which your access may pause.
      </p>
      <p style="font-size:14px;color:#6b7280;margin:24px 0 0;">— The ${escapeHtml(BRAND_NAME)} team</p>`,
  });

  return sendPlatformEmail({
    to: email,
    subject,
    html,
    text,
    idempotencyKey: `payfail:${userId}:${amountCents || 0}:${currency || 'usd'}`,
  });
}

// Exported for tests / debugging — not intended for direct use from webhooks.
export { sendPlatformEmail, getAuthEmail };
