import { Router } from 'express';
import { supabase } from '../services/storage.js';
import { getUserPlan, getPlans } from '../services/plans.js';
import { getCreditCosts } from '../services/credits.js';
import { stripe as getStripe, getStripePriceId } from '../services/stripe.js';

const router = Router();

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
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
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

  const { plan, boost = false } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan is required' });

  const priceId = getStripePriceId(plan, { boost });
  if (!priceId) {
    return res.status(400).json({
      error: `No Stripe price configured for plan="${plan}" boost=${boost}. Set STRIPE_PRICE_${plan.toUpperCase()}_${boost ? 'BOOST' : 'STANDARD'} in env.`,
    });
  }

  // Guard: reject if user already has an active/canceling subscription.
  // Plan changes on an existing sub must go through the Customer Portal
  // where Stripe handles proration, immediate/delayed switch, and keeps
  // a single subscription object alive.
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('status, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingSub && ['active', 'canceling', 'trialing', 'past_due'].includes(existingSub.status)) {
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

    const origin = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      customer: existingSub?.stripe_customer_id || undefined,
      customer_email: existingSub?.stripe_customer_id ? undefined : email,
      // Metadata flows into the webhook. user_id is the source of truth —
      // email-based resolution is only a last-ditch fallback there.
      metadata: { user_id: userId, plan, boost: String(boost) },
      subscription_data: {
        metadata: { user_id: userId, plan, boost: String(boost) },
      },
      allow_promotion_codes: true,
    }, {
      // Stable idempotency key for a 10-minute window so double-clicks
      // collapse to one session. Past that, user can legitimately retry.
      idempotencyKey: `checkout:${userId}:${plan}:${boost ? 'b' : 's'}:${Math.floor(Date.now() / 600000)}`,
    });

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
    const origin = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:5173';

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/billing`,
    });

    res.json({ url: portal.url });
  } catch (err) {
    console.error('[billing/portal]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
