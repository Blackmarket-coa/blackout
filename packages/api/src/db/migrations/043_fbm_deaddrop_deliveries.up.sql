-- FBM → Matrix bridge: digital-product dead-drop deliveries. On purchase of a
-- digital product the bridge provisions a temporary encrypted room, posts the
-- file as an opaque dead-drop envelope, invites the buyer, and tombstones the
-- room after download or 72h. `source_event_id` is unique so a re-delivered
-- webhook never provisions a second room.
--
-- Column names are the snake_case of FbmDeaddropDeliveryRecord.

CREATE TABLE fbm_deaddrop_deliveries (
  id UUID PRIMARY KEY,
  source_event_id TEXT NOT NULL UNIQUE,
  buyer_user_id TEXT NOT NULL,
  entitlement_id UUID,
  room_id TEXT NOT NULL,
  drop_id TEXT,
  clue TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  downloaded_at TIMESTAMPTZ,
  tombstoned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fbm_deaddrop_deliveries_sweep
  ON fbm_deaddrop_deliveries (tombstoned_at, expires_at);
