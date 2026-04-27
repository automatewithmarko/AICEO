-- Two-step signup funnel: split the single bundled checkout into a one-time
-- setup payment, a coaching-call booking step, then the recurring monthly
-- subscription. Each step writes a timestamp on subscriptions so App.jsx
-- knows which gate to render.
--
-- Apply via Supabase SQL editor BEFORE shipping the new funnel code.
-- All statements are idempotent.

-- ────────────────────────────────────────────────────────────
-- 1. New funnel-state columns on subscriptions.
-- ────────────────────────────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS setup_paid_at timestamptz;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS meeting_booked_at timestamptz;

-- Track the Stripe Checkout Session that paid the setup fee, so a
-- duplicate webhook delivery can be deduped without relying on
-- stripe_events alone (defence in depth — stripe_events is wiped between
-- environment refreshes during development).
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS setup_checkout_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_setup_session
  ON subscriptions(setup_checkout_session_id)
  WHERE setup_checkout_session_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. Backfill existing customers.
--
-- Anyone who already has a real Stripe-backed active subscription paid
-- under the old bundled flow has implicitly cleared all funnel steps —
-- mark them done so App.jsx doesn't re-prompt them to "pay setup" or
-- "book a call". Phantom rows (no stripe_subscription_id) are left
-- alone; those users go through the new funnel.
-- ────────────────────────────────────────────────────────────
UPDATE subscriptions
SET
  setup_paid_at = COALESCE(setup_paid_at, created_at, NOW()),
  meeting_booked_at = COALESCE(meeting_booked_at, created_at, NOW())
WHERE stripe_subscription_id IS NOT NULL
  AND status IN ('active', 'canceling', 'past_due', 'paused');
