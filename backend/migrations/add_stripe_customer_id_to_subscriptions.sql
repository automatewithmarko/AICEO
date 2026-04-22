-- Add the missing stripe_customer_id column on subscriptions.
--
-- Why this is critical: the webhook handler upserts this column on
-- every checkout.session.completed and customer.subscription.updated.
-- Without the column, Supabase rejects the upsert with PGRST204 and
-- the entire row is never written → user pays for a subscription that
-- never appears in the database → AuthContext sees no plan → the
-- PlanSelector overlay re-appears on every page load. They're stuck
-- in a loop while we collected their money.
--
-- The original schema (pre-Phase 1) accidentally only had
-- stripe_subscription_id and skipped stripe_customer_id. The Phase 1
-- migration assumed it already existed. This patches the gap.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
