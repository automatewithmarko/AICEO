-- Phase 3: support for refund pro-rating and chargeback freezes.
-- Apply via Supabase SQL Editor. All statements are idempotent.

-- ────────────────────────────────────────────────────────────
-- 1. credit_transactions.stripe_invoice_id — lets the
--    charge.refunded handler find the exact credit deposit to
--    revoke against. Populated on every refill/seed that comes
--    from a Stripe invoice event.
-- ────────────────────────────────────────────────────────────
ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_stripe_invoice
  ON credit_transactions(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. subscriptions.disputed — set to true when Stripe fires
--    charge.dispute.created for the customer's charge. The
--    frontend shows a chargeback banner and the feature-gate
--    middleware denies paid actions until it's resolved.
--    Flipped back to false on charge.dispute.closed (won).
-- ────────────────────────────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS disputed boolean DEFAULT false NOT NULL;
