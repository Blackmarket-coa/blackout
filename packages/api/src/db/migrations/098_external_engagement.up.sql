-- Engagement counts, and a coalition's own answer for inbound replies.
--
-- Counts live apart from `coalition_external_activity` on purpose. That table
-- holds words a stranger wrote, quarantined until a human approves them; this
-- one holds numbers nobody wrote, which name nobody and cannot carry abuse, so
-- they flow in unmoderated. One table for both would force one answer: either a
-- steward approves a like counter, or unreviewed text appears under a
-- coalition's banner.
--
-- One row per post per platform, overwritten on each read. A current reading,
-- not a ledger — a withdrawn like should lower the number, and keeping a
-- history of counts nobody asked for is retention for its own sake.
CREATE TABLE IF NOT EXISTS coalition_campaign_engagement (
  id TEXT PRIMARY KEY,
  campaign_post_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  coalition_id TEXT NOT NULL,
  platform VARCHAR(16) NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  reshares INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (campaign_post_id)
);
CREATE INDEX IF NOT EXISTS idx_coalition_campaign_engagement_campaign
  ON coalition_campaign_engagement (campaign_id);

-- NULL means `moderated`. A coalition decides for its own mission whether a
-- stranger's reply waits for a steward, appears as it arrives, or is refused.
ALTER TABLE coalitions ADD COLUMN IF NOT EXISTS external_reply_policy VARCHAR(16);
