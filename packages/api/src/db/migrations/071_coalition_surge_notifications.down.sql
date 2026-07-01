DROP INDEX IF EXISTS idx_coalition_feed_items_project;
ALTER TABLE coalition_feed_items
  DROP COLUMN IF EXISTS project_id,
  DROP COLUMN IF EXISTS milestone_id;
DROP TABLE IF EXISTS coalition_notifications;
DROP TABLE IF EXISTS coalition_surges;
