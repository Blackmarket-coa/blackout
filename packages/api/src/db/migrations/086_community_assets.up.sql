-- User-created assets: stickers, memes and coins people make and share.
--
-- Assets start `pending` and are only shareable once approved. Creation is open
-- to everyone, so an approval gate is what keeps an open pipe from becoming a
-- distribution channel for whatever anyone uploads — the moderation story this
-- feature needed before it could ship at all.
--
-- `creator_id` is written once and never reassigned: it is the attribution that
-- Founding Contributor credentials and any future credit split are computed
-- from, so a transfer would rewrite authorship of someone else's work.
--
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store,
-- like 085_circle_and_relays. Column names are camelToSnake of the record
-- fields in db/types.ts.

CREATE TABLE community_assets (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Who acted on it and why, so a rejection is answerable rather than silent.
  reviewed_by TEXT,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  -- Stamped at approval: the ordinal among approved assets of this kind, which
  -- is what Founding Contributor is derived from. Stored rather than recomputed
  -- so a later retirement cannot renumber everyone who came after.
  founding_ordinal INT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_community_assets_creator ON community_assets (creator_id, created_at);
-- The moderation queue, and the per-kind founding ordering.
CREATE INDEX idx_community_assets_status ON community_assets (status, kind, created_at);

-- Reports raised by viewers on an already-approved asset. One row per
-- (asset, reporter); `resolved` closes it without deleting the history.
CREATE TABLE community_asset_reports (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (asset_id, reporter_id)
);
CREATE INDEX idx_community_asset_reports_asset ON community_asset_reports (asset_id, resolved);
