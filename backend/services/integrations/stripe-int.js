import Stripe from 'stripe';
import { supabase } from '../storage.js';

export async function validate(apiKey) {
  const stripe = new Stripe(apiKey);
  const balance = await stripe.balance.retrieve();
  return { currency: balance.available?.[0]?.currency || 'usd' };
}

export async function sync(integration) {
  const stripe = new Stripe(integration.api_key);
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
  try {
    paymentLinkIndex = await buildPaymentLinkIndex(stripe);

    for await (const product of stripe.products.list({ active: true, limit: 100 })) {
      // Fetch all prices for this product. Auto-pagination handles >10.
      const prices = [];
      for await (const price of stripe.prices.list({ product: product.id, active: true, limit: 100 })) {
        prices.push(price);
      }
      const ok = await upsertProductFromStripe(product, prices, paymentLinkIndex, integration.user_id);
      if (ok) synced++;
    }
  } catch (err) {
    console.log(`[stripe] Product catalog sync error: ${err.message}`);
  }
  return synced;
}

export async function handleWebhook(event, integration) {
  const stripe = new Stripe(integration.api_key);

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
