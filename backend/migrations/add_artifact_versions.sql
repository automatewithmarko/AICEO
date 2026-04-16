-- Version history for AI CEO generated artifacts (landing pages, squeeze
-- pages, newsletters, etc.). Every time the artifact reaches a stable state
-- (full generation completes, or a file-based edit finishes applying its
-- tool calls) a new row is inserted so the user can revert later — Cursor-
-- style. Revert actions also create a new row (is_revert=true) pointing to
-- old content, so history is always forward-only and you can walk back
-- and forth.

CREATE TABLE IF NOT EXISTS artifact_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid,
  agent_name text NOT NULL,
  message_id text,
  version_number int NOT NULL DEFAULT 1,
  content text NOT NULL,
  summary text,
  is_revert boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifact_versions_session
  ON artifact_versions(user_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_versions_agent
  ON artifact_versions(user_id, agent_name, created_at DESC);

ALTER TABLE artifact_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own artifact versions" ON artifact_versions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own artifact versions" ON artifact_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own artifact versions" ON artifact_versions
  FOR DELETE USING (auth.uid() = user_id);
