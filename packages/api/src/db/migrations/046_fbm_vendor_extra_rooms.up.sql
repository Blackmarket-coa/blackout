-- Phase 2 FBM commerce families: add the public Order Cycle announcement room
-- (§1.2) and the private customer-messages room (§1.1) to the per-vendor room
-- mapping. Both are nullable + lazily provisioned, so existing vendor rows are
-- untouched. Column names are the snake_case of the new FbmVendorRoomRecord
-- fields.

ALTER TABLE fbm_vendor_rooms
  ADD COLUMN IF NOT EXISTS announce_room_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_messages_room_id TEXT;
