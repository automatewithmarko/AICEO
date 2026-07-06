-- Tracks whether we've sent a welcome email to a given signup.
-- The POST /api/notify/welcome endpoint upserts here with an ON
-- CONFLICT DO NOTHING check to ensure exactly-once delivery even
-- when the frontend fires it multiple times (retries, tab reloads,
-- concurrent signup attempts).
--
-- Dedup key is user_id (PK) — one welcome per auth user, ever.
-- We also index email so a legacy "email exists but user record
-- was deleted and recreated" case can be spotted from the logs.
CREATE TABLE IF NOT EXISTS welcome_emails_sent (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  provider TEXT,            -- 'zorromail' | 'resend' | null when send failed
  message_id TEXT,          -- provider's message id, useful for support
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_welcome_emails_sent_email ON welcome_emails_sent (lower(email));

-- Backend accesses with service role only. Enable RLS to block direct
-- PostgREST reads from the frontend just in case someone points supabase-js
-- at it.
ALTER TABLE welcome_emails_sent ENABLE ROW LEVEL SECURITY;
-- No policy → deny-all for non-service-role clients.
