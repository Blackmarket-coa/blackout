-- Coalition project funding + support ledger. Extends coalition_projects with a
-- funding goal, running raised total, supporter count, use-of-funds, deadline,
-- and a JSONB milestone list (mirrors CoalitionProject in @blackout/core). A new
-- coalition_project_supports table records each captured contribution — the
-- supporter wall (social proof) and the velocity source for the Momentum signal.
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store,
-- like 055_coalition_projects.

ALTER TABLE coalition_projects
  ADD COLUMN funding_goal_cents BIGINT,
  ADD COLUMN raised_cents BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN currency VARCHAR(8),
  ADD COLUMN supporter_count INT NOT NULL DEFAULT 0,
  ADD COLUMN use_of_funds TEXT,
  ADD COLUMN deadline_at TIMESTAMPTZ,
  ADD COLUMN milestones JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE TABLE coalition_project_supports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  supporter_user_id TEXT NOT NULL,
  -- The tip whose capture produced this support. Unique so a replayed capture
  -- never double-counts toward raised_cents / supporter_count.
  tip_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(8),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX idx_coalition_project_supports_tip ON coalition_project_supports (tip_id);
CREATE INDEX idx_coalition_project_supports_project ON coalition_project_supports (project_id);
CREATE INDEX idx_coalition_project_supports_created ON coalition_project_supports (project_id, created_at);
