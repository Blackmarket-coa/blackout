-- What a governance proposal decides. Existing rows are community proposals by
-- definition — the platform scope did not exist when they were raised — so the
-- default backfills them correctly and the column is NOT NULL from the start.
--
-- `community_id` deliberately stays required and FK-valid for platform
-- proposals too: a platform change is still convened by some community, and the
-- scope records what is being decided rather than who is deciding it.

ALTER TABLE votes ADD COLUMN scope VARCHAR(16) NOT NULL DEFAULT 'community';
CREATE INDEX idx_votes_scope ON votes (scope);
