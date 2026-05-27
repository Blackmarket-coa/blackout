-- Coalition den tasks. Previously lived only in an in-memory Map in
-- taskStore.ts, so any task created at runtime was lost on restart. Persisted
-- via the write-through store; TEXT ids / no cross-table FKs to match the
-- string-keyed store. Columns mirror CoalitionTask in @blackout/core.

CREATE TABLE coalition_tasks (
  id TEXT PRIMARY KEY,
  den_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status VARCHAR(16) NOT NULL,
  assignee_id TEXT,
  proposal_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coalition_tasks_den ON coalition_tasks (den_id);
