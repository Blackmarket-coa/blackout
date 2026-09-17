DROP INDEX IF EXISTS idx_coalition_campaign_posts_milestone;
ALTER TABLE coalition_campaign_posts DROP COLUMN IF EXISTS milestone;
