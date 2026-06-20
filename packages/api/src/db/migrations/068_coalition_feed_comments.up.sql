-- Coalition feed comments. Flat (non-threaded) comments on a feed item; id-keyed.
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store.
-- Columns mirror CoalitionFeedComment in @blackout/core. Newest-first ordering is
-- applied in the read path.

CREATE TABLE coalition_feed_comments (
  id TEXT PRIMARY KEY,
  feed_item_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_feed_comments_item ON coalition_feed_comments (feed_item_id);
