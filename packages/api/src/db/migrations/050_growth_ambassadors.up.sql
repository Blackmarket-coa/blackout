-- Growth ledger: ambassadors. Durable counterpart to the in-process ambassador
-- Map from services/growth.ts. One ambassador record per user.

CREATE TABLE ambassadors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tier VARCHAR(16) NOT NULL CHECK (tier IN ('seedling', 'sapling', 'canopy', 'elder')),
  commission_bps INT NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  quota_canopies_active INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'active', 'paused', 'archived')),
  started_at TIMESTAMPTZ NOT NULL,
  last_reviewed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ambassadors_user ON ambassadors (user_id);
