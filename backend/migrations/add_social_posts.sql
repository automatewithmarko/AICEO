-- Social posts published by the user (per platform). Populated by future publish
-- flows; read now by the Dashboard "Content Published" overview card.
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  content_session_id uuid REFERENCES content_sessions(id) ON DELETE SET NULL,
  external_post_id text,
  url text,
  caption text,
  thumbnail_url text,
  published_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(user_id, platform, published_at DESC);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own social posts" ON social_posts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own social posts" ON social_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own social posts" ON social_posts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own social posts" ON social_posts
  FOR DELETE USING (auth.uid() = user_id);
