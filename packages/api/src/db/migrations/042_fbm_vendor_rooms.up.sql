-- FBM → Matrix bridge: per-vendor Matrix space + child rooms, and buyer-facing
-- per-order rooms. The bridge translates FreeBlackMarket order/inventory/ledger
-- webhook events into bot messages in these rooms.
--
-- Column names are the snake_case of FbmVendorRoomRecord / FbmBuyerOrderRoomRecord
-- (the pg writer maps camelCase fields ↔ snake_case columns by reflection).

CREATE TABLE fbm_vendor_rooms (
  vendor_id TEXT PRIMARY KEY,
  space_room_id TEXT NOT NULL,
  orders_room_id TEXT NOT NULL,
  inventory_room_id TEXT NOT NULL,
  ledger_room_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fbm_buyer_order_rooms (
  id UUID PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  buyer_user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_fbm_buyer_order_rooms_order ON fbm_buyer_order_rooms (order_id);
CREATE INDEX idx_fbm_buyer_order_rooms_buyer ON fbm_buyer_order_rooms (buyer_user_id);
