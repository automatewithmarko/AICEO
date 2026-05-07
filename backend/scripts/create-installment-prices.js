#!/usr/bin/env node
// One-time script to create the 4 installment Stripe Prices via the API.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_live_... node backend/scripts/create-installment-prices.js
//
// For test mode:
//   STRIPE_SECRET_KEY=sk_test_... node backend/scripts/create-installment-prices.js
//
// The script creates (or reuses) two Stripe Products — one for each plan —
// then creates a recurring monthly Price for each instalment tier. It prints
// the env vars you need to set on Railway / Netlify.

import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Set STRIPE_SECRET_KEY before running this script.');
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: '2024-10-28.acacia' });

const PLANS = [
  {
    internalId: 'complete',
    displayName: 'Core — Instalment Setup Fee',
    installments: [
      { key: '3x', amountCents: 1099_00, months: 3 },
      { key: '6x', amountCents: 625_00,  months: 6 },
    ],
  },
  {
    internalId: 'diamond',
    displayName: 'Diamond — Instalment Setup Fee',
    installments: [
      { key: '3x', amountCents: 1432_00, months: 3 },
      { key: '6x', amountCents: 791_00,  months: 6 },
    ],
  },
];

async function main() {
  const envLines = [];

  for (const plan of PLANS) {
    // Create (or find) the Product for this plan's instalments.
    const product = await stripe.products.create({
      name: plan.displayName,
      metadata: { aiceo_plan: plan.internalId, purpose: 'installment_setup_fee' },
    });
    console.log(`Created product: ${product.id} — ${product.name}`);

    for (const inst of plan.installments) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: inst.amountCents,
        currency: 'usd',
        recurring: {
          interval: 'month',
          interval_count: 1,
        },
        metadata: {
          aiceo_plan: plan.internalId,
          installment: inst.key,
          total_cycles: String(inst.months),
        },
        nickname: `${plan.internalId} setup ${inst.key} ($${inst.amountCents / 100}/mo × ${inst.months})`,
      });

      const envKey = `STRIPE_PRICE_${plan.internalId.toUpperCase()}_INSTALL_${inst.key.toUpperCase()}`;
      envLines.push(`${envKey}=${price.id}`);
      console.log(`  Created price: ${price.id} — $${inst.amountCents / 100}/mo × ${inst.months} months`);
    }
  }

  console.log('\n── Copy these into your Railway / Netlify env ──\n');
  for (const line of envLines) {
    console.log(line);
  }

  console.log('\n── IMPORTANT ──');
  console.log('Each instalment subscription must be cancelled after N cycles.');
  console.log('The checkout handler sets cancel_at on the subscription to');
  console.log('enforce this. No manual Stripe Dashboard config needed.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
