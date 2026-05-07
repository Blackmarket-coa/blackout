-- Phase 1 / Track A: persistent per-link sync cursor.
--
-- Adds a single nullable column that the polling-style integrations use as
-- their "last seen" marker. Currently the only consumer is the Streamlabs
-- donation sync (cursor = the largest donation_id processed so far) but
-- the column is generic on purpose: a future YouTube live-chat poller
-- would store the `nextPageToken`, a future Patreon backfill would store
-- the cursor from the JSON:API `next` link, etc.
--
-- Kept narrow (VARCHAR(255)) and nullable so it doesn't perturb the
-- existing record shape; tools writing to linked_accounts that pre-date
-- this migration continue to work because every existing row defaults to
-- NULL and the column can be left out of INSERTs.

ALTER TABLE linked_accounts
  ADD COLUMN sync_cursor VARCHAR(255);
