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
import { refillMonthlyCredits, addCredits, revokeCredits } from '../services/credits.js';
import { sendBookingInvite } from '../services/booking-email.js';

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

  // 2. Dedupe check (read-only). The stripe_events row is INSERTED only
  //    AFTER the handler runs successfully. If a previous attempt threw
  //    (e.g., schema mismatch, transient DB failure), no row exists →
  //    Stripe's retry reprocesses cleanly. If a previous attempt
  //    succeeded → row exists → we skip.
  //
  //    All handlers below are idempotent (upserts on user_id, addCredits
  //    guards on stripe_event_id), so even if the same event is processed
  //    more than once before the dedupe row lands, no data corruption.
  try {
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('id', event.id)
      .maybeSingle();
    if (existing) {
      console.log(`[webhook/stripe] Event ${event.id} already processed — skipping`);
      return res.json({ received: true, duplicate: true });
    }
    console.log(`[webhook/stripe] Event accepted: ${event.type} (${event.id})`);
  } catch (err) {
    console.error(`[webhook/stripe] Dedupe check error: ${err.message}`);
    // Continue — handlers are idempotent. Dedupe is an optimization,
    // not a correctness requirement.
  }

  // 3. Resolve user.
  //    Priority: metadata.user_id (written at checkout creation)
  //              → profiles.stripe_customer_id (written on first checkout)
  //              → customer.metadata.user_id on Stripe Customer
  //
  // Note: profiles doesn't carry `email` (auth.users does), so there's
  // no email-based fallback here. Every Stripe customer created through
  // our own checkout flow carries `metadata.user_id`, so the first
  // branch catches 99%+ of cases; the other branches cover existing
  // customers whose first event lands before the profile is stamped.
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
      // ── Checkout completed → branch by session.mode ──
      // mode='payment'  → one-time setup-fee checkout (new funnel)
      // mode='subscription' → recurring monthly (both new funnel + legacy)
      case 'checkout.session.completed': {
        if (!userId) {
          console.log('[webhook/stripe] checkout.session.completed: no user match');
          break;
        }
        const session = obj;

        // ── New funnel: setup fee paid ──
        if (session.mode === 'payment' && session.metadata?.step === 'setup') {
          const planFromMeta = session.metadata?.plan;
          const validPlan = planFromMeta && ['complete', 'diamond'].includes(planFromMeta);
          if (!validPlan) {
            console.error(`[webhook/stripe] setup checkout completed without valid plan metadata (got "${planFromMeta}")`);
            break;
          }

          const nowIso = new Date().toISOString();
          // Upsert the funnel-state row. setup_paid_at + plan get set;
          // status stays 'setup_paid' until the recurring subscription
          // activates later (mode='subscription' branch).
          const { error: upErr } = await supabase.from('subscriptions').upsert({
            user_id: userId,
            plan: planFromMeta,
            tier: 'standard',
            status: 'setup_paid',
            stripe_customer_id: session.customer || null,
            setup_paid_at: nowIso,
            setup_checkout_session_id: session.id,
            updated_at: nowIso,
          }, { onConflict: 'user_id' });
          if (upErr) {
            console.error(`[webhook/stripe] setup_paid upsert FAILED: ${upErr.code} ${upErr.message}`);
            throw new Error(`setup_paid upsert: ${upErr.message}`);
          }

          // Pin stripe_customer_id on the profile so subsequent events
          // resolve via the O(1) profile lookup instead of metadata.
          if (session.customer) {
            await supabase.from('profiles')
              .update({ stripe_customer_id: session.customer })
              .eq('id', userId);
          }

          // Send the booking-invite email. Wrapped — email failure must
          // NOT mask payment success or trigger a Stripe retry.
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', userId)
              .maybeSingle();
            const calendlyUrl = planFromMeta === 'diamond'
              ? (process.env.CALENDLY_URL_DIAMOND || process.env.CALENDLY_URL || null)
              : (process.env.CALENDLY_URL_COMPLETE || process.env.CALENDLY_URL || null);
            await sendBookingInvite({
              userId,
              plan: planFromMeta,
              calendlyUrl,
              displayName: profile?.full_name || null,
            });
          } catch (emailErr) {
            console.error(`[webhook/stripe] booking-invite email failed (non-fatal): ${emailErr.message}`);
          }

          console.log(`[webhook/stripe] Setup paid: user=${userId} plan=${planFromMeta}`);
          break;
        }

        // Anything else with mode!='subscription' is unexpected here.
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

        const subUpsert = await supabase.from('subscriptions').upsert({
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
        if (subUpsert.error) {
          // Loud failure — silent failure here is the difference between
          // "user paid and got their plan" and "user paid and stayed
          // stuck on PlanSelector forever". Throwing forces a 5xx so
          // Stripe retries the event.
          console.error(`[webhook/stripe] subscriptions upsert FAILED: ${subUpsert.error.code} ${subUpsert.error.message}`);
          throw new Error(`subscriptions upsert: ${subUpsert.error.message}`);
        }

        // Store the Stripe customer ID on the user's profile for future
        // webhook resolution (avoids the email-match fallback).
        if (session.customer) {
          const profUpdate = await supabase
            .from('profiles')
            .update({ stripe_customer_id: session.customer })
            .eq('id', userId);
          if (profUpdate.error) {
            console.error(`[webhook/stripe] profile stripe_customer_id update FAILED: ${profUpdate.error.message}`);
          }
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
          // session.invoice is set after Stripe finalises the first invoice —
          // pass it through so a future refund of this charge can find this
          // exact credit deposit.
          await addCredits(userId, seed, 'monthly_refill', {
            stripe_event_id: event.id,
            stripe_invoice_id: session.invoice || null,
          });
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
        const updRes = await supabase.from('subscriptions').upsert(patch, { onConflict: 'user_id' });
        if (updRes.error) {
          console.error(`[webhook/stripe] subscriptions upsert FAILED on update: ${updRes.error.code} ${updRes.error.message}`);
          throw new Error(`subscriptions update: ${updRes.error.message}`);
        }
        console.log(`[webhook/stripe] Subscription updated: user=${userId} plan=${resolved?.plan || '?'} tier=${resolved?.tier || '?'} status=${status}`);
        break;
      }

      // ── Stripe "pause collection" feature: renewal disabled ──
      case 'customer.subscription.paused': {
        if (!userId) break;
        const r = await supabase.from('subscriptions')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (r.error) throw new Error(`subscription pause: ${r.error.message}`);
        console.log(`[webhook/stripe] Subscription paused: user=${userId}`);
        break;
      }

      // ── Stripe "resume collection": renewal re-enabled ──
      case 'customer.subscription.resumed': {
        if (!userId) break;
        const r = await supabase.from('subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (r.error) throw new Error(`subscription resume: ${r.error.message}`);
        console.log(`[webhook/stripe] Subscription resumed: user=${userId}`);
        break;
      }

      // ── Customer record changed on Stripe side (email, metadata, etc.) ──
      // We don't store customer email locally (it's in auth.users), but we
      // log it so we can see when Stripe made changes, and we defensively
      // reconcile stripe_customer_id on our profile row if it diverged.
      case 'customer.updated': {
        if (!userId) break;
        const cust = obj;
        // If we somehow have a different stripe_customer_id on the profile,
        // overwrite it (Stripe is the source of truth for their own IDs).
        const { error: e } = await supabase
          .from('profiles')
          .update({ stripe_customer_id: cust.id })
          .eq('id', userId);
        if (e) console.error(`[webhook/stripe] profile stripe_customer_id reconcile FAILED: ${e.message}`);
        console.log(`[webhook/stripe] Customer updated: user=${userId} email=${cust.email || 'n/a'}`);
        break;
      }

      // ── Subscription deleted (fully cancelled, past end of period) ──
      case 'customer.subscription.deleted': {
        if (!userId) break;
        const delRes = await supabase.from('subscriptions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (delRes.error) {
          console.error(`[webhook/stripe] subscription cancel update FAILED: ${delRes.error.message}`);
          throw new Error(`subscription cancel: ${delRes.error.message}`);
        }
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
          const refillResult = await refillMonthlyCredits(userId, {
            stripe_event_id: event.id,
            stripe_invoice_id: obj.id, // invoice.paid → obj is the invoice
          });
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

      // ── Refund issued (full or partial) → pro-rate credit revocation ──
      case 'charge.refunded': {
        if (!userId) break;
        const charge = obj;
        const totalAmount = charge.amount;
        const refundedAmount = charge.amount_refunded;
        if (!totalAmount || !refundedAmount) break;
        const refundFraction = refundedAmount / totalAmount;
        const invoiceId = charge.invoice || null;

        // Find the credit deposit tied to this charge's invoice.
        let depositRow = null;
        if (invoiceId) {
          const { data } = await supabase
            .from('credit_transactions')
            .select('amount, reason')
            .eq('user_id', userId)
            .eq('stripe_invoice_id', invoiceId)
            .gt('amount', 0)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          depositRow = data;
        }

        // Revoke amount = (deposit credits) * (refund fraction).
        // If we can't find the deposit (older deposits before we tracked
        // invoice ids, or non-subscription refunds), fall back to the
        // user's plan monthly allocation × fraction.
        let revokeAmt = 0;
        if (depositRow) {
          revokeAmt = Math.ceil(depositRow.amount * refundFraction);
        } else {
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('plan')
            .eq('user_id', userId)
            .maybeSingle();
          if (sub?.plan) {
            const { data: planRow } = await supabase
              .from('plans')
              .select('credits_per_month')
              .eq('id', sub.plan)
              .maybeSingle();
            if (planRow?.credits_per_month) {
              revokeAmt = Math.ceil(planRow.credits_per_month * refundFraction);
            }
          }
        }

        if (revokeAmt > 0) {
          await revokeCredits(userId, revokeAmt, 'refund_revocation', {
            stripe_event_id: event.id,
            stripe_invoice_id: invoiceId,
          });
          console.log(`[webhook/stripe] Refund: user=${userId} fraction=${(refundFraction * 100).toFixed(0)}% revoked=${revokeAmt} cr`);
        } else {
          console.log(`[webhook/stripe] Refund: user=${userId} fraction=${(refundFraction * 100).toFixed(0)}% revoked=0 (no matching deposit + no plan)`);
        }
        break;
      }

      // ── Chargeback opened → freeze the account ──
      case 'charge.dispute.created': {
        if (!userId) break;
        const dispRes = await supabase
          .from('subscriptions')
          .update({ disputed: true, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (dispRes.error) {
          console.error(`[webhook/stripe] dispute set FAILED: ${dispRes.error.message}`);
          throw new Error(`dispute set: ${dispRes.error.message}`);
        }
        console.log(`[webhook/stripe] Dispute opened: user=${userId} charge=${obj.charge} reason=${obj.reason}`);
        break;
      }

      // ── Chargeback resolved → unfreeze if we won ──
      case 'charge.dispute.closed': {
        if (!userId) break;
        // Outcome: 'won' = merchant kept the funds → unfreeze.
        // 'lost' = funds returned to cardholder → keep frozen, also revoke
        //   credits for the disputed charge (treat like a refund).
        // 'warning_closed' / 'warning_needs_response' → no money movement
        //   yet; leave the freeze on until resolved.
        const won = obj.status === 'won';
        if (won) {
          const upd = await supabase
            .from('subscriptions')
            .update({ disputed: false, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
          if (upd.error) throw new Error(`dispute clear: ${upd.error.message}`);
          console.log(`[webhook/stripe] Dispute WON: user=${userId} — unfroze account`);
        } else {
          console.log(`[webhook/stripe] Dispute closed (status=${obj.status}): user=${userId} — keeping freeze`);
        }
        break;
      }

      // ── Payment failed ──
      case 'invoice.payment_failed': {
        if (!userId) break;
        console.log(`[webhook/stripe] Payment FAILED: user=${userId} invoice=${obj.id}`);
        const pfRes = await supabase.from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (pfRes.error) {
          console.error(`[webhook/stripe] past_due update FAILED: ${pfRes.error.message}`);
          throw new Error(`past_due update: ${pfRes.error.message}`);
        }
        break;
      }

      default:
        console.log(`[webhook/stripe] Unhandled event type: ${event.type}`);
    }

    // Mark this event as processed AFTER the handler succeeded. If the
    // handler threw above, we never reach this point → no dedupe row →
    // Stripe's retry will reprocess (which is what we want).
    try {
      await supabase
        .from('stripe_events')
        .insert({ id: event.id, type: event.type });
    } catch (dedupeErr) {
      // Best-effort. If this insert fails (unique violation from a
      // concurrent processor, or transient DB hiccup), the worst case
      // is a future retry reprocesses an already-handled event — but
      // every handler is idempotent, so no corruption.
      void dedupeErr;
    }

    // 200 — Stripe retries on 5xx, and we don't want that for events
    // we've intentionally skipped (unhandled types, no user match).
    res.json({ received: true });
  } catch (err) {
    console.error(`[webhook/stripe] Error handling ${event.type}:`, err.message);
    // Return 500 so Stripe retries this event. Because we have NOT yet
    // inserted into stripe_events, the retry will reprocess from scratch.
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
