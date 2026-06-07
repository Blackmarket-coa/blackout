-- Challenge entries. A member's submission to a Coliseum challenge. Persisted
-- via the write-through store; TEXT ids / no cross-table FKs to match the
-- string-keyed store. Columns mirror ChallengeEntry in @blackout/core.

CREATE TABLE challenge_entries (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  entrant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_challenge_entries_challenge ON challenge_entries (challenge_id);
