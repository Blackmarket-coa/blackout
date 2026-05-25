-- Canopy (community) voice rooms backed by LiveKit, their participants, and
-- an append-only event log. Moved out of the in-process store so room/roster
-- state is consistent across replicas.

CREATE TABLE canopy_voice_rooms (
  id UUID PRIMARY KEY,
  -- Owning canopy/community + channel. No local FK target for canopy.
  canopy_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  livekit_room_name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_canopy_voice_rooms_canopy ON canopy_voice_rooms (canopy_id);
CREATE INDEX idx_canopy_voice_rooms_active
  ON canopy_voice_rooms (active) WHERE active = TRUE;

CREATE TABLE voice_room_participants (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES canopy_voice_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'moderator', 'admin')),
  can_publish BOOLEAN NOT NULL DEFAULT TRUE,
  can_subscribe BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ
);

CREATE INDEX idx_voice_room_participants_room ON voice_room_participants (room_id);
CREATE INDEX idx_voice_room_participants_active
  ON voice_room_participants (room_id, user_id) WHERE left_at IS NULL;

CREATE TABLE voice_room_events (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES canopy_voice_rooms(id) ON DELETE CASCADE,
  canopy_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  user_id UUID NOT NULL,
  event_type VARCHAR(16) NOT NULL
    CHECK (event_type IN ('join', 'leave', 'mute', 'remove', 'lock', 'unlock')),
  actor_id UUID,
  target_user_id UUID,
  session_duration_seconds INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_room_events_room ON voice_room_events (room_id, created_at DESC);
CREATE INDEX idx_voice_room_events_canopy ON voice_room_events (canopy_id, created_at DESC);
