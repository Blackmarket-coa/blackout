-- Content distribution fan-out. Links a published piece of creator content to a
-- surface (home / coliseum / coalition / den). Persisted via the write-through
-- store; TEXT ids / no cross-table FKs to match the string-keyed store. Columns
-- mirror ContentDistribution in @blackout/core. `target` is VARCHAR so new
-- surfaces never require a migration; `target_id` is null for the home feed.

CREATE TABLE content_distributions (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  target VARCHAR(16) NOT NULL,
  target_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_content_distributions_content ON content_distributions (content_id);
