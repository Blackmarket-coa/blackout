-- Clear stale placeholder media_url values from coalition feed items.
--
-- The COALITION_FEED_SEED rows feed-video-1 / feed-video-2 were seeded with
-- non-resolvable https://cdn.example/... URLs. Those were removed from the seed,
-- but the Postgres write-through store had already persisted the rows, so the
-- bad URLs survive restarts and the browser keeps requesting them
-- (net::ERR_NAME_NOT_RESOLVED). NULL them so the client falls back to VideoReel's
-- gradient placeholder. Idempotent: re-running matches 0 rows.
UPDATE coalition_feed_items
SET media_url = NULL
WHERE media_url LIKE 'https://cdn.example/%';
