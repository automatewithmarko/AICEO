-- Marketing chat sessions — one table for all marketing tools
-- (newsletter, landing, squeeze, dm, story, etc.). `tool` filters per-tab
-- so each tool's "Previous conversations" drawer is scoped to its own
-- history. Stores the full canvas + story frames alongside messages so
-- reloading a session restores the workspace exactly.

CREATE TABLE IF NOT EXISTS marketing_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool text NOT NULL DEFAULT 'newsletter',
  title text NOT NULL DEFAULT 'New conversation',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  canvas_html text,
  story_frames jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Fast per-user per-tool lookups sorted by recency
CREATE INDEX IF NOT EXISTS idx_marketing_sessions_user_tool
  ON marketing_sessions(user_id, tool, updated_at DESC);

ALTER TABLE marketing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own marketing sessions" ON marketing_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own marketing sessions" ON marketing_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own marketing sessions" ON marketing_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own marketing sessions" ON marketing_sessions
  FOR DELETE USING (auth.uid() = user_id);
