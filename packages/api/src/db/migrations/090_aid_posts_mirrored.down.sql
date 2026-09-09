DROP INDEX IF EXISTS idx_coalition_aid_posts_origin;
ALTER TABLE coalition_aid_posts DROP COLUMN IF EXISTS external_id;
ALTER TABLE coalition_aid_posts DROP COLUMN IF EXISTS source;
ALTER TABLE coalition_aid_posts DROP COLUMN IF EXISTS locality;
-- Only restorable if no coordinate-less row was ever stored; a rollback past
-- the mirror has to delete those first.
ALTER TABLE coalition_aid_posts ALTER COLUMN longitude SET NOT NULL;
ALTER TABLE coalition_aid_posts ALTER COLUMN latitude SET NOT NULL;
