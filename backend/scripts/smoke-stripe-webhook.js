#!/usr/bin/env node
// Smoke test for the per-user Stripe integration webhook.
//
// Posts a synthetic Stripe-style event to /api/webhooks/stripe/:userId
// against a deployed AICEO backend. Useful for confirming the webhook
// endpoint is reachable, the signature path works, and the handler
// landed the event in the database — without needing a real Stripe
// account to push a real webhook.
//
// Usage:
//   node backend/scripts/smoke-stripe-webhook.js \
//     --url https://aiceo-backend.up.railway.app \
//     --user <user-uuid> \
//     [--secret whsec_xxx] \
//     [--type product.created|charge.succeeded] \
//     [--product-id prod_xxx]
//
// The two test modes:
//
//   --type charge.succeeded (default — self-contained connectivity test)
//     Fires a fake charge event. The handler upserts a row into
//     integration_data with the synthetic charge id. Verifies the
//     webhook plumbing end-to-end without touching the user's real
//     Stripe account.
//
//   --type product.created (exercises Option B bidirectional code path)
//     Fires a fake product event. The handler will call
//     stripe.prices.list against the user's Stripe key. For the upsert
//     to actually land, pass --product-id pointing at a real Stripe
//     product in the user's account that has at least one active price.
//     Without a real id, the handler runs but skips the insert because
//     prices.list returns empty for the synthetic id — still useful as
//     a connectivity + signature check.

import crypto from 'crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    user: { type: 'string' },
    secret: { type: 'string' },
    type: { type: 'string', default: 'charge.succeeded' },
    'product-id': { type: 'string' },
  },
});

if (!values.url || !values.user) {
  console.error('Usage: --url <backend-url> --user <user-uuid> [--secret whsec_xxx] [--type product.created|charge.succeeded] [--product-id prod_xxx]');
  process.exit(1);
}

const ALLOWED_TYPES = ['charge.succeeded', 'charge.failed', 'product.created', 'product.updated', 'product.deleted'];
if (!ALLOWED_TYPES.includes(values.type)) {
  console.error(`Unsupported --type "${values.type}". Allowed: ${ALLOWED_TYPES.join(', ')}`);
  process.exit(1);
}

function signStripePayload(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const v1 = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function buildEvent(type, productId) {
  const now = Math.floor(Date.now() / 1000);
  const evt = {
    id: `evt_smoke_${now}_${Math.random().toString(36).slice(2, 8)}`,
    object: 'event',
    api_version: '2024-10-28.acacia',
    created: now,
    type,
    data: { object: null },
  };

  if (type.startsWith('charge.')) {
    evt.data.object = {
      id: `ch_smoke_${now}`,
      object: 'charge',
      amount: 4200,
      currency: 'usd',
      status: type === 'charge.succeeded' ? 'succeeded' : 'failed',
      customer: null,
      receipt_email: 'smoke@aiceo.local',
      description: 'AICEO smoke test charge',
      created: now,
    };
  } else if (type.startsWith('product.')) {
    evt.data.object = {
      id: productId || `prod_smoke_${now}`,
      object: 'product',
      name: 'AICEO Smoke Test Product',
      description: 'Synthetic event from smoke-stripe-webhook.js',
      active: type !== 'product.deleted',
      metadata: { source: 'aiceo-smoke-test' },
      created: now,
      updated: now,
    };
  }
  return evt;
}

async function main() {
  const url = `${values.url.replace(/\/$/, '')}/api/webhooks/stripe/${values.user}`;
  const event = buildEvent(values.type, values['product-id']);
  const body = JSON.stringify(event);

  const headers = { 'Content-Type': 'application/json' };
  if (values.secret) {
    headers['stripe-signature'] = signStripePayload(body, values.secret);
  }

  console.log(`POST  ${url}`);
  console.log(`Type  ${event.type}`);
  console.log(`Obj   ${event.data.object.id}`);
  console.log(`Sig   ${values.secret ? 'HMAC signed' : 'unsigned (route falls back to direct parse if secret unset)'}`);

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch (err) {
    console.error(`\nFAILED to reach backend: ${err.message}`);
    process.exit(1);
  }

  const text = await res.text();
  console.log(`\nResponse  ${res.status}`);
  console.log(text);

  console.log('\nVerify in Supabase SQL editor:');
  if (event.type.startsWith('product.')) {
    console.log(`-- New AICEO product row (only present if --product-id was a real Stripe product with active prices):`);
    console.log(`SELECT id, name, payment_processor, stripe_product_id, updated_at`);
    console.log(`  FROM products`);
    console.log(`  WHERE user_id = '${values.user}'`);
    console.log(`    AND stripe_product_id = '${event.data.object.id}';`);
  } else {
    console.log(`SELECT external_id, title, data_type, metadata, synced_at`);
    console.log(`  FROM integration_data`);
    console.log(`  WHERE user_id = '${values.user}'`);
    console.log(`    AND provider = 'stripe'`);
    console.log(`    AND external_id = '${event.data.object.id}';`);
  }

  if (!res.ok) process.exit(2);
}

main().catch((err) => {
  console.error('UNEXPECTED ERROR:', err);
  process.exit(1);
});
