-- Mutual-aid posts that came from somewhere else.
--
-- FreeBlackMarket publishes its aid board through a whitelist projection
-- (`lib/aid-location.ts`) that emits a coarse `locality` label and NEVER
-- coordinates: precise latitude/longitude describe where a person in need
-- actually lives, and a public board is the easiest place to leak that. So a
-- post mirrored from FBM arrives with a place name and no pin, which the
-- NOT NULL on these two columns made unstorable.
--
-- Dropping NOT NULL rather than inventing a coordinate. Geocoding the locality
-- on arrival would manufacture a precision the source deliberately withheld,
-- and would still fail open when the geocoder had no answer.
ALTER TABLE coalition_aid_posts ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE coalition_aid_posts ALTER COLUMN longitude DROP NOT NULL;

-- The coarse label, which is all a mirrored post has to say about where it is.
-- Locally-posted rows keep using coordinates and leave this null.
ALTER TABLE coalition_aid_posts ADD COLUMN locality VARCHAR(120);

-- Provenance. `source` is null for a post made here and names the origin
-- system otherwise; `external_id` is that system's id for the row.
ALTER TABLE coalition_aid_posts ADD COLUMN source VARCHAR(32);
ALTER TABLE coalition_aid_posts ADD COLUMN external_id VARCHAR(255);

-- One row per (source, external_id) so a redelivered webhook updates the
-- mirror instead of stacking duplicates on the board. Partial, because
-- locally-posted rows have neither column and must not collide with each other.
CREATE UNIQUE INDEX idx_coalition_aid_posts_origin
  ON coalition_aid_posts (source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;
