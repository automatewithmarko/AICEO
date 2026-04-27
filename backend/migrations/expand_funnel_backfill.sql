-- Expand the original add_funnel_state_columns.sql backfill so it covers
-- legacy phantom rows too.
--
-- The first migration only stamped setup_paid_at / meeting_booked_at on
-- rows that already had a stripe_subscription_id, on the theory that "no
-- Stripe sub id = unpaid, must go through the new funnel". In practice
-- the old AuthContext.signup() inserted phantom rows with status='active'
-- BEFORE any payment, and there are also legacy paid rows whose Stripe
-- ID never made it into our row for one reason or another. Both
-- categories show up to the funnel as "no setup paid yet" and get
-- routed back to the setup picker on sign-in, which is wrong — these
-- accounts predate the funnel and the user reasonably expects "I had a
-- plan" to mean "let me into the app".
--
-- This statement broadens the backfill: any row whose status looks
-- active gets the funnel timestamps stamped to its created_at, so the
-- new "grandfather" branch in has_active_monthly recognises it as done.
-- Brand-new signups have no row yet and are unaffected; mid-funnel
-- users (status='setup_paid') are also unaffected because they don't
-- match the WHERE clause.
--
-- Idempotent: only updates rows where setup_paid_at IS NULL.
-- Apply via Supabase SQL editor.

UPDATE subscriptions
SET
  setup_paid_at     = COALESCE(setup_paid_at,     created_at, NOW()),
  meeting_booked_at = COALESCE(meeting_booked_at, created_at, NOW())
WHERE status IN ('active', 'canceling', 'past_due', 'paused', 'trialing')
  AND setup_paid_at IS NULL;
