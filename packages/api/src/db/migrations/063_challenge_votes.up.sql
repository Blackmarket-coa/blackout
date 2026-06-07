-- Challenge votes. One per voter per entry. Persisted via the write-through
-- store; TEXT ids / no cross-table FKs to match the string-keyed store. Columns
-- mirror ChallengeVote in @blackout/core.

CREATE TABLE challenge_votes (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_challenge_votes_entry ON challenge_votes (entry_id);
CREATE UNIQUE INDEX idx_challenge_votes_voter ON challenge_votes (entry_id, voter_id);
