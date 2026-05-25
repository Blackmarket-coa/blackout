-- Streaming core: live/replay streams, broadcast sessions, per-stream
-- moderation policy, and the creator's Owncast ingest credentials.
--
-- These collections existed only in the in-process store until now; they
-- get real tables so stream state is shared + durable across API replicas.

CREATE TABLE streams (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state VARCHAR(16) NOT NULL DEFAULT 'offline'
    CHECK (state IN ('offline', 'live')),
  title VARCHAR(255) NOT NULL,
  category VARCHAR(120),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility VARCHAR(16) NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'member_only')),
  allowed_subscriber_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_profile VARCHAR(16) NOT NULL DEFAULT 'normal'
    CHECK (latency_profile IN ('normal', 'low')),
  replay_pointer TEXT,
  -- Optional associated den (Matrix-backed community room); no local table.
  den_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_streams_creator ON streams (creator_id);
CREATE INDEX idx_streams_state_recency ON streams (state, created_at DESC);

CREATE TABLE stream_sessions (
  id UUID PRIMARY KEY,
  stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  replay_pointer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stream_sessions_stream ON stream_sessions (stream_id, started_at DESC);

-- One moderation policy row per stream; keyed by stream_id (no separate id).
CREATE TABLE stream_moderation (
  stream_id UUID PRIMARY KEY REFERENCES streams(id) ON DELETE CASCADE,
  slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  banned_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  keyword_filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Owncast ingest credentials; one active row per creator (upsert-by-creator).
CREATE TABLE creator_stream_auth (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stream_id UUID NOT NULL,
  owncast_url TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
