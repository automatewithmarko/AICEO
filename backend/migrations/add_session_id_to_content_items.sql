-- Scope content_items (sidebar photos/docs/social) to a chat session.
-- Items with session_id = NULL are treated as "library" items (e.g. outlier
-- adds) and no longer auto-populate the Content chat sidebar.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS session_id uuid
  REFERENCES content_sessions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_content_items_session
  ON content_items(session_id);

CREATE INDEX IF NOT EXISTS idx_content_items_user_session
  ON content_items(user_id, session_id);
