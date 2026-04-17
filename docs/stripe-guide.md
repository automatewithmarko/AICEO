# Stripe Platform Webhook Setup Guide

How to connect AICEO's backend to Stripe so subscription events (checkout, plan changes, renewals, cancellations, failed payments) are handled automatically.

---

## Prerequisites

- A Stripe account with API access ([dashboard.stripe.com](https://dashboard.stripe.com))
- Railway CLI linked to the `aiceo-backend` project
- Stripe CLI (optional, for local testing) — install via `brew install stripe/stripe-cli/stripe` or [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli)

---

## Architecture

Two separate Stripe webhook endpoints coexist:

| Endpoint | Purpose | URL |
|---|---|---|
| `POST /api/webhooks/stripe` | **Platform billing** — handles AICEO's own subscription lifecycle (this guide) | `https://aiceo-backend-production.up.railway.app/api/webhooks/stripe` |
| `POST /api/webhooks/stripe/:userId` | **Per-user integration** — syncs a user's connected Stripe data (charges, customers, subscriptions from THEIR Stripe) | `https://aiceo-backend-production.up.railway.app/api/webhooks/stripe/<user-uuid>` |

This guide covers the **platform billing** webhook only.

---

## Step 1 — Get your platform Stripe keys

1. Go to [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys).
2. Copy the **Secret key** (`sk_live_...` for production, `sk_test_...` for testing).

> This is YOUR platform's key, not a user's connected key.

---

## Step 2 — Set the secret key on Railway

```bash
cd backend
railway variables --set STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
```

---

## Step 3 — Create the webhook endpoint in Stripe

1. Go to [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks).
2. Click **"Add endpoint"**.
3. **Endpoint URL:**
   ```
   https://aiceo-backend-production.up.railway.app/api/webhooks/stripe
   ```
4. **Events to listen to** — select exactly these:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Click **"Add endpoint"**.
6. Stripe shows the **Signing secret** (`whsec_...`) — copy it immediately.

---

## Step 4 — Set the webhook secret on Railway and deploy

```bash
railway variables --set STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
railway up
```

The backend must be redeployed after setting the env vars so it picks them up.

---

## Step 5 — Wire checkout sessions to include `user_id`

When creating a Stripe Checkout Session anywhere in your codebase (signup flow, plan upgrade page, billing portal), include the Supabase user ID in metadata:

```js
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer_email: user.email,
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: 'https://yourapp.com/dashboard?checkout=success',
  cancel_url: 'https://yourapp.com/pricing',
  metadata: {
    user_id: supabaseUserId,   // <-- critical for webhook matching
  },
  subscription_data: {
    metadata: {
      user_id: supabaseUserId, // <-- also set on the subscription object
    },
  },
});
```

**Why this matters:** the webhook resolves the AICEO user in this priority order:

1. `metadata.user_id` on the Stripe object (fastest, most reliable)
2. `metadata.user_id` on the Stripe customer object
3. Customer email matched against `auth.users` (fallback, slower)

Without `metadata.user_id`, the webhook still works via email matching — but it's less reliable (email mismatches, multiple accounts, etc.).

---

## Step 6 — Add columns to `subscriptions` table (if missing)

The webhook upserts with these fields. Run this in the Supabase SQL editor if the columns don't exist yet:

```sql
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Optional: index for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON subscriptions(stripe_subscription_id);
```

---

## Event handling reference

| Stripe event | What the webhook does | `subscriptions` table change |
|---|---|---|
| `checkout.session.completed` | Retrieves the subscription, extracts plan from price lookup_key/nickname, upserts row | `plan`, `status='active'`, `stripe_subscription_id`, `stripe_customer_id`, period dates |
| `customer.subscription.updated` | Detects plan change, renewal, or pending cancellation | Updates `plan`, `status` ('active' or 'canceling' if `cancel_at_period_end`), period dates |
| `customer.subscription.deleted` | Subscription fully cancelled | `status='cancelled'` |
| `invoice.paid` | Logs successful payment (extensible — add credit grants here) | No change (log only) |
| `invoice.payment_failed` | Payment failed — grace period | `status='past_due'` |

---

## Local testing with Stripe CLI

```bash
# Terminal 1 — forward Stripe events to your local backend
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# The CLI prints a whsec_... for local use — set it in backend/.env:
# STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

# Terminal 2 — trigger a test event
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

Check your backend logs for `[webhook/stripe-global]` entries confirming receipt and processing.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Stripe shows webhook failures (400) | Signature verification failed | Confirm `STRIPE_WEBHOOK_SECRET` matches what Stripe shows on the endpoint page. Redeploy after changing the var. |
| Events received but user not matched | No `metadata.user_id` and email doesn't match | Add `metadata.user_id` to your checkout session creation (Step 5). |
| `subscriptions` upsert fails | Missing columns | Run the ALTER TABLE from Step 6. |
| Events silently ignored | Unhandled event type | The webhook only processes the 6 listed event types. Add handlers in `webhooks.js` for others. |
| Works locally but not on Railway | Env vars not set or backend not redeployed | Run `railway variables` to verify, then `railway up` to redeploy. |

---

## Security notes

- The raw body middleware (`express.raw`) is registered in `server.js:36` specifically for `/api/webhooks/stripe` routes — this is required for Stripe signature verification to work (it needs the unparsed body, not JSON-parsed).
- In production, ALWAYS use `STRIPE_WEBHOOK_SECRET`. The fallback raw-parse path (no secret) exists only for local dev convenience and logs a warning.
- Never expose `STRIPE_SECRET_KEY` to the frontend. It stays on Railway env vars only.
