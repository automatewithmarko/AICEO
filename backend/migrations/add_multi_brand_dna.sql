-- Migration: Support multiple Brand DNAs per user
-- Each user gets one default Brand DNA; additional ones cost $99/month (enforced in app)

-- 1. Add UUID primary key and name column
ALTER TABLE brand_dna ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE brand_dna ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'My Brand';

-- 2. Backfill id for existing rows that have NULL id
UPDATE brand_dna SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE brand_dna SET name = 'My Brand' WHERE name IS NULL;

-- 3. Drop existing primary key / unique constraint on user_id
ALTER TABLE brand_dna DROP CONSTRAINT IF EXISTS brand_dna_pkey;
ALTER TABLE brand_dna DROP CONSTRAINT IF EXISTS brand_dna_user_id_key;

-- 4. Set id as the new primary key
ALTER TABLE brand_dna ADD PRIMARY KEY (id);

-- 5. Keep user_id indexed for fast lookups
CREATE INDEX IF NOT EXISTS idx_brand_dna_user_id ON brand_dna(user_id);
