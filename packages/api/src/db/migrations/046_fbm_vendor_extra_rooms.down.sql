ALTER TABLE fbm_vendor_rooms
  DROP COLUMN IF EXISTS announce_room_id,
  DROP COLUMN IF EXISTS customer_messages_room_id;
