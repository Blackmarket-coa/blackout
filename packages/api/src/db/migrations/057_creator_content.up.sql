-- Creator content lifecycle. A creator drafts a video/article/guide, optionally
-- schedules it, and publishes it. Persisted via the write-through store; TEXT
-- ids / no cross-table FKs to match the string-keyed store. Columns mirror
-- CreatorContent in @blackout/core. `kind` and `status` are TEXT/VARCHAR so new
-- values never require a migration.

CREATE TABLE creator_content (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  status VARCHAR(16) NOT NULL,
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_creator_content_creator ON creator_content (creator_id);
CREATE INDEX idx_creator_content_status ON creator_content (status);
