-- Users who pay the Complete or Diamond one-time setup fee get 12 months
-- of full platform access with no monthly subscription required.
-- free_year_until stores the expiry date; access is gated by checking
-- whether this timestamp is still in the future.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS free_year_until timestamptz;
