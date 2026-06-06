-- Coalition Needs Board. Members post what their coalition needs (compost,
-- seedlings, a creator, a developer) and the post moves open → fulfilled.
-- Persisted via the write-through store; TEXT ids / no cross-table FKs to match
-- the string-keyed store. Columns mirror CoalitionNeed in @blackout/core.
-- `kind` is TEXT so new need categories never require a migration;
-- `fulfilled_by_listing_id` is the seam the FBM opportunity system hangs off of.

CREATE TABLE coalition_needs (
  id TEXT PRIMARY KEY,
  canopy_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(16) NOT NULL,
  author_id TEXT NOT NULL,
  fulfilled_by_listing_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_needs_canopy ON coalition_needs (canopy_id);
