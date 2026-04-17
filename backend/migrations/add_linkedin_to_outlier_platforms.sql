-- Allow 'linkedin' as a platform value on outlier_creators + outlier_videos.
-- The original CHECK constraint only permitted youtube/tiktok/instagram, so
-- inserting a LinkedIn creator from the UI raises:
--   new row for relation "outlier_creators" violates check constraint
--   "outlier_creators_platform_check"
ALTER TABLE outlier_creators
  DROP CONSTRAINT IF EXISTS outlier_creators_platform_check;

ALTER TABLE outlier_creators
  ADD CONSTRAINT outlier_creators_platform_check
  CHECK (platform IN ('youtube', 'tiktok', 'instagram', 'linkedin'));

ALTER TABLE outlier_videos
  DROP CONSTRAINT IF EXISTS outlier_videos_platform_check;

ALTER TABLE outlier_videos
  ADD CONSTRAINT outlier_videos_platform_check
  CHECK (platform IN ('youtube', 'tiktok', 'instagram', 'linkedin'));
