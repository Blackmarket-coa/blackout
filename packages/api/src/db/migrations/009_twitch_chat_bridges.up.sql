-- Phase 1 / Track A: Twitch chat ingress bridges.
--
-- One row per (creator, twitch channel, matrix room) bridge declared by a
-- creator. The Twitch chat-ingress service reads this table at boot to
-- resume all active bridges and on every create/delete to stop or start
-- WSS connections.
--
-- Per-channel uniqueness is enforced on (blackout_user_id, twitch_channel)
-- so a creator can't accidentally double-bridge the same channel into two
-- rooms. They can move a bridge by deleting the old row and creating a new
-- one — that's a deliberate decision (otherwise stale bridges silently fan
-- out chat into a dead room).

CREATE TABLE twitch_chat_bridges (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Lowercased Twitch channel login (without leading '#').
  twitch_channel VARCHAR(64) NOT NULL,
  -- Matrix room id (e.g. "!roomid:server"). We do NOT FK this to a Blackout
  -- room table because rooms are managed in Synapse, not in our DB.
  matrix_room_id VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Diagnostics: timestamp + reason of the most recent stop, when not
  -- currently active.
  last_stopped_at TIMESTAMPTZ,
  last_stopped_reason VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blackout_user_id, twitch_channel)
);

CREATE INDEX idx_twitch_chat_bridges_user ON twitch_chat_bridges (blackout_user_id);
CREATE INDEX idx_twitch_chat_bridges_active ON twitch_chat_bridges (is_active) WHERE is_active = TRUE;
