-- Coliseum matches — the structured gladiatorial layer. Matches pair two
-- fighters around a proposition (a coliseum_topics row, referenced by id);
-- rounds carry the video content; the crowd votes each round; the Crucible
-- collects final statements + synthesis votes; a brief is minted at the verdict.
-- TEXT ids / no cross-table FKs to match the string-keyed write-through store.
-- Object/array fields are JSONB (serialized by the reflection writer); domains
-- are TEXT so new categories never require a migration.

CREATE TABLE coliseum_matches (
  id TEXT PRIMARY KEY,
  type VARCHAR(16) NOT NULL,
  proposition TEXT NOT NULL,
  proposition_topic_id TEXT,
  domain TEXT,
  challenger_id TEXT NOT NULL,
  opponent_id TEXT,
  den_room_id TEXT,
  shout_id TEXT,
  status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  clock_ends_at TIMESTAMPTZ,
  crucible_ends_at TIMESTAMPTZ,
  verdict_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  round_window_ms BIGINT NOT NULL,
  challenge_token TEXT,
  challenge_seen_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  open BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_coliseum_matches_status ON coliseum_matches (status);
CREATE INDEX idx_coliseum_matches_domain ON coliseum_matches (domain);
CREATE INDEX idx_coliseum_matches_challenger ON coliseum_matches (challenger_id);
CREATE INDEX idx_coliseum_matches_opponent ON coliseum_matches (opponent_id);

CREATE TABLE coliseum_rounds (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  index INTEGER NOT NULL,
  side VARCHAR(8) NOT NULL,
  author_id TEXT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  body TEXT,
  media JSONB,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coliseum_rounds_match ON coliseum_rounds (match_id);

CREATE TABLE coliseum_round_votes (
  match_id TEXT NOT NULL,
  round_index INTEGER NOT NULL,
  voter_id TEXT NOT NULL,
  choice VARCHAR(8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (match_id, round_index, voter_id)
);
CREATE INDEX idx_coliseum_round_votes_match ON coliseum_round_votes (match_id);

CREATE TABLE coliseum_shouts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  domain TEXT,
  body TEXT,
  media JSONB NOT NULL,
  den_room_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  heat DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX idx_coliseum_shouts_domain ON coliseum_shouts (domain);

CREATE TABLE coliseum_response_drops (
  id TEXT PRIMARY KEY,
  shout_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT,
  media JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  vote_score DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX idx_coliseum_response_drops_shout ON coliseum_response_drops (shout_id);

CREATE TABLE coliseum_response_drop_votes (
  drop_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  direction VARCHAR(8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (drop_id, voter_id)
);

CREATE TABLE coliseum_briefs (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  proposition TEXT NOT NULL,
  claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  upheld_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  position_start JSONB,
  position_end JSONB,
  shift_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  winner VARCHAR(8),
  question_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  minted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coliseum_briefs_match ON coliseum_briefs (match_id);

CREATE TABLE coliseum_crucible_statements (
  match_id TEXT NOT NULL,
  side VARCHAR(8) NOT NULL,
  author_id TEXT NOT NULL,
  media_mxc TEXT,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (match_id, side)
);

CREATE TABLE coliseum_crucible_votes (
  match_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  choice VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (match_id, question_id, voter_id)
);
CREATE INDEX idx_coliseum_crucible_votes_match ON coliseum_crucible_votes (match_id);
