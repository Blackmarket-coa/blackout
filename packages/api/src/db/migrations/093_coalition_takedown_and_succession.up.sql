-- Platform takedown, and succession for an abandoned coalition.
--
-- `taken_down_at` is deliberately separate from `archived_at`. Archiving is the
-- founder's own act; a takedown is the platform's, and the two must not share a
-- carrier — otherwise the subject of a takedown could clear it by touching
-- their own archive state.
ALTER TABLE coalitions ADD COLUMN IF NOT EXISTS taken_down_at TIMESTAMPTZ;
ALTER TABLE coalitions ADD COLUMN IF NOT EXISTS taken_down_by TEXT;
ALTER TABLE coalitions ADD COLUMN IF NOT EXISTS takedown_reason TEXT;
ALTER TABLE coalitions ADD COLUMN IF NOT EXISTS reinstated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_coalitions_taken_down ON coalitions (taken_down_at);

-- A steward's petition to succeed a founder who has gone.
--
-- Modelled on the join-request queue rather than the governance vote module:
-- governance routes are gated on a capability no ordinary member holds, so a
-- petition built there could never be filed by the people it is for.
CREATE TABLE coalition_succession_petitions (
  id TEXT PRIMARY KEY,
  coalition_id TEXT NOT NULL,
  candidate_user_id TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  seconded_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(16) NOT NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
-- One live petition per coalition: a second concurrent petition would split the
-- stewards' seconds between two candidates and neither would reach quorum.
CREATE UNIQUE INDEX idx_coalition_succession_open
  ON coalition_succession_petitions (coalition_id)
  WHERE status = 'open';
CREATE INDEX idx_coalition_succession_coalition
  ON coalition_succession_petitions (coalition_id, created_at);
