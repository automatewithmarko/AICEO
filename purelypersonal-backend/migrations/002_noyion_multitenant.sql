-- 002_noyion_multitenant.sql
-- Allow meetings created by Noyion users (a SEPARATE Supabase project) to be stored.
--
-- The backend talks to the DB with the service-role key, so RLS is bypassed and the
-- only blocker is the foreign key on meetings.user_id -> auth.users(id): Noyion user
-- IDs do not exist in THIS project's auth.users, so inserts would fail the FK.
--
-- Dropping the constraint keeps user_id as a plain UUID (still indexed, still used to
-- scope every query). Existing PurelyPersonal rows are unaffected. transcript_segments
-- and meeting_contacts reference meetings(id), not auth.users, so they need no change.
--
-- Run once on the PurelyPersonal Supabase project (SQL editor or supabase migration).

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_user_id_fkey;
