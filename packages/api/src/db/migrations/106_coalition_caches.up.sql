-- Public geocaches on the Coalition map, and the consent records that gate
-- them (docs/coalitions/GEOCACHING_DESIGN.md, phase 1;
-- docs/security/coalition-caches-2026-11-22.md).
--
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store,
-- like 086_community_assets. Column names are camelToSnake of the record
-- fields in db/types.ts. Account deletion erases a person's rows in every
-- table here explicitly (services/accountLifecycle.ts).

-- A public cache. latitude/longitude are the exact spot the placer chose: only
-- the placer and moderators are sent them; everyone else gets the centre of a
-- 50 m cell. A cache is shown to others from `visible_from` (placement + 2 h)
-- while `status` is 'active'. 'hidden' keeps it from everyone but its placer
-- (`held_reason` says why: a report, or an exclusion zone, which the placer is
-- not told); 'removed' keeps it from everyone. The code a finder types is never
-- stored: `code_hash` is scrypt(code, code_salt), and both are null for a cache
-- confirmed by GPS check-in instead.
CREATE TABLE coalition_caches (
  id TEXT PRIMARY KEY,
  placer_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  title TEXT NOT NULL,
  hint TEXT,
  note TEXT,
  photo_mxc TEXT,
  proof TEXT NOT NULL,
  code_salt TEXT,
  code_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  held_reason TEXT,
  visible_from TIMESTAMPTZ NOT NULL,
  removed_by TEXT,
  moderation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_caches_placer ON coalition_caches (placer_id, created_at);
-- The public listing and the moderation queue.
CREATE INDEX idx_coalition_caches_status ON coalition_caches (status, visible_from);

-- "Found at this time by this person". No position is stored, whichever way
-- the find was confirmed.
CREATE TABLE coalition_cache_finds (
  id TEXT PRIMARY KEY,
  cache_id TEXT NOT NULL,
  finder_id TEXT NOT NULL,
  found_at TIMESTAMPTZ NOT NULL,
  UNIQUE (cache_id, finder_id)
);
CREATE INDEX idx_coalition_cache_finds_finder ON coalition_cache_finds (finder_id);

-- One report per (cache, reporter); `resolved` closes it when a moderator acts.
CREATE TABLE coalition_cache_reports (
  id TEXT PRIMARY KEY,
  cache_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (cache_id, reporter_id)
);
CREATE INDEX idx_coalition_cache_reports_cache ON coalition_cache_reports (cache_id, resolved);
CREATE INDEX idx_coalition_cache_reports_reporter ON coalition_cache_reports (reporter_id);

-- Circles the operator keeps public caches out of (homes, schools, shelters,
-- clinics, places of worship). Only administrators read or change them.
CREATE TABLE coalition_exclusion_zones (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters DOUBLE PRECISION NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- What a person agreed to, when, and which wording: one row per agreement,
-- kept after withdrawal (`withdrawn_at`) so the person can see their history.
-- `text_sha256` is the SHA-256 of the disclosure text their app showed.
CREATE TABLE user_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  version INT NOT NULL,
  text_sha256 TEXT NOT NULL,
  age_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMPTZ NOT NULL,
  withdrawn_at TIMESTAMPTZ
);
CREATE INDEX idx_user_consents_user ON user_consents (user_id, kind, granted_at);
