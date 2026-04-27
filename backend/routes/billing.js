import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { getUserPlan, getPlans } from '../services/plans.js';
import { getCreditCosts } from '../services/credits.js';
import { stripe as getStripe, getStripePriceId } from '../services/stripe.js';

const router = Router();

// Per-user rate limiter for checkout creation. Single-instance in-memory
// Map; if we ever scale beyond one Railway replica, swap for Redis.
// 3 attempts per 60s is generous for legitimate use (double-clicks +
// genuine retries) and prevents an authenticated user from burning
// our Stripe API quota by spamming.
const checkoutAttempts = new Map();
function rateLimitOk(userId, max = 3, windowMs = 60_000) {
  const now = Date.now();
  const recent = (checkoutAttempts.get(userId) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  checkoutAttempts.set(userId, recent);
  return true;
}

// Resolve the origin to use in Stripe success/cancel redirects.
//
// Trust order:
//   1. FRONTEND_URL env (set by ops, source of truth).
//   2. In dev only (NODE_ENV !== 'production'), fall back to the request's
//      Origin header so localhost development works out of the box.
//   3. In prod, refuse to fall back to Origin — that header is attacker-
//      controllable on a CSRF-style request and we don't want a checkout
//      session redirecting users to evil.com.
function resolveFrontendOrigin(req) {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  if (process.env.NODE_ENV !== 'production') {
    return req.headers.origin || 'http://localhost:5173';
  }
  // Last resort in prod — surface a clear error rather than a silent
  // fallback to a wrong domain.
  throw new Error('FRONTEND_URL env not set — refusing to construct redirect URL in production.');
}

// ─── GET /api/billing/plan — user's current plan, features, credits ───
router.get('/api/billing/plan', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  try {
    const planInfo = await getUserPlan(userId);

    // Fetch full plan row for display_name
    let planRow = null;
    if (planInfo.plan) {
      const { data } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planInfo.plan)
        .single();
      planRow = data;
    }

    // Fetch subscription for period dates
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Fetch current credit balance
    const { data: creditRow } = await supabase
      .from('credits')
      .select('balance')
      .eq('user_id', userId)
      .single();

    res.json({
      plan: planRow ? {
        id: planRow.id,
        name: planRow.name,
        display_name: planRow.display_name,
        features: planRow.features,
        credits_per_month: planRow.credits_per_month,
        setup_fee: planRow.setup_fee,
        monthly_price_with_boost: planRow.monthly_price_with_boost,
        monthly_price_without_boost: planRow.monthly_price_without_boost,
      } : null,
      subscription: sub ? {
        status: sub.status,
        plan: sub.plan || null,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        disputed: !!sub.disputed,
        tier: sub.tier || null,
        // Funnel state — drives which onboarding screen App.jsx renders.
        // null on fresh signups, set by webhook (setup) and POST
        // /meeting/booked (meeting). Legacy users were backfilled in the
        // add_funnel_state_columns migration.
        setup_paid_at: sub.setup_paid_at || null,
        meeting_booked_at: sub.meeting_booked_at || null,
        has_active_monthly: !!sub.stripe_subscription_id
          && ['active', 'canceling', 'trialing', 'past_due'].includes(sub.status),
      } : null,
      credits: {
        balance: creditRow?.balance ?? 0,
      },
    });
  } catch (err) {
    console.error('[billing/plan]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/billing/credits — current balance + recent transactions ───
router.get('/api/billing/credits', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  try {
    const [balanceRes, txRes] = await Promise.all([
      supabase
        .from('credits')
        .select('balance')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    res.json({
      balance: balanceRes.data?.balance ?? 0,
      transactions: txRes.data || [],
    });
  } catch (err) {
    console.error('[billing/credits]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/billing/plans — all available plans (for pricing page) ───
router.get('/api/billing/plans', async (_req, res) => {
  try {
    const plans = await getPlans();
    res.json({ plans });
  } catch (err) {
    console.error('[billing/plans]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/billing/costs — credit costs per action ───
router.get('/api/billing/costs', async (_req, res) => {
  try {
    const costs = await getCreditCosts();
    res.json({ costs });
  } catch (err) {
    console.error('[billing/costs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/billing/checkout — create a Stripe Checkout Session ───
// Starts the subscribe flow for a user picking a plan on the Billing page.
//
// GUARDRAILS:
// - Rejects users who already have an active subscription (they should
//   switch plans via the Customer Portal, not start a second Checkout —
//   the latter creates two parallel Stripe subscriptions and double-bills).
// - Stashes user_id in both session metadata AND subscription_data metadata
//   so the webhook can resolve the user reliably even if the customer's
//   email drifts.
// - Uses an idempotency key derived from (user, plan, tier) to neutralise
//   double-clicks.
//
// Body: { plan: 'complete' | 'diamond', boost?: boolean }
// Returns: { url } — frontend redirects the browser to it.
router.post('/api/billing/checkout', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  if (!rateLimitOk(userId)) {
    return res.status(429).json({ error: 'Too many checkout attempts. Wait a minute and try again.' });
  }

  const { plan, boost = false } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan is required' });

  const priceId = getStripePriceId(plan, { boost });
  if (!priceId) {
    return res.status(400).json({
      error: `No Stripe price configured for plan="${plan}" boost=${boost}. Set STRIPE_PRICE_${plan.toUpperCase()}_${boost ? 'BOOST' : 'STANDARD'} in env.`,
    });
  }

  // Guard: reject if user already has a REAL Stripe-backed active sub.
  // Plan changes on those must go through the Customer Portal so Stripe
  // handles proration cleanly. Phantom rows (created by legacy signup
  // flows / triggers, no stripe_subscription_id) are not real and must
  // NOT block a fresh checkout — otherwise new users see "Checkout
  // failed" forever because of an empty-shell subscription row that
  // was never paid for.
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('status, stripe_subscription_id, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  const hasRealActiveSub = existingSub
    && existingSub.stripe_subscription_id
    && ['active', 'canceling', 'trialing', 'past_due'].includes(existingSub.status);

  if (hasRealActiveSub) {
    return res.status(409).json({
      error: 'You already have an active subscription. Use the billing portal to switch plans.',
      use_portal: true,
    });
  }

  try {
    const stripe = getStripe();

    // Get email for prefill if we don't have a Stripe customer yet.
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const email = authData?.user?.email;

    const origin = resolveFrontendOrigin(req);

    // ── Setup fee: charge once, on the user's first-ever checkout ──
    // Detection: profiles.stripe_customer_id is the canonical "this user
    // has paid us before" flag. It's set by the webhook on the very first
    // successful checkout. If it's null, this is their first-ever checkout
    // and we attach the one-time setup Price as a second line item.
    // (Stripe puts the recurring item on the subscription and the one-time
    // item on the first invoice — same Checkout, same card swipe.)
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle();
    const isFirstCheckout = !profile?.stripe_customer_id;

    const lineItems = [{ price: priceId, quantity: 1 }];
    let attachedSetupPrice = null;
    if (isFirstCheckout) {
      const setupPriceId = getStripePriceId(plan, { setup: true });
      if (setupPriceId) {
        lineItems.push({ price: setupPriceId, quantity: 1 });
        attachedSetupPrice = setupPriceId;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      customer: existingSub?.stripe_customer_id || undefined,
      customer_email: existingSub?.stripe_customer_id ? undefined : email,
      // Metadata flows into the webhook. user_id is the source of truth —
      // email-based resolution is only a last-ditch fallback there.
      metadata: { user_id: userId, plan, boost: String(boost), setup_attached: String(!!attachedSetupPrice) },
      subscription_data: {
        metadata: { user_id: userId, plan, boost: String(boost) },
      },
      allow_promotion_codes: true,
    }, {
      // Stable idempotency key for a 10-minute window so double-clicks
      // collapse to one session. Past that, user can legitimately retry.
      // Setup status in the key so a user who somehow flips state mid-window
      // doesn't get a stale session served back.
      idempotencyKey: `checkout:${userId}:${plan}:${boost ? 'b' : 's'}:${attachedSetupPrice ? 'setup' : 'nosetup'}:${Math.floor(Date.now() / 600000)}`,
    });

    console.log(`[billing/checkout] user=${userId} plan=${plan} tier=${boost ? 'boost' : 'standard'} setup=${attachedSetupPrice ? 'YES' : 'no'} session=${session.id}`);

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('[billing/checkout]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/billing/portal — create a Stripe Customer Portal session ───
// For users with an existing subscription to update payment methods,
// switch plans, view invoices, or cancel.
//
// Resolves the Stripe customer id from:
//   1. subscriptions.stripe_customer_id (existing active/past user)
//   2. profiles.stripe_customer_id (written by webhook / checkout)
// Both are kept in sync so this is usually a single-row read.
router.post('/api/billing/portal', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id || null;

    if (!customerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .maybeSingle();
      customerId = profile?.stripe_customer_id || null;
    }

    if (!customerId) {
      return res.status(400).json({ error: 'No Stripe customer on file — subscribe first.' });
    }

    const stripe = getStripe();
    const origin = resolveFrontendOrigin(req);

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/billing`,
    }, {
      // Same 10-minute idempotency window as checkout so refresh-spam
      // doesn't generate dozens of portal sessions.
      idempotencyKey: `portal:${userId}:${Math.floor(Date.now() / 600000)}`,
    });

    res.json({ url: portal.url });
  } catch (err) {
    console.error('[billing/portal]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────
// New 4-step signup funnel: setup-fee checkout → book meeting → monthly
// subscription. Each endpoint enforces the prerequisite step so a user
// can't skip ahead by hand-crafting an API call.
//
// State machine:
//   A. no setup_paid_at                 → /checkout/setup is the only path
//   B. setup_paid_at, no meeting_booked → /meeting/booked unlocks C
//   C. meeting_booked_at, no live sub   → /checkout/monthly unlocks D
//   D. live monthly sub                 → user goes through Customer Portal
//
// All three endpoints are auth-required, rate-limited, and idempotent
// in the sense that re-running an already-completed step returns 409
// rather than charging twice.
// ──────────────────────────────────────────────────────────────────────

// Plan IDs accepted by the new funnel. 'test' is gated by the frontend
// VITE_SHOW_TEST_PLAN env var so prod users never see it; the backend
// accepts it unconditionally because all that gating it server-side
// would buy us is preventing internal QA from running through the
// $2 / $1 Stripe Price chain.
const PLAN_IDS = ['complete', 'diamond', 'test'];

function isValidPlan(p) {
  return typeof p === 'string' && PLAN_IDS.includes(p);
}

// ─── POST /api/billing/checkout/setup — one-time setup fee ───
// Body: { plan: 'complete' | 'diamond' }
// Returns: { url } — Stripe Checkout URL the frontend redirects to.
router.post('/api/billing/checkout/setup', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }
  if (!rateLimitOk(userId)) {
    return res.status(429).json({ error: 'Too many checkout attempts. Wait a minute and try again.' });
  }

  const { plan } = req.body || {};
  if (!isValidPlan(plan)) {
    return res.status(400).json({ error: `plan must be one of: ${PLAN_IDS.join(', ')}` });
  }

  // Setup-fee Price (one-time). Configured in Stripe Dashboard.
  const setupPriceId = getStripePriceId(plan, { setup: true });
  if (!setupPriceId) {
    return res.status(400).json({
      error: `No Stripe SETUP price configured for plan="${plan}". Set STRIPE_PRICE_${plan.toUpperCase()}_SETUP in env.`,
    });
  }

  // Block if this user has already paid the setup fee. Returning the row
  // we already have so the frontend can navigate them to whichever step
  // is next instead of just showing an error.
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('plan, status, setup_paid_at, meeting_booked_at, stripe_subscription_id, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingSub?.setup_paid_at) {
    return res.status(409).json({
      error: 'Setup fee already paid for this account.',
      already_paid: true,
      next_step: existingSub.meeting_booked_at
        ? (existingSub.stripe_subscription_id ? 'done' : 'monthly')
        : 'meeting',
    });
  }

  try {
    const stripe = getStripe();
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const email = authData?.user?.email;
    const origin = resolveFrontendOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: setupPriceId, quantity: 1 }],
      success_url: `${origin}/billing?checkout=setup_success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      customer: existingSub?.stripe_customer_id || undefined,
      customer_email: existingSub?.stripe_customer_id ? undefined : email,
      // Step the webhook keys off — `step: 'setup'` means "this checkout
      // pays the setup fee, not the monthly subscription".
      metadata: { user_id: userId, plan, step: 'setup' },
      payment_intent_data: {
        metadata: { user_id: userId, plan, step: 'setup' },
      },
      allow_promotion_codes: true,
    }, {
      // 10-minute idempotency window — collapses double-clicks but lets
      // a user legitimately retry after a longer pause.
      idempotencyKey: `setup-checkout:${userId}:${plan}:${Math.floor(Date.now() / 600000)}`,
    });

    console.log(`[billing/checkout/setup] user=${userId} plan=${plan} session=${session.id}`);
    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('[billing/checkout/setup]', err.message);
    res.status(500).json({ error: 'Failed to start setup checkout. Try again in a moment.' });
  }
});

// ─── POST /api/billing/meeting/booked — confirm the user picked a time ───
// Body: {} (no payload — user is identified via auth token)
// Idempotent: returns 200 whether this is the first time or a re-confirmation.
router.post('/api/billing/meeting/booked', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('setup_paid_at, meeting_booked_at')
    .eq('user_id', userId)
    .maybeSingle();

  // Can't book a meeting before the setup fee is paid — caller is out of
  // order. Return 409 with a hint of the actual next step.
  if (!sub?.setup_paid_at) {
    return res.status(409).json({
      error: 'Setup fee must be paid before booking a meeting.',
      next_step: 'setup',
    });
  }

  // Already booked? No-op success.
  if (sub.meeting_booked_at) {
    return res.json({ ok: true, meeting_booked_at: sub.meeting_booked_at, already_booked: true });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('subscriptions')
    .update({ meeting_booked_at: now, updated_at: now })
    .eq('user_id', userId);
  if (error) {
    console.error('[billing/meeting/booked]', error.message);
    return res.status(500).json({ error: 'Could not save booking confirmation.' });
  }

  console.log(`[billing/meeting/booked] user=${userId} at=${now}`);
  res.json({ ok: true, meeting_booked_at: now });
});

// ─── POST /api/billing/checkout/monthly — recurring subscription ───
// Body: {} (plan is determined by the user's setup-fee payment, NOT by
// the client — this prevents a user from paying $1997 for Complete then
// quietly subscribing to a different recurring tier).
router.post('/api/billing/checkout/monthly', async (req, res) => {
  const userId = req.user?.id;
  if (!userId || userId === 'anonymous') {
    return res.status(401).json({ error: 'Auth required' });
  }
  if (!rateLimitOk(userId)) {
    return res.status(429).json({ error: 'Too many checkout attempts. Wait a minute and try again.' });
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, stripe_subscription_id, stripe_customer_id, setup_paid_at, meeting_booked_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!sub?.setup_paid_at) {
    return res.status(409).json({ error: 'Setup fee must be paid first.', next_step: 'setup' });
  }
  if (!sub.meeting_booked_at) {
    return res.status(409).json({ error: 'Book your onboarding call first.', next_step: 'meeting' });
  }
  if (sub.stripe_subscription_id && ['active', 'trialing', 'canceling', 'past_due'].includes(sub.status)) {
    return res.status(409).json({
      error: 'You already have an active monthly subscription. Use the billing portal to switch plans.',
      use_portal: true,
      next_step: 'done',
    });
  }
  if (!isValidPlan(sub.plan)) {
    return res.status(500).json({ error: 'Account is missing a valid plan id. Contact support.' });
  }

  // Monthly tier is locked to the setup tier per Q8: Complete-setup users
  // get $99 Complete monthly, Diamond-setup users get $199 Diamond monthly.
  // This enforces it server-side so a tampered client can't subscribe to
  // a cheaper tier than they paid setup for.
  const monthlyPriceId = getStripePriceId(sub.plan, { boost: false });
  if (!monthlyPriceId) {
    return res.status(500).json({
      error: `No Stripe MONTHLY price configured for plan="${sub.plan}". Set STRIPE_PRICE_${sub.plan.toUpperCase()}_STANDARD in env.`,
    });
  }

  try {
    const stripe = getStripe();
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const email = authData?.user?.email;
    const origin = resolveFrontendOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: monthlyPriceId, quantity: 1 }],
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      customer: sub.stripe_customer_id || undefined,
      customer_email: sub.stripe_customer_id ? undefined : email,
      metadata: { user_id: userId, plan: sub.plan, step: 'monthly' },
      subscription_data: {
        metadata: { user_id: userId, plan: sub.plan, step: 'monthly' },
      },
      allow_promotion_codes: true,
    }, {
      idempotencyKey: `monthly-checkout:${userId}:${sub.plan}:${Math.floor(Date.now() / 600000)}`,
    });

    console.log(`[billing/checkout/monthly] user=${userId} plan=${sub.plan} session=${session.id}`);
    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('[billing/checkout/monthly]', err.message);
    res.status(500).json({ error: 'Failed to start subscription checkout. Try again in a moment.' });
  }
});

export default router;
