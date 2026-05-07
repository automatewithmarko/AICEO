-- Delete test@gmail.com and all their data.
-- Run against your Supabase SQL editor. Review the SELECT first to confirm
-- the right user is matched before uncommenting the DELETEs.

-- Step 1: Find the user ID
-- SELECT id, email FROM auth.users WHERE email = 'test@gmail.com';

-- Step 2: Delete from all per-user tables (order: dependents first)
DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'test@gmail.com';
  IF uid IS NULL THEN
    RAISE NOTICE 'No user found with email test@gmail.com — nothing to delete.';
    RETURN;
  END IF;

  RAISE NOTICE 'Deleting user % (test@gmail.com)…', uid;

  -- Content & sessions
  DELETE FROM content_items WHERE user_id = uid;
  DELETE FROM content_sessions WHERE user_id = uid;
  DELETE FROM artifact_versions WHERE user_id = uid;
  DELETE FROM social_posts WHERE user_id = uid;
  DELETE FROM carousel_templates WHERE user_id = uid;

  -- Marketing / brand
  DELETE FROM brand_dna WHERE user_id = uid;
  DELETE FROM soul_notes WHERE user_id = uid;

  -- CRM & sales
  DELETE FROM contacts WHERE user_id = uid;
  DELETE FROM sales WHERE user_id = uid;
  DELETE FROM manual_sales WHERE user_id = uid;
  DELETE FROM sales_calls WHERE user_id = uid;
  DELETE FROM products WHERE user_id = uid;

  -- Forms (branching rules & responses reference forms)
  DELETE FROM form_branching_rules WHERE form_id IN (SELECT id FROM forms WHERE user_id = uid);
  DELETE FROM form_responses WHERE form_id IN (SELECT id FROM forms WHERE user_id = uid);
  DELETE FROM forms WHERE user_id = uid;

  -- Email
  DELETE FROM emails WHERE user_id = uid;
  DELETE FROM email_accounts WHERE user_id = uid;

  -- Meetings & recordings
  DELETE FROM external_recording_contacts WHERE user_id = uid;
  DELETE FROM meetings WHERE user_id = uid;
  DELETE FROM calendar_connections WHERE user_id = uid;
  DELETE FROM meeting_templates WHERE user_id = uid;

  -- Integrations
  DELETE FROM integration_data WHERE user_id = uid;
  DELETE FROM integrations WHERE user_id = uid;
  DELETE FROM instagram_accounts WHERE user_id = uid;

  -- Outlier detector
  DELETE FROM outlier_videos WHERE user_id = uid;
  DELETE FROM outlier_creators WHERE user_id = uid;

  -- Billing & credits
  DELETE FROM credit_transactions WHERE user_id = uid;
  DELETE FROM credits WHERE user_id = uid;
  DELETE FROM subscriptions WHERE user_id = uid;

  -- Profile
  DELETE FROM profiles WHERE id = uid;

  -- Auth user (last — everything else references this)
  DELETE FROM auth.users WHERE id = uid;

  RAISE NOTICE 'Done — user % fully removed.', uid;
END $$;
