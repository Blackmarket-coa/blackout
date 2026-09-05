DROP INDEX IF EXISTS idx_coalition_events_stream;
ALTER TABLE coalition_events DROP COLUMN IF EXISTS stream_id;
