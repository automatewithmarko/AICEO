-- Content studio chat sessions
CREATE TABLE IF NOT EXISTS content_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  platform text NOT NULL DEFAULT 'instagram',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast user lookups sorted by recency
CREATE INDEX IF NOT EXISTS idx_content_sessions_user ON content_sessions(user_id, updated_at DESC);

-- RLS policies
ALTER TABLE content_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions" ON content_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON content_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON content_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON content_sessions
  FOR DELETE USING (auth.uid() = user_id);
