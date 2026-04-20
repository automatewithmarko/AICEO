-- Saved design systems from past carousels. Creators posting weekly want
-- the next carousel to inherit the same palette, typography, badge style,
-- glow strategy, etc. — one-click consistency across a series.
--
-- preview_url: a small thumbnail (usually the hook slide) so the template
--              picker shows more than just swatches.

CREATE TABLE IF NOT EXISTS carousel_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  design_system jsonb NOT NULL,
  preview_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carousel_templates_user
  ON carousel_templates(user_id, created_at DESC);

ALTER TABLE carousel_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own carousel templates" ON carousel_templates
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own carousel templates" ON carousel_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own carousel templates" ON carousel_templates
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own carousel templates" ON carousel_templates
  FOR DELETE USING (auth.uid() = user_id);
