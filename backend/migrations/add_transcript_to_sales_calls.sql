-- Add full transcript text to sales_calls so meetings added to context
-- carry the actual meeting content, not just calendar-level placeholder
-- fields (title, date, participants, action items, one-line summary).
--
-- Nullable — older rows keep no transcript, and the add-to-context route
-- also inserts null when the source meeting has no transcript_text yet
-- (though it also refuses to insert those cases going forward; see
-- backend/routes/sales.js).
--
-- The AI CEO / Marketing prompt formatter (backend/routes/orchestrate.js)
-- includes an excerpt of this text (~1500 chars per call) so agents can
-- reference actual discussion content when writing follow-ups, content
-- plans, or landing copy.
ALTER TABLE sales_calls
  ADD COLUMN IF NOT EXISTS transcript TEXT;
