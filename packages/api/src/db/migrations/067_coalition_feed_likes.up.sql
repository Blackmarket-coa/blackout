-- Coalition feed likes. One row per (feed_item_id, user_id); `active` toggles
-- off on unlike (rows are never deleted) to match the volunteer-signup pattern.
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store.
-- Columns mirror CoalitionFeedLike in @blackout/core. The UNIQUE constraint is
-- the target of the generic upsert's ON CONFLICT (feed_item_id, user_id).

CREATE TABLE coalition_feed_likes (
  id TEXT PRIMARY KEY,
  feed_item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (feed_item_id, user_id)
);
CREATE INDEX idx_coalition_feed_likes_item ON coalition_feed_likes (feed_item_id);
