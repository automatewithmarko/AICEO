-- Sales calls context table — read by the AI CEO orchestrator
-- (backend/services/context.js) and the stagedemo assistant
-- (backend/routes/stagedemo.js toolGetRecentCalls). Populated by
-- POST /api/sales/calls/:id/add-to-context ("Add to context" button
-- in the Sales page Call Intelligence section).
CREATE TABLE IF NOT EXISTS sales_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meeting_id UUID,
  title TEXT,
  summary TEXT,
  action_items JSONB DEFAULT '[]'::jsonb,
  participants JSONB DEFAULT '[]'::jsonb,
  duration INTEGER, -- seconds (stagedemo divides by 60 for minutes)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_calls_user_id ON sales_calls(user_id);
-- One context entry per meeting per user — makes add-to-context idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_calls_user_meeting ON sales_calls(user_id, meeting_id);

-- Backend accesses sales_calls with the service role (bypasses RLS);
-- RLS here just blocks direct PostgREST access by other users.
ALTER TABLE sales_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sales_calls" ON sales_calls
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
