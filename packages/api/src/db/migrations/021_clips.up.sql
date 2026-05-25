-- Creator Hub short-form clips. The motivating table for the Postgres
-- migration: clips created on one API replica must be visible from every
-- other replica and survive redeploys.

CREATE TABLE clips (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Source stream a clip was cut from, when applicable. SET NULL so deleting
  -- a stream keeps the clip (it stands alone once published).
  source_stream_id UUID REFERENCES streams(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  -- mxc:// or HLS pointer to the clip media.
  media_pointer TEXT NOT NULL,
  thumbnail_pointer TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  visibility VARCHAR(16) NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'member_only')),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clips_creator_recency ON clips (creator_id, created_at DESC);
CREATE INDEX idx_clips_recency ON clips (created_at DESC);
CREATE INDEX idx_clips_source_stream ON clips (source_stream_id);
