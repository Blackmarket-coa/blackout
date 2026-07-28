-- Explainers: standalone authored knowledge entries in the Coliseum knowledge
-- repository (third kind beside match Briefs and debate verdicts). Endorsement
-- tallies are denormalized onto the explainer row; one vote row per
-- (explainer, voter) keeps flips idempotent. TEXT ids / no cross-table FKs to
-- match the string-keyed write-through store, like 070_coliseum_matches.
CREATE TABLE coliseum_explainers (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  domain VARCHAR(32),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  counterpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  up_votes INT NOT NULL DEFAULT 0,
  down_votes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_coliseum_explainers_author ON coliseum_explainers (author_id);
CREATE INDEX idx_coliseum_explainers_domain ON coliseum_explainers (domain);

CREATE TABLE coliseum_explainer_votes (
  explainer_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  direction VARCHAR(8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (explainer_id, voter_id)
);
