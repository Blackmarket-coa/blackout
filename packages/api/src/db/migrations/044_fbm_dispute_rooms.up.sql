-- FBM → Matrix bridge: three-party encrypted dispute rooms (buyer, vendor,
-- mediator). The FBM dispute id is embedded in the room topic; the room persists
-- read-only for a retention window after resolution, then the sweeper purges it.
--
-- Column names are the snake_case of FbmDisputeRoomRecord.

CREATE TABLE fbm_dispute_rooms (
  dispute_id TEXT PRIMARY KEY,
  order_id TEXT,
  vendor_id TEXT NOT NULL,
  buyer_user_id TEXT NOT NULL,
  mediator_user_id TEXT,
  room_id TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fbm_dispute_rooms_purge ON fbm_dispute_rooms (status, purge_after);
