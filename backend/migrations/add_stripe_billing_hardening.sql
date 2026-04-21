-- Phase 1 hardening of the Stripe billing integration.
-- Apply via Supabase SQL editor. All statements are idempotent.

-- ────────────────────────────────────────────────────────────
-- 1. stripe_events — dedupe table so Stripe retries don't cause
--    double credit refills, double subscription activations, etc.
--    We insert-on-conflict at the start of the webhook; if the row
--    already existed, we skip processing.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_events (
  id text PRIMARY KEY,              -- Stripe event.id (evt_...)
  type text,
  received_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at
  ON stripe_events(received_at DESC);

-- ────────────────────────────────────────────────────────────
-- 2. profiles.stripe_customer_id — stored the first time we create
--    a Customer for the user so the webhook can resolve the user
--    in O(1) instead of listing all auth.users and matching by email.
-- ────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. subscriptions: track the exact Stripe Price + tier (standard
--    vs boost) so the UI can render "You're on Boost" correctly
--    and we can tell upgrades (plan change) from tier switches.
-- ────────────────────────────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS tier text;

-- ────────────────────────────────────────────────────────────
-- 4. credit_transactions.stripe_event_id — ties a refill/charge
--    back to the exact Stripe event that caused it. Combined with
--    stripe_events above, gives end-to-end auditability.
-- ────────────────────────────────────────────────────────────
ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_event
  ON credit_transactions(stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
