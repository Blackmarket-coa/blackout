-- Coalition ranked feed items (video/event/aid/listing/proposal). Previously an
-- in-memory seed array in coalitionStore.ts; this table makes the feed the
-- schema-of-record so community posts can be persisted. `score` is recomputed
-- at ranking time. Columns mirror CoalitionFeedItem in @blackout/core; tags is
-- JSONB.

CREATE TABLE coalition_feed_items (
  id TEXT PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  canopy_id TEXT,
  den_id TEXT,
  author_id TEXT,
  media_url TEXT,
  importance DOUBLE PRECISION NOT NULL,
  impact DOUBLE PRECISION NOT NULL,
  social_impact DOUBLE PRECISION NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  tags JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_feed_items_den ON coalition_feed_items (den_id);
CREATE INDEX idx_coalition_feed_items_canopy ON coalition_feed_items (canopy_id);
