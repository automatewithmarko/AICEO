-- Pin a calendar post to a specific BooSend Instagram account.
-- A BooSend workspace can hold multiple IG accounts; the picker in the
-- publish/schedule UIs stores the chosen account's BooSend row UUID here.
-- NULL = let BooSend auto-resolve the first active account (old behavior).
-- Apply via Supabase SQL editor (raw SQL, same as the other migrations).
alter table social_posts add column if not exists ig_account_id text;
