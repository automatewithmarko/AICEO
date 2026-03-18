-- Add logos JSONB column to support multiple logos (up to 3) with names and default flag
-- Each entry: { "url": "...", "name": "...", "isDefault": true/false }
-- Keeps logo_url in sync with default logo for backward compatibility

ALTER TABLE brand_dna ADD COLUMN IF NOT EXISTS logos JSONB DEFAULT '[]'::jsonb;

-- Migrate existing logo_url data into logos array
UPDATE brand_dna
SET logos = jsonb_build_array(
  jsonb_build_object('url', logo_url, 'name', 'Logo', 'isDefault', true)
)
WHERE logo_url IS NOT NULL
  AND (logos IS NULL OR logos = '[]'::jsonb);
