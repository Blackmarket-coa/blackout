-- Marketplace product version history. Append-only changelog per listing.
-- Persisted via the write-through store; TEXT ids / no cross-table FKs to match
-- the string-keyed store. Columns mirror ProductVersion in @blackout/core.

CREATE TABLE product_versions (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  version TEXT NOT NULL,
  notes TEXT,
  released_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_product_versions_listing ON product_versions (provider_id, listing_id);
