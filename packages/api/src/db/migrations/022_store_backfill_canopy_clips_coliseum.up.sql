-- Backfill Postgres DDL for store tables added after migration 021: the canopy
-- directory index, clips, and the Coliseum debate layer. These gained
-- shared-store persistence in their feature PRs but had no Postgres schema.
-- TEXT ids, no cross-table FKs (matching the string-keyed store); nested
-- objects/arrays use JSONB, string arrays use TEXT[]. Columns mirror the record
-- interfaces in packages/api/src/db/types.ts and @blackout/core.

CREATE TABLE canopy_directory_entries (
  canopy_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT,
  federation_tier VARCHAR(16) NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE clips (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  source_stream_id TEXT,
  title TEXT NOT NULL,
  media_pointer TEXT NOT NULL,
  thumbnail_pointer TEXT,
  duration_seconds INTEGER NOT NULL,
  visibility VARCHAR(16) NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_clips_creator ON clips (creator_id);

CREATE TABLE coliseum_topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  news_anchor JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ,
  archives_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  category VARCHAR(64),
  canopy_id TEXT,
  den_id TEXT,
  status VARCHAR(32) NOT NULL,
  recency_score DOUBLE PRECISION NOT NULL,
  velocity_score DOUBLE PRECISION NOT NULL,
  debate_heat DOUBLE PRECISION NOT NULL
);

CREATE TABLE coliseum_arguments (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  parent_argument_id TEXT,
  author_id TEXT NOT NULL,
  stance VARCHAR(16) NOT NULL,
  stance_weight DOUBLE PRECISION NOT NULL,
  body TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  media JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  vote_score DOUBLE PRECISION NOT NULL,
  nuance_score DOUBLE PRECISION NOT NULL
);
CREATE INDEX idx_coliseum_arguments_topic ON coliseum_arguments (topic_id);

CREATE TABLE coliseum_votes (
  argument_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  direction VARCHAR(8) NOT NULL,
  stance_shift DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (argument_id, voter_id)
);

CREATE TABLE coliseum_live_sessions (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  moderator_ids TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL,
  speaking_queue JSONB NOT NULL DEFAULT '[]'::jsonb,
  pinned_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
