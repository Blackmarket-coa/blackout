-- Phase 1 / Track A: Kick chat bridges. Per-(creator, Kick chatroom)
-- declaration the chatIngress connection manager turns into a live
-- Pusher WS connection that forwards messages into a Matrix den room.
-- Mirrors twitch_chat_bridges + youtube_chat_bridges in shape.
--
-- chatroom_id is Kick's numeric chatroom identifier (NOT the channel
-- slug). Creators look it up at https://kick.com/api/v2/channels/<slug>
-- which returns chatroom.id. We store it as a string to dodge integer
-- overflow with future high-id growth.

CREATE TABLE kick_chat_bridges (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Kick numeric chatroom id, captured at create time.
  kick_chatroom_id VARCHAR(64) NOT NULL,
  matrix_room_id VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_stopped_at TIMESTAMPTZ,
  last_stopped_reason VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blackout_user_id, kick_chatroom_id)
);

CREATE INDEX idx_kick_chat_bridges_user ON kick_chat_bridges (blackout_user_id);
CREATE INDEX idx_kick_chat_bridges_active
  ON kick_chat_bridges (is_active) WHERE is_active = TRUE;
