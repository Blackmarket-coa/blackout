-- Backfill Postgres DDL for the 16 store tables that only ever existed in the
-- in-memory / JSON-file store. This is the schema-of-record for the runtime
-- PostgresBackedDb write-through store (BLACKOUT_DB_MODE=postgres).
--
-- Design notes:
--  * Id / foreign-key columns are TEXT, not UUID: the store keys on arbitrary
--    strings (e.g. 'demo-user', '@vine:server', '!room:server'), so UUID-typed
--    columns would reject real write-through inserts.
--  * No cross-table foreign keys: the in-memory store never enforced them and
--    write-through order is not guaranteed, so FKs would spuriously fail.
--  * Columns mirror the record interfaces in packages/api/src/db/types.ts.

CREATE TABLE scheduled_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  matrix_room_id TEXT NOT NULL,
  body TEXT NOT NULL,
  formatted_body TEXT,
  deliver_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ
);
CREATE INDEX idx_scheduled_messages_due ON scheduled_messages (status, deliver_at);

CREATE TABLE forum_posts (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  channel_id TEXT,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_forum_posts_community ON forum_posts (community_id);

CREATE TABLE dead_drops (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_dead_drops_recipient ON dead_drops (recipient_id);

CREATE TABLE deadman_switches (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  check_in_interval_seconds INTEGER NOT NULL,
  grace_period_seconds INTEGER NOT NULL,
  last_check_in_at TIMESTAMPTZ NOT NULL,
  trigger_at TIMESTAMPTZ NOT NULL,
  release_at TIMESTAMPTZ NOT NULL,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  encrypted_payload TEXT NOT NULL,
  headline TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_deadman_switches_owner ON deadman_switches (owner_id);

CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_moderation_actions_community ON moderation_actions (community_id);

CREATE TABLE creator_stream_auth (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL UNIQUE,
  stream_id TEXT NOT NULL,
  owncast_url TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE streams (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  state VARCHAR(16) NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  visibility VARCHAR(16) NOT NULL,
  allowed_subscriber_ids TEXT[] NOT NULL DEFAULT '{}',
  latency_profile VARCHAR(16) NOT NULL,
  replay_pointer TEXT,
  den_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_streams_creator ON streams (creator_id);

CREATE TABLE stream_sessions (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  replay_pointer TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_stream_sessions_stream ON stream_sessions (stream_id);

CREATE TABLE stream_moderation (
  stream_id TEXT PRIMARY KEY,
  slow_mode_seconds INTEGER NOT NULL DEFAULT 0,
  banned_user_ids TEXT[] NOT NULL DEFAULT '{}',
  keyword_filters TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE canopy_voice_rooms (
  id TEXT PRIMARY KEY,
  canopy_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  livekit_room_name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_canopy_voice_rooms_canopy ON canopy_voice_rooms (canopy_id);

CREATE TABLE voice_room_participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role VARCHAR(16) NOT NULL,
  can_publish BOOLEAN NOT NULL DEFAULT TRUE,
  can_subscribe BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ NOT NULL,
  left_at TIMESTAMPTZ
);
CREATE INDEX idx_voice_room_participants_room ON voice_room_participants (room_id);

CREATE TABLE voice_room_events (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  canopy_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type VARCHAR(16) NOT NULL,
  actor_id TEXT,
  target_user_id TEXT,
  session_duration_seconds INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_voice_room_events_room ON voice_room_events (room_id);

CREATE TABLE email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT
);
CREATE INDEX idx_email_verification_tokens_user ON email_verification_tokens (user_id);

CREATE TABLE account_deletion_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  ip_hash TEXT,
  user_agent_hash TEXT
);
CREATE INDEX idx_account_deletion_tokens_user ON account_deletion_tokens (user_id);

CREATE TABLE invitation_tokens (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  matrix_room_id TEXT,
  label TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  synapse_registration_token TEXT,
  synapse_registration_token_expires_at TIMESTAMPTZ,
  unlimited BOOLEAN,
  personal BOOLEAN,
  personal_token TEXT
);
CREATE INDEX idx_invitation_tokens_created_by ON invitation_tokens (created_by);

CREATE TABLE invitation_redemptions (
  id TEXT PRIMARY KEY,
  invitation_token_id TEXT NOT NULL,
  redeemed_by_user_id TEXT NOT NULL,
  matrix_invite_ok BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_invitation_redemptions_token ON invitation_redemptions (invitation_token_id);

-- coalition_spatial_items (migration 020) stores SpatialFeedItem, whose record
-- also carries derived `status` and optional `confidence`. Add columns so the
-- introspection-driven write-through persists the full record.
ALTER TABLE coalition_spatial_items ADD COLUMN IF NOT EXISTS status VARCHAR(16);
ALTER TABLE coalition_spatial_items ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION;
