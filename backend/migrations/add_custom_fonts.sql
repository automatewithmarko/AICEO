-- Custom uploaded fonts for Brand DNA.
-- Each entry: { "name": "...", "url": "...", "path": "...", "format": "woff2|woff|ttf|otf" }
ALTER TABLE brand_dna ADD COLUMN IF NOT EXISTS custom_fonts JSONB DEFAULT '[]'::jsonb;

-- Public bucket for uploaded font files (uploads go through the backend
-- service role; public read so generated pages can @font-face them).
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-fonts', 'brand-fonts', true)
ON CONFLICT (id) DO NOTHING;
