import { Router } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import { supabase } from '../services/storage.js';
import * as stripeInt from '../services/integrations/stripe-int.js';
import * as whop from '../services/integrations/whop.js';
import * as shopify from '../services/integrations/shopify.js';
import * as kajabi from '../services/integrations/kajabi.js';
import * as gohighlevel from '../services/integrations/gohighlevel.js';

const router = Router();

// ─── Stripe global platform webhook (AICEO billing) ───
// Single URL for Stripe dashboard: https://<backend>/api/webhooks/stripe
// Handles subscription lifecycle for AICEO's own plans, not per-user integrations.
// Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in env.
router.post('/api/webhooks/stripe', async (req, res) => {
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!STRIPE_SECRET) {
    console.error('[webhook/stripe-global] STRIPE_SECRET_KEY not set');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  // 1. Verify signature
  const sig = req.headers['stripe-signature'];
  let event;
  if (WEBHOOK_SECRET && sig) {
    try {
      const stripe = new Stripe(STRIPE_SECRET);
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.log(`[webhook/stripe-global] Signature verification failed: ${err.message}`);
      return res.status(400).json({ error: 'Invalid signature' });
    }
  } else {
    // No secret configured — parse raw body (dev/testing only)
    try {
      event = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body instanceof Buffer ? JSON.parse(req.body.toString()) : req.body);
    } catch {
      return res.status(400).json({ error: 'Invalid payload' });
    }
  }

  console.log(`[webhook/stripe-global] Event: ${event.type} (${event.id})`);

  // 2. Resolve the AICEO user from the Stripe event.
  //    Priority: metadata.user_id (set during checkout creation) → customer email → bail.
  const resolveUserId = async (stripeEvent) => {
    const obj = stripeEvent.data?.object || {};

    // a) Check metadata.user_id (most reliable — set when the checkout session was created)
    const metaUserId = obj.metadata?.user_id || obj.subscription_details?.metadata?.user_id;
    if (metaUserId) return metaUserId;

    // b) Look up customer email → match against auth.users
    const stripe = new Stripe(STRIPE_SECRET);
    const customerId = obj.customer || obj.customer_id;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.metadata?.user_id) return customer.metadata.user_id;
        if (customer.email) {
          const { data } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', customer.email)
            .limit(1);
          if (data?.[0]?.id) return data[0].id;
          // Fallback: check auth.users via Supabase admin (email in auth schema)
          const { data: authData } = await supabase.auth.admin.listUsers({ filter: `email.eq.${customer.email}` });
          const match = (authData?.users || []).find(u => u.email?.toLowerCase() === customer.email.toLowerCase());
          if (match) return match.id;
        }
      } catch (err) {
        console.log(`[webhook/stripe-global] Customer lookup failed: ${err.message}`);
      }
    }

    // c) Direct email on the object (invoices, checkout sessions)
    const email = obj.customer_email || obj.receipt_email;
    if (email) {
      try {
        const { data: authData } = await supabase.auth.admin.listUsers();
        const match = (authData?.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (match) return match.id;
      } catch {}
    }

    return null;
  };

  try {
    const userId = await resolveUserId(event);
    const obj = event.data?.object || {};
    const stripe = new Stripe(STRIPE_SECRET);

    switch (event.type) {
      // ── Checkout completed → activate subscription ──
      case 'checkout.session.completed': {
        if (!userId) { console.log('[webhook/stripe-global] checkout.session.completed: no user match'); break; }
        const session = obj;
        // Retrieve the subscription to get plan details
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const planName = sub.items.data[0]?.price?.lookup_key
            || sub.items.data[0]?.price?.nickname
            || sub.items.data[0]?.price?.product
            || 'pro';
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            plan: planName.toLowerCase(),
            status: 'active',
            stripe_subscription_id: sub.id,
            stripe_customer_id: session.customer,
            current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
          console.log(`[webhook/stripe-global] Subscription activated for user ${userId}: ${planName}`);
        }
        break;
      }

      // ── Subscription updated (upgrade, downgrade, renewal) ──
      case 'customer.subscription.updated': {
        if (!userId) break;
        const sub = obj;
        const planName = sub.items?.data?.[0]?.price?.lookup_key
          || sub.items?.data?.[0]?.price?.nickname
          || sub.items?.data?.[0]?.price?.product
          || 'pro';
        const status = sub.cancel_at_period_end ? 'canceling' : (sub.status === 'active' ? 'active' : sub.status);
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          plan: planName.toLowerCase(),
          status,
          stripe_subscription_id: sub.id,
          stripe_customer_id: sub.customer,
          current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        console.log(`[webhook/stripe-global] Subscription updated for user ${userId}: ${planName} (${status})`);
        break;
      }

      // ── Subscription deleted (cancelled) ──
      case 'customer.subscription.deleted': {
        if (!userId) break;
        await supabase.from('subscriptions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        console.log(`[webhook/stripe-global] Subscription cancelled for user ${userId}`);
        break;
      }

      // ── Invoice paid (renewal confirmation) ──
      case 'invoice.paid': {
        if (!userId) break;
        console.log(`[webhook/stripe-global] Invoice paid for user ${userId}: ${(obj.amount_paid / 100).toFixed(2)} ${obj.currency?.toUpperCase()}`);
        // Optionally add credits or extend period — expand here as needed
        break;
      }

      // ── Payment failed ──
      case 'invoice.payment_failed': {
        if (!userId) break;
        console.log(`[webhook/stripe-global] Payment FAILED for user ${userId}: ${obj.id}`);
        await supabase.from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        break;
      }

      default:
        console.log(`[webhook/stripe-global] Unhandled event type: ${event.type}`);
    }

    // Always acknowledge — Stripe retries on 5xx, and we don't want that for
    // events we intentionally skip (unhandled types, no user match).
    res.json({ received: true });
  } catch (err) {
    console.error(`[webhook/stripe-global] Error handling ${event.type}:`, err.message);
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
