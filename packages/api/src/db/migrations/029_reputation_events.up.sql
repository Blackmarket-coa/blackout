-- Postgres DDL for the reputation event log. Reputation was previously an
-- in-memory-only store (lost on restart); persisting it brings per-subject
-- standing to parity with the rest of the shared store. TEXT ids, no cross-table
-- FKs (matching the string-keyed store). Columns mirror ReputationEventRecord in
-- packages/api/src/db/types.ts.

CREATE TABLE reputation_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type VARCHAR(48) NOT NULL,
  subject VARCHAR(64),
  points DOUBLE PRECISION,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_reputation_events_user ON reputation_events (user_id);
CREATE INDEX idx_reputation_events_dedupe ON reputation_events (dedupe_key);
