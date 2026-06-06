-- Coalition projects. A coalition launches concrete initiatives (community
-- garden, tool library, food project, open-source build) and tracks them
-- proposed → active → paused → complete. Persisted via the write-through store;
-- TEXT ids / no cross-table FKs to match the string-keyed store. Columns mirror
-- CoalitionProject in @blackout/core. `category` is TEXT so new categories never
-- require a migration; `proposal_event_id` optionally links a governance vote.

CREATE TABLE coalition_projects (
  id TEXT PRIMARY KEY,
  canopy_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  status VARCHAR(16) NOT NULL,
  lead_id TEXT NOT NULL,
  proposal_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_projects_canopy ON coalition_projects (canopy_id);
