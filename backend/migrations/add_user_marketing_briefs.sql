-- Active campaign brief — one row per user. Read by Marketing AI agents
-- (backend/routes/orchestrate.js → marketing-* delegates) so every tool
-- (newsletter, landing, squeeze, lead-magnet, story, dm) sees the same
-- offer/audience/tone/goal/benefit without the user re-explaining their
-- campaign per tab. Edited from the Marketing UI (CampaignBriefCard) and
-- auto-captured when the CEO orchestrator finishes its 4 discovery
-- questions. The UNIQUE (user_id) constraint keeps "single active brief"
-- semantics — overwriting starts a new campaign cleanly.
CREATE TABLE IF NOT EXISTS user_marketing_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer TEXT,            -- product/service/topic the campaign is about
  audience TEXT,         -- ICP + pain point
  tone TEXT,             -- voice/style preference
  goal TEXT,             -- sell / book / list-build / educate / etc.
  key_benefit TEXT,      -- main USP / promise
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_marketing_briefs_user
  ON user_marketing_briefs(user_id);

-- Backend reads with service role (bypasses RLS); RLS here just blocks
-- direct PostgREST access from other users in case the table is ever
-- exposed via the JS client.
ALTER TABLE user_marketing_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own marketing brief" ON user_marketing_briefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
