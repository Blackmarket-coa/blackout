-- Coliseum challenges. A community challenge (start a business / grow food /
-- build a project) that members enter and vote on. Persisted via the
-- write-through store; TEXT ids / no cross-table FKs to match the string-keyed
-- store. Columns mirror ColiseumChallenge in @blackout/core. `category` is TEXT
-- so new categories never require a migration.

CREATE TABLE coliseum_challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  creator_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coliseum_challenges_status ON coliseum_challenges (status);
