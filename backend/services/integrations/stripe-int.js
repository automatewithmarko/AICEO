import Stripe from 'stripe';
import { supabase } from '../storage.js';

// One hardened client constructor for every user-key call (the platform
// billing client in services/stripe.js is hardened separately).
function makeClient(apiKey) {
  return new Stripe(apiKey, { timeout: 20_000, maxNetworkRetries: 2 });
}

// Canonical webhook event list — THE single source of truth (the copies
// in Settings.jsx and docs/Stripe_permissions.md mirror this; the
// auto-provisioner below subscribes the endpoint to exactly this list).
export const STRIPE_WEBHOOK_EVENTS = [
  'product.created',
  'product.updated',
  'product.deleted',
  'price.created',
  'price.updated',
  'price.deleted',
  'payment_link.created',
  'payment_link.updated',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.succeeded',
  'charge.refunded',
  'charge.dispute.created',
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
];

// ─── Permission probe (unified connect, docs/stripe-unified-connect-plan.md) ───
// Probes every Stripe resource AICEO reads with a harmless 1-item call so a
// restricted key missing scopes FAILS AT CONNECT TIME with a plain-English
// message, instead of connecting fine and silently breaking product sync
// weeks later. Write scopes can't be probed without side effects — the
// standard Secret key covers them; restricted-key users are told to grant
// read+write in the error copy.
const PERMISSION_CHECKS = [
  { label: 'Balance', required: false, run: (s) => s.balance.retrieve() },
  { label: 'Charges', required: true, run: (s) => s.charges.list({ limit: 1 }) },
  { label: 'Customers', required: true, run: (s) => s.customers.list({ limit: 1 }) },
  { label: 'Subscriptions', required: true, run: (s) => s.subscriptions.list({ limit: 1 }) },
  { label: 'Products', required: true, run: (s) => s.products.list({ limit: 1 }) },
  { label: 'Prices', required: true, run: (s) => s.prices.list({ limit: 1 }) },
  { label: 'Payment Links', required: true, run: (s) => s.paymentLinks.list({ limit: 1 }) },
  // Read implies we can also manage endpoints on a standard key; restricted
  // keys need Webhook Endpoints WRITE for auto-provisioning — if this probe
  // (or provisioning itself) fails we fall back to the manual setup screen
  // rather than failing the connect.
  { label: 'Webhook Endpoints', required: false, run: (s) => s.webhookEndpoints.list({ limit: 1 }) },
];

export async function probePermissions(apiKey) {
  const stripe = makeClient(apiKey);
  const granted = [];
  const missing = [];
  for (const check of PERMISSION_CHECKS) {
    try {
      await check.run(stripe);
      granted.push(check.label);
    } catch (err) {
      if (err?.type === 'StripeAuthenticationError' || err?.statusCode === 401) {
        const e = new Error('Stripe rejected this API key. Check that you copied the FULL Secret key (starts with sk_live_ or sk_test_) from Stripe → Developers → API keys.');
        e.code = 'STRIPE_INVALID_KEY';
        throw e;
      }
      if (err?.type === 'StripePermissionError' || err?.statusCode === 403 || /permission/i.test(err?.message || '')) {
        missing.push(check.label);
      } else {
        // Transient/other error — don't block the connect on it, but don't
        // claim the scope is granted either. Log and continue.
        console.warn(`[stripe] permission probe "${check.label}" errored (non-permission): ${err.message}`);
        granted.push(check.label);
      }
    }
  }
  return { granted, missing, requiredMissing: missing.filter((m) => PERMISSION_CHECKS.find((c) => c.label === m)?.required) };
}

export async function validate(apiKey) {
  const { granted, missing, requiredMissing } = await probePermissions(apiKey);

  if (requiredMissing.length > 0) {
    const e = new Error(
      `Your Stripe key is missing permissions AICEO needs: ${requiredMissing.join(', ')}. ` +
      `Easiest fix: use your standard Secret key (sk_live_…) from Stripe → Developers → API keys — it includes everything. ` +
      `If you must use a Restricted key, grant READ+WRITE on Products, Prices and Payment Links, ` +
      `plus READ on Charges, Customers, Subscriptions and Balance, and WRITE on Webhook Endpoints.`
    );
    e.code = 'STRIPE_MISSING_PERMISSIONS';
    e.missing = requiredMissing;
    throw e;
  }

  // Currency for display metadata. Balance read may legitimately be absent
  // on a restricted key — tolerate and default.
  let currency = 'usd';
  try {
    const balance = await makeClient(apiKey).balance.retrieve();
    currency = balance.available?.[0]?.currency || 'usd';
  } catch { /* optional */ }

  return { currency, permissions: { granted, missing } };
}

// ─── Webhook auto-provisioning ───
// Creates (or updates) the per-user AICEO webhook endpoint IN the user's
// Stripe account via the API — the user never opens Stripe's Developers
// section. Idempotent: connect, reconnect and Repair all funnel here.
//   - endpoint exists + we hold its signing secret → update the event list.
//   - endpoint exists but we have no secret (legacy manual endpoint) →
//     delete + recreate so we finally obtain a signing secret (secrets are
//     only revealed on creation).
//   - no endpoint → create.
// Never throws: returns { provisioned:false, reason } so the caller can
// fall back to the manual setup screen (e.g. restricted key without
// Webhook Endpoints write, or the account's endpoint limit was reached).
export async function provisionWebhook(apiKey, webhookUrl, { existingSecret = null } = {}) {
  const stripe = makeClient(apiKey);
  const endpointParams = {
    url: webhookUrl,
    enabled_events: STRIPE_WEBHOOK_EVENTS,
    description: 'AICEO — managed automatically. To change it, use "Repair connection" in AICEO Settings.',
  };
  try {
    let existing = null;
    for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) {
      if (ep.url === webhookUrl) { existing = ep; break; }
    }
    if (existing && existingSecret) {
      await stripe.webhookEndpoints.update(existing.id, {
        enabled_events: STRIPE_WEBHOOK_EVENTS,
        disabled: false,
      });
      return { provisioned: true, endpointId: existing.id, url: webhookUrl, secret: existingSecret, mode: 'updated' };
    }
    if (existing) {
      await stripe.webhookEndpoints.del(existing.id);
      const created = await stripe.webhookEndpoints.create(endpointParams);
      return { provisioned: true, endpointId: created.id, url: webhookUrl, secret: created.secret, mode: 'recreated' };
    }
    const created = await stripe.webhookEndpoints.create(endpointParams);
    return { provisioned: true, endpointId: created.id, url: webhookUrl, secret: created.secret, mode: 'created' };
  } catch (err) {
    console.warn(`[stripe] webhook auto-provisioning failed: ${err.message}`);
    return { provisioned: false, reason: err.message };
  }
}

// Best-effort removal of the AICEO endpoint on disconnect (clean
// uninstall — no orphaned webhooks left in the user's Stripe account).
export async function removeWebhook(apiKey, { endpointId = null, webhookUrl = null } = {}) {
  const stripe = makeClient(apiKey);
  try {
    if (endpointId) {
      await stripe.webhookEndpoints.del(endpointId);
      return true;
    }
    if (webhookUrl) {
      for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) {
        if (ep.url === webhookUrl) { await stripe.webhookEndpoints.del(ep.id); return true; }
      }
    }
  } catch (err) {
    console.warn(`[stripe] webhook removal failed (non-fatal): ${err.message}`);
  }
  return false;
}

export async function sync(integration) {
  const stripe = makeClient(integration.api_key);
  let synced = 0;

  // Fetch ALL charges using auto-pagination (full history)
  const allCharges = [];
  for await (const charge of stripe.charges.list({ limit: 100 })) {
    allCharges.push(charge);
    if (allCharges.length >= 500) break; // safety cap
  }

  console.log(`[stripe] Fetched ${allCharges.length} charges`);

  for (const charge of allCharges) {
    const { error } = await supabase.from('integration_data').upsert({
      user_id: integration.user_id,
      integration_id: integration.id,
      provider: 'stripe',
      data_type: 'payment',
      external_id: charge.id,
      title: `Payment ${charge.status}: ${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()}`,
      content: charge.description || '',
      metadata: {
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        customer: charge.customer,
        receipt_email: charge.receipt_email,
        created: charge.created,
      },
      synced_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
    if (!error) synced++;
  }

  // Fetch active subscriptions
  const subscriptions = await stripe.subscriptions.list({ limit: 100, status: 'active' });

  for (const sub of subscriptions.data) {
    const planName = sub.items.data[0]?.price?.nickname || sub.items.data[0]?.price?.id || 'Unknown Plan';
    const amount = sub.items.data[0]?.price?.unit_amount || 0;
    const currency = sub.items.data[0]?.price?.currency || 'usd';

    const { error } = await supabase.from('integration_data').upsert({
      user_id: integration.user_id,
      integration_id: integration.id,
      provider: 'stripe',
      data_type: 'subscription',
      external_id: sub.id,
      title: `Subscription: ${planName} — ${(amount / 100).toFixed(2)} ${currency.toUpperCase()}/${sub.items.data[0]?.price?.recurring?.interval || 'month'}`,
      content: '',
      metadata: {
        status: sub.status,
        customer: sub.customer,
        plan: planName,
        amount,
        currency,
        interval: sub.items.data[0]?.price?.recurring?.interval,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        created: sub.created,
      },
      synced_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
    if (!error) synced++;
  }

  // Fetch recent customers
  const customers = await stripe.customers.list({ limit: 50 });

  for (const cust of customers.data) {
    const { error } = await supabase.from('integration_data').upsert({
      user_id: integration.user_id,
      integration_id: integration.id,
      provider: 'stripe',
      data_type: 'customer',
      external_id: cust.id,
      title: cust.name || cust.email || cust.id,
      content: '',
      metadata: {
        email: cust.email,
        name: cust.name,
        phone: cust.phone,
        created: cust.created,
        balance: cust.balance,
        currency: cust.currency,
      },
      synced_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
    if (!error) synced++;
  }

  // ─── Catalog: products + prices + payment links (bidirectional sync) ───
  // Mirrors the client's Stripe product catalog into AICEO's `products`
  // table so existing Stripe products appear in the Products tab.
  // Idempotent: looked up by stripe_product_id, so AICEO-created products
  // (which already have that ID stored) get an update, not a duplicate.
  synced += await syncProductCatalog(stripe, integration);

  await supabase.from('integrations')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', integration.id);

  return { synced, total: allCharges.length + subscriptions.data.length + customers.data.length };
}

// ───────────────────── Product catalog (bidirectional) ─────────────────────

// Build a price_id → payment_link map so we can attach link URLs to
// each pricing option in one pass. Stripe doesn't expose this as a
// reverse lookup, so we list all active payment links once.
async function buildPaymentLinkIndex(stripe) {
  const byPriceId = {};
  try {
    for await (const link of stripe.paymentLinks.list({ active: true, limit: 100 })) {
      // line_items isn't included by default on list; expand or fetch
      // detail. For simplicity, expand on the list call.
      const detailed = link.line_items
        ? link
        : await stripe.paymentLinks.retrieve(link.id, { expand: ['line_items'] });
      const priceId = detailed.line_items?.data?.[0]?.price?.id;
      if (priceId) {
        byPriceId[priceId] = { id: link.id, url: link.url };
      }
    }
  } catch (err) {
    console.log(`[stripe] Payment link index build failed: ${err.message}`);
  }
  return byPriceId;
}

function priceToOption(price, paymentLinkIndex) {
  const interval = price.recurring?.interval;
  const opt = {
    price_cents: price.unit_amount || 0,
    price_mode: interval === 'month' ? 'monthly' : 'one_time',
    stripe_price_id: price.id,
  };
  const link = paymentLinkIndex[price.id];
  if (link) {
    opt.stripe_payment_link_id = link.id;
    opt.payment_link_url = link.url;
  }
  return opt;
}

async function upsertProductFromStripe(stripeProduct, prices, paymentLinkIndex, userId) {
  if (!prices.length) {
    // Product with no prices isn't sellable — skip.
    return false;
  }

  const options = prices.map(p => priceToOption(p, paymentLinkIndex));
  const first = options[0];
  const productType = stripeProduct.metadata?.type || 'digital';

  // Lookup by stripe_product_id within this user's products
  const { data: existing } = await supabase
    .from('products')
    .select('id, pricing_options')
    .eq('user_id', userId)
    .eq('stripe_product_id', stripeProduct.id)
    .maybeSingle();

  const row = {
    user_id: userId,
    name: stripeProduct.name,
    description: stripeProduct.description || '',
    type: productType,
    price_cents: first.price_cents,
    price_mode: first.price_mode,
    payment_processor: 'stripe',
    stripe_product_id: stripeProduct.id,
    stripe_price_id: first.stripe_price_id,
    stripe_payment_link_id: first.stripe_payment_link_id || null,
    payment_link_url: first.payment_link_url || null,
    pricing_options: options,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from('products')
      .update(row)
      .eq('id', existing.id);
    if (error) {
      console.log(`[stripe] Update local product ${stripeProduct.id} failed: ${error.message}`);
      return false;
    }
  } else {
    row.photos = [];
    const { error } = await supabase.from('products').insert(row);
    if (error) {
      // Retry without pricing_options if that column hasn't been added yet.
      if (error.message?.includes('pricing_options')) {
        delete row.pricing_options;
        const retry = await supabase.from('products').insert(row);
        if (retry.error) {
          console.log(`[stripe] Insert local product ${stripeProduct.id} failed: ${retry.error.message}`);
          return false;
        }
      } else {
        console.log(`[stripe] Insert local product ${stripeProduct.id} failed: ${error.message}`);
        return false;
      }
    }
  }
  return true;
}

async function syncProductCatalog(stripe, integration) {
  let synced = 0;
  let paymentLinkIndex;
  // Track every active Stripe product we saw so reconciliation below can
  // prune AICEO rows whose Stripe product was archived/deleted while we
  // weren't listening (missed webhooks, legacy endpoints without product
  // events, disconnect/reconnect gaps).
  const seenStripeIds = new Set();
  let listCompleted = false;
  try {
    paymentLinkIndex = await buildPaymentLinkIndex(stripe);

    for await (const product of stripe.products.list({ active: true, limit: 100 })) {
      seenStripeIds.add(product.id);
      // Fetch all prices for this product. Auto-pagination handles >10.
      const prices = [];
      for await (const price of stripe.prices.list({ product: product.id, active: true, limit: 100 })) {
        prices.push(price);
      }
      const ok = await upsertProductFromStripe(product, prices, paymentLinkIndex, integration.user_id);
      if (ok) synced++;
    }
    listCompleted = true;
  } catch (err) {
    console.log(`[stripe] Product catalog sync error: ${err.message}`);
  }

  // Reconciliation — ONLY when the full product list was fetched without
  // error (a partial fetch must never wipe the catalog). Same semantics as
  // the product.updated/active:false webhook handler: archived in Stripe →
  // removed from AICEO's catalog.
  if (listCompleted) {
    try {
      const { data: localRows } = await supabase
        .from('products')
        .select('id, stripe_product_id')
        .eq('user_id', integration.user_id)
        .not('stripe_product_id', 'is', null);
      const stale = (localRows || []).filter((r) => r.stripe_product_id && !seenStripeIds.has(r.stripe_product_id));
      if (stale.length > 0) {
        console.log(`[stripe] Reconciliation: pruning ${stale.length} product(s) no longer active in Stripe`);
        await supabase.from('products').delete().in('id', stale.map((r) => r.id));
      }
    } catch (err) {
      console.log(`[stripe] Reconciliation error (non-fatal): ${err.message}`);
    }
  }
  return synced;
}

export async function handleWebhook(event, integration) {
  const stripe = makeClient(integration.api_key);

  // ─── Product catalog events (bidirectional sync) ───
  // Stripe Dashboard edits propagate into AICEO's products table. AICEO
  // writes echo back here too — the upsert is idempotent because we
  // look up by stripe_product_id and merge instead of duplicating.
  if (event.type === 'product.created' || event.type === 'product.updated') {
    const product = event.data.object;
    if (product.active === false && event.type === 'product.updated') {
      // Stripe archive — remove from AICEO catalog.
      await supabase.from('products')
        .delete()
        .eq('user_id', integration.user_id)
        .eq('stripe_product_id', product.id);
      return;
    }
    const prices = [];
    for await (const price of stripe.prices.list({ product: product.id, active: true, limit: 100 })) {
      prices.push(price);
    }
    const paymentLinkIndex = await buildPaymentLinkIndex(stripe);
    await upsertProductFromStripe(product, prices, paymentLinkIndex, integration.user_id);
    return;
  }

  if (event.type === 'product.deleted') {
    await supabase.from('products')
      .delete()
      .eq('user_id', integration.user_id)
      .eq('stripe_product_id', event.data.object.id);
    return;
  }

  // Price events: refresh the parent product so pricing_options stays
  // in sync. We fetch the product fresh from Stripe to get its current
  // active state and metadata.
  if (event.type === 'price.created' || event.type === 'price.updated' || event.type === 'price.deleted') {
    const price = event.data.object;
    if (!price.product) return;
    try {
      const product = await stripe.products.retrieve(price.product);
      if (!product.active) {
        await supabase.from('products')
          .delete()
          .eq('user_id', integration.user_id)
          .eq('stripe_product_id', product.id);
        return;
      }
      const prices = [];
      for await (const p of stripe.prices.list({ product: product.id, active: true, limit: 100 })) {
        prices.push(p);
      }
      const paymentLinkIndex = await buildPaymentLinkIndex(stripe);
      await upsertProductFromStripe(product, prices, paymentLinkIndex, integration.user_id);
    } catch (err) {
      console.log(`[stripe] price.* webhook handler error: ${err.message}`);
    }
    return;
  }

  if (event.type === 'charge.succeeded' || event.type === 'charge.failed') {
    const charge = event.data.object;
    await supabase.from('integration_data').upsert({
      user_id: integration.user_id,
      integration_id: integration.id,
      provider: 'stripe',
      data_type: 'payment',
      external_id: charge.id,
      title: `Payment ${charge.status}: ${(charge.amount / 100).toFixed(2)} ${charge.currency.toUpperCase()}`,
      content: charge.description || '',
      metadata: {
        amount: charge.amount,
        currency: charge.currency,
        status: charge.status,
        customer: charge.customer,
        receipt_email: charge.receipt_email,
        created: charge.created,
      },
      synced_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
  }

  if (event.type.startsWith('customer.subscription.')) {
    const sub = event.data.object;
    const planName = sub.items?.data?.[0]?.price?.nickname || 'Unknown Plan';
    const amount = sub.items?.data?.[0]?.price?.unit_amount || 0;
    const currency = sub.items?.data?.[0]?.price?.currency || 'usd';

    await supabase.from('integration_data').upsert({
      user_id: integration.user_id,
      integration_id: integration.id,
      provider: 'stripe',
      data_type: 'subscription',
      external_id: sub.id,
      title: `Subscription: ${planName} — ${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`,
      content: '',
      metadata: {
        status: sub.status,
        customer: sub.customer,
        plan: planName,
        amount,
        currency,
        created: sub.created,
      },
      synced_at: new Date().toISOString(),
    }, { onConflict: 'integration_id,external_id', ignoreDuplicates: false });
  }
}
