-- Which milestone produced an automated post, and the idempotency key for it.
--
-- NULL on every manual post — a member pressing share — which is what keeps the
-- automated and manual paths from suppressing each other: sharing a drive must
-- not consume its launch announcement, and announcing a launch must not count
-- against a member's daily cross-post cap.
--
-- The unique index is the whole mechanism. The milestone sweep has no queue and
-- no cursor; it recomputes what a campaign has reached and relies on this
-- constraint to make "post it once, ever" true even if two ticks overlap or a
-- second process starts.
ALTER TABLE coalition_campaign_posts ADD COLUMN IF NOT EXISTS milestone VARCHAR(16);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coalition_campaign_posts_milestone
  ON coalition_campaign_posts (campaign_id, platform, milestone)
  WHERE milestone IS NOT NULL;
