-- Reverting 106 would leave every release-format switch without its sealed
-- copies, so nobody could open it, and would make it fire as a legacy switch.
-- Refuse while any exists (cancelled ones included, since room_id is null on
-- them): restore from a backup instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM deadman_switches WHERE release_format <> 'legacy') THEN
    RAISE EXCEPTION 'deadman_switches holds release-format switches; 106 cannot be reverted without losing them';
  END IF;
END $$;
DROP INDEX IF EXISTS idx_deadman_release_notices_recipient;
DROP INDEX IF EXISTS idx_deadman_release_notices_due;
DROP TABLE IF EXISTS deadman_release_notices;
DROP INDEX IF EXISTS idx_deadman_release_wraps_recipient;
DROP TABLE IF EXISTS deadman_release_wraps;
ALTER TABLE deadman_switches ALTER COLUMN room_id SET NOT NULL;
ALTER TABLE deadman_switches DROP COLUMN IF EXISTS released_at;
ALTER TABLE deadman_switches DROP COLUMN IF EXISTS release_format;
