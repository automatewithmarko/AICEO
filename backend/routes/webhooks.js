import { Router } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import { supabase } from '../services/storage.js';
import { stripe as getStripe, priceIdToPlanTier } from '../services/stripe.js';
import * as stripeInt from '../services/integrations/stripe-int.js';
import * as whop from '../services/integrations/whop.js';
import * as shopify from '../services/integrations/shopify.js';
import * as kajabi from '../services/integrations/kajabi.js';
import * as gohighlevel from '../services/integrations/gohighlevel.js';
import { refillMonthlyCredits, addCredits } from '../services/credits.js';

const router = Router();

// ─── Stripe global platform webhook (AICEO billing) ───
// Single URL for Stripe dashboard: https://<backend>/api/webhooks/stripe
// Handles subscription lifecycle for AICEO's own plans, not per-user integrations.
//
// SECURITY: this endpoint FAILS CLOSED. If STRIPE_WEBHOOK_SECRET is missing
// or the Stripe-Signature header is absent/invalid, we reject — we never
// parse an unverified body, because doing so would let anyone POST a fake
// `checkout.session.completed` with a forged `metadata.user_id` and activate
// a paid subscription for any account.
//
// IDEMPOTENCY: Stripe retries events on 5xx/timeouts. We dedupe on
// `event.id` via the `stripe_events` table. The row's UPSERT with
// ON CONFLICT DO NOTHING tells us whether this is the first time we've
// seen this event — if not, we return 200 without processing.
router.post('/api/webhooks/stripe', async (req, res) => {
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET) {
    console.error('[webhook/stripe] STRIPE_SECRET_KEY not set — refusing');
    return res.status(500).json({ error: 'Stripe not configured' });
  }
  if (!WEBHOOK_SECRET) {
    console.error('[webhook/stripe] STRIPE_WEBHOOK_SECRET not set — refusing');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.log('[webhook/stripe] Missing Stripe-Signature header');
    return res.status(400).json({ error: 'Missing signature' });
  }

  // 1. Verify signature against raw body
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.log(`[webhook/stripe] Signature verification failed: ${err.message}`);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 2. Dedupe via stripe_events table. If the row already existed, this
  //    is a retry — acknowledge quickly without re-processing.
  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('stripe_events')
      .insert({ id: event.id, type: event.type })
      .select('id')
      .single();
    if (insertErr) {
      // Most likely a duplicate-key error → already processed.
      if (insertErr.code === '23505' || /duplicate key/i.test(insertErr.message || '')) {
        console.log(`[webhook/stripe] Event ${event.id} already processed — skipping`);
        return res.json({ received: true, duplicate: true });
      }
      // Something else (table missing, network hiccup) — log and continue.
      // Worst case is we process the event more than once; individual
      // handlers below are designed to be safe against that.
      console.error(`[webhook/stripe] stripe_events insert failed: ${insertErr.message}`);
    } else {
      console.log(`[webhook/stripe] Event accepted: ${event.type} (${event.id})`);
    }
    // inserted may be used later for diagnostics
    void inserted;
  } catch (err) {
    console.error(`[webhook/stripe] Dedupe check error: ${err.message}`);
  }

  // 3. Resolve user.
  //    Priority: metadata.user_id (written at checkout creation)
  //              → profiles.stripe_customer_id (written on first checkout)
  //              → customer.metadata.user_id on Stripe Customer
  //              → LAST-DITCH email match (one targeted query, not list-all)
  const resolveUserId = async (stripeEvent) => {
    const obj = stripeEvent.data?.object || {};

    // a) metadata.user_id set when we created the Checkout Session.
    const metaUserId = obj.metadata?.user_id
      || obj.subscription_details?.metadata?.user_id;
    if (metaUserId) return metaUserId;

    // b) profiles.stripe_customer_id — O(1) lookup.
    const customerId = obj.customer || obj.customer_id;
    if (customerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
      if (profile?.id) return profile.id;

      // c) Stripe Customer's own metadata.user_id
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.metadata?.user_id) return customer.metadata.user_id;

        // d) Last-ditch: match customer email → profiles.
        if (customer.email) {
          const { data: emailMatch } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', customer.email)
            .maybeSingle();
          if (emailMatch?.id) return emailMatch.id;
        }
      } catch (err) {
        console.log(`[webhook/stripe] Customer retrieve failed: ${err.message}`);
      }
    }

    return null;
  };

  try {
    const userId = await resolveUserId(event);
    const obj = event.data?.object || {};

    switch (event.type) {
      // ── Checkout completed → activate subscription + seed first-month credits ──
      case 'checkout.session.completed': {
        if (!userId) {
          console.log('[webhook/stripe] checkout.session.completed: no user match');
          break;
        }
        const session = obj;
        if (!session.subscription) break;

        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = sub.items.data[0]?.price?.id;
        const resolved = priceIdToPlanTier(priceId);
        if (!resolved) {
          console.error(`[webhook/stripe] Unknown Price ID ${priceId} — subscription NOT activated. Check STRIPE_PRICE_* env.`);
          break;
        }
        const { plan, tier } = resolved;
        const status = sub.cancel_at_period_end ? 'canceling' : 'active';

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          plan,
          tier,
          stripe_price_id: priceId,
          status,
          stripe_subscription_id: sub.id,
          stripe_customer_id: session.customer,
          current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        // Store the Stripe customer ID on the user's profile for future
        // webhook resolution (avoids the email-match fallback).
        if (session.customer) {
          await supabase
            .from('profiles')
            .update({ stripe_customer_id: session.customer })
            .eq('id', userId);
        }

        // Seed first-month credits here (exactly once per event.id — the
        // stripe_events dedupe above protects against retries).
        try {
          const { data: planRow } = await supabase
            .from('plans')
            .select('credits_per_month')
            .eq('id', plan)
            .single();
          const seed = planRow?.credits_per_month || 500;
          await addCredits(userId, seed, 'monthly_refill', { stripe_event_id: event.id });
          console.log(`[webhook/stripe] Seeded ${seed} credits for user ${userId} (plan=${plan}, tier=${tier})`);
        } catch (seedErr) {
          console.error(`[webhook/stripe] Initial credit seed failed: ${seedErr.message}`);
        }

        console.log(`[webhook/stripe] Subscription activated: user=${userId} plan=${plan} tier=${tier}`);
        break;
      }

      // ── Subscription updated (plan/tier change, cancel_at_period_end toggle, renewal) ──
      case 'customer.subscription.updated': {
        if (!userId) break;
        const sub = obj;
        const priceId = sub.items?.data?.[0]?.price?.id;
        const resolved = priceIdToPlanTier(priceId);
        if (!resolved) {
          console.error(`[webhook/stripe] Unknown Price ID ${priceId} on update — keeping prior plan value.`);
        }
        const status = sub.cancel_at_period_end
          ? 'canceling'
          : (sub.status === 'active' ? 'active' : sub.status);

        const patch = {
          user_id: userId,
          status,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer,
          current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        };
        if (resolved) {
          patch.plan = resolved.plan;
          patch.tier = resolved.tier;
          patch.stripe_price_id = priceId;
        }
        await supabase.from('subscriptions').upsert(patch, { onConflict: 'user_id' });
        console.log(`[webhook/stripe] Subscription updated: user=${userId} plan=${resolved?.plan || '?'} tier=${resolved?.tier || '?'} status=${status}`);
        break;
      }

      // ── Subscription deleted (fully cancelled, past end of period) ──
      case 'customer.subscription.deleted': {
        if (!userId) break;
        await supabase.from('subscriptions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        console.log(`[webhook/stripe] Subscription cancelled: user=${userId}`);
        break;
      }

      // ── Invoice paid → refill credits, but ONLY for renewal cycles ──
      case 'invoice.paid': {
        if (!userId) break;
        const reason = obj.billing_reason;
        console.log(`[webhook/stripe] invoice.paid user=${userId} amount=${(obj.amount_paid / 100).toFixed(2)} ${obj.currency?.toUpperCase()} reason=${reason}`);

        // subscription_create → first invoice at checkout. Credits were
        //   already seeded on checkout.session.completed. Skip.
        // subscription_cycle → genuine renewal. Refill.
        // subscription_update → mid-cycle plan change (proration invoice).
        //   No refill — credits are managed by the plan itself.
        // manual / subscription_threshold → ignore for now.
        if (reason !== 'subscription_cycle') {
          console.log(`[webhook/stripe] invoice.paid: skipping credit refill for billing_reason=${reason}`);
          break;
        }

        try {
          const refillResult = await refillMonthlyCredits(userId, { stripe_event_id: event.id });
          if (refillResult.success) {
            console.log(`[webhook/stripe] Credits refilled: user=${userId} balance=${refillResult.newBalance}`);
          } else {
            console.log(`[webhook/stripe] Refill skipped: user=${userId} reason=${refillResult.reason}`);
          }
        } catch (err) {
          console.error(`[webhook/stripe] Refill failed: user=${userId} err=${err.message}`);
        }
        break;
      }

      // ── Payment failed ──
      case 'invoice.payment_failed': {
        if (!userId) break;
        console.log(`[webhook/stripe] Payment FAILED: user=${userId} invoice=${obj.id}`);
        await supabase.from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        break;
      }

      default:
        console.log(`[webhook/stripe] Unhandled event type: ${event.type}`);
    }

    // Always 200 — Stripe retries on 5xx, and we don't want that for
    // events we've intentionally skipped (unhandled types, no user match).
    // The stripe_events row ensures we won't reprocess anyway.
    res.json({ received: true });
  } catch (err) {
    console.error(`[webhook/stripe] Error handling ${event.type}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Stripe per-user integration webhook (user's own Stripe data sync) ───
router.post('/api/webhooks/stripe/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'stripe')
    .eq('is_active', true)
    .single();

  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  // Verify Stripe signature
  const sig = req.headers['stripe-signature'];
  const webhookSecret = integration.webhook_secret;

  let event;
  if (webhookSecret && sig) {
    try {
      const stripe = new Stripe(integration.api_key);
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    }
  } else {
    // If no webhook secret configured, parse body directly
    event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }

  try {
    await stripeInt.handleWebhook(event, { ...integration, user_id: userId });
    res.json({ received: true });
  } catch (err) {
    console.log(`[webhook/stripe] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Whop webhook ───
router.post('/api/webhooks/whop/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'whop')
    .eq('is_active', true)
    .single();

  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  // Verify HMAC signature
  const signature = req.headers['x-whop-signature'] || req.headers['whop-signature'];
  if (integration.webhook_secret && signature) {
    const expected = crypto
      .createHmac('sha256', integration.webhook_secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  try {
    await whop.handleWebhook(req.body, { ...integration, user_id: userId });
    res.json({ ok: true });
  } catch (err) {
    console.log(`[webhook/whop] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Shopify webhook ───
router.post('/api/webhooks/shopify/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'shopify')
    .eq('is_active', true)
    .single();

  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  // Verify HMAC-SHA256 signature
  const signature = req.headers['x-shopify-hmac-sha256'];
  if (integration.webhook_secret && signature) {
    const expected = crypto
      .createHmac('sha256', integration.webhook_secret)
      .update(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
      .digest('base64');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  try {
    const topic = req.headers['x-shopify-topic'];
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    payload.topic = topic;
    await shopify.handleWebhook(payload, { ...integration, user_id: userId });
    res.json({ ok: true });
  } catch (err) {
    console.log(`[webhook/shopify] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── Kajabi webhook ───
router.post('/api/webhooks/kajabi/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'kajabi')
    .eq('is_active', true)
    .single();

  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  // Verify HMAC signature
  const signature = req.headers['x-kajabi-signature'] || req.headers['x-webhook-signature'];
  if (integration.webhook_secret && signature) {
    const expected = crypto
      .createHmac('sha256', integration.webhook_secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  try {
    await kajabi.handleWebhook(req.body, { ...integration, user_id: userId });
    res.json({ ok: true });
  } catch (err) {
    console.log(`[webhook/kajabi] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── GoHighLevel webhook ───
router.post('/api/webhooks/gohighlevel/:userId', async (req, res) => {
  const { userId } = req.params;

  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'gohighlevel')
    .eq('is_active', true)
    .single();

  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  // Verify HMAC signature if configured
  const signature = req.headers['x-ghl-signature'] || req.headers['x-webhook-signature'];
  if (integration.webhook_secret && signature) {
    const expected = crypto
      .createHmac('sha256', integration.webhook_secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  try {
    await gohighlevel.handleWebhook(req.body, { ...integration, user_id: userId });
    res.json({ ok: true });
  } catch (err) {
    console.log(`[webhook/gohighlevel] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
