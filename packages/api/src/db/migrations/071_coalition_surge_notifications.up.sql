-- Coalition Surge events + the Coalition-scoped notification inbox, plus the
-- project link on feed items needed for Milestone Broadcast videos.
--
-- A Surge is a declared 24–48h support spike on a project (see support.ts
-- detectSurge / SURGE_DURATION_HOURS): it rises in the feed and its supporters
-- are notified. coalition_notifications is a per-recipient inbox the client
-- polls — the platform has no general push bus, so this is how "notify everyone
-- who contributed" is delivered (a best-effort Matrix den post rides alongside).
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store,
-- like 055_coalition_projects / 070_coalition_project_funding.

CREATE TABLE coalition_surges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  surge_factor DOUBLE PRECISION NOT NULL,
  supports_last_24h INT NOT NULL,
  supports_prev_24h INT NOT NULL,
  notified_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_surges_project ON coalition_surges (project_id);
CREATE INDEX idx_coalition_surges_status ON coalition_surges (status);
-- At most one open Surge per project.
CREATE UNIQUE INDEX idx_coalition_surges_open_per_project
  ON coalition_surges (project_id)
  WHERE status = 'open';

CREATE TABLE coalition_notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL,
  kind VARCHAR(32) NOT NULL,
  project_id TEXT,
  surge_id TEXT,
  milestone_id TEXT,
  feed_item_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_notifications_recipient
  ON coalition_notifications (recipient_user_id, created_at);
CREATE INDEX idx_coalition_notifications_unread
  ON coalition_notifications (recipient_user_id)
  WHERE read_at IS NULL;

-- Milestone Broadcast videos are feed items linked to a project + its milestone.
ALTER TABLE coalition_feed_items
  ADD COLUMN project_id TEXT,
  ADD COLUMN milestone_id TEXT;
CREATE INDEX idx_coalition_feed_items_project ON coalition_feed_items (project_id);
