-- Coliseum Live Position Map. Spectators place themselves on two axes
-- (agree/disagree × certain/uncertain); the aggregate start-vs-end movement is
-- the match's Shift Score. One vote per (match, voter). The captured start
-- snapshot lives on the match as JSONB (position_start).

ALTER TABLE coliseum_matches ADD COLUMN position_start JSONB;

CREATE TABLE coliseum_position_votes (
  match_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  agree BOOLEAN NOT NULL,
  certain BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (match_id, voter_id)
);
CREATE INDEX idx_coliseum_position_votes_match ON coliseum_position_votes (match_id);
