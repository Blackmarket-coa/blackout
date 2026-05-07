-- Phase 1 / Track A: YouTube Live chat bridges. Mirrors the Twitch
-- chat-bridge model but keyed on the YouTube channel id (UCxxx) since
-- YouTube Live chat is per-channel-broadcast, not per-room-name.
--
-- The poller resolves the active broadcast's liveChatId on each tick
-- via /youtube/v3/liveBroadcasts and stores the page-token cursor on
-- linked_accounts.sync_cursor (added by migration 012). The bridge row
-- itself is only the "where to forward" mapping.

CREATE TABLE youtube_chat_bridges (
  id UUID PRIMARY KEY,
  blackout_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- YouTube channel id (UCxxxx...). Captured at create time so the
  -- bridge owner is unambiguous even if the linked account's
  -- providerUserId points to a different YouTube identity later.
  youtube_channel_id VARCHAR(64) NOT NULL,
  matrix_room_id VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_stopped_at TIMESTAMPTZ,
  last_stopped_reason VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blackout_user_id, youtube_channel_id)
);

CREATE INDEX idx_youtube_chat_bridges_user
  ON youtube_chat_bridges (blackout_user_id);
CREATE INDEX idx_youtube_chat_bridges_active
  ON youtube_chat_bridges (is_active) WHERE is_active = TRUE;
