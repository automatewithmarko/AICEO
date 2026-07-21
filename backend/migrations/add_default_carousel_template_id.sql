-- Per-user default premade carousel template (curated registry id from
-- backend/agents/content/curated-carousel-templates.js). Applied
-- server-side to every plan_carousel call that has no explicit template
-- selection — both AI CEO and /Content tabs.
-- Applied to the shared Supabase project on 2026-07-21 via MCP
-- (migration name: add_default_carousel_template_id_to_brand_dna).
ALTER TABLE brand_dna ADD COLUMN IF NOT EXISTS default_carousel_template_id text;
