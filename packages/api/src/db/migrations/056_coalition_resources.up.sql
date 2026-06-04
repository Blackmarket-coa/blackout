-- Coalition Resource Registry. Tracks the shared physical capacity a coalition
-- offers (greenhouses, CNC machines, 3D printers, commercial kitchens, tools)
-- and whether each is available. Persisted via the write-through store; TEXT ids
-- / no cross-table FKs to match the string-keyed store. Columns mirror
-- CoalitionResource in @blackout/core. `kind` is TEXT so new kinds never require
-- a migration; `location` is a free-text address (no geo decode).

CREATE TABLE coalition_resources (
  id TEXT PRIMARY KEY,
  canopy_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT,
  availability VARCHAR(16) NOT NULL,
  steward_id TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_resources_canopy ON coalition_resources (canopy_id);
