DROP INDEX IF EXISTS idx_coalition_succession_coalition;
DROP INDEX IF EXISTS idx_coalition_succession_open;
DROP TABLE IF EXISTS coalition_succession_petitions;
DROP INDEX IF EXISTS idx_coalitions_taken_down;
ALTER TABLE coalitions DROP COLUMN IF EXISTS reinstated_at;
ALTER TABLE coalitions DROP COLUMN IF EXISTS takedown_reason;
ALTER TABLE coalitions DROP COLUMN IF EXISTS taken_down_by;
ALTER TABLE coalitions DROP COLUMN IF EXISTS taken_down_at;
