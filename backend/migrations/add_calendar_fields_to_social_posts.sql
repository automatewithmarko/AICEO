-- Add calendar scheduling fields to social_posts
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS content_type text; -- post, reel, carousel, story
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(user_id, status, scheduled_at);
