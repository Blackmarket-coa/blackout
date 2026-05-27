-- Seller map locations. Migration 020 deferred these ("Seller locations remain
-- seeded/read-only for now"); this table makes them the schema-of-record so
-- sellers can be registered at runtime and survive restart. Coordinates are
-- flattened to lat/lng. Columns mirror SellerLocation in @blackout/core.

CREATE TABLE seller_locations (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  country TEXT NOT NULL,
  display_radius_meters INTEGER NOT NULL,
  is_visible BOOLEAN NOT NULL,
  location_type VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_seller_locations_seller ON seller_locations (seller_id);
