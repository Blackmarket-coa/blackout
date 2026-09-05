-- Links a Coalition event to the stream it is broadcast on, so a recurring
-- `show` event can name where to watch it. Nullable everywhere: an in-person
-- event never has one, and a show can be announced before its stream exists.
-- No FK, matching the string-keyed store convention used by coalition_events.

ALTER TABLE coalition_events ADD COLUMN stream_id TEXT;
CREATE INDEX idx_coalition_events_stream ON coalition_events (stream_id);
