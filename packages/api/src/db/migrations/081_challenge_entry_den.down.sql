-- Reverse of 081. Dropping the column unlinks entries from their discussion
-- dens; the Matrix rooms themselves survive and are simply no longer reachable
-- from the entry, the same trade-off as 080's `discussion_den_id`.
ALTER TABLE challenge_entries DROP COLUMN IF EXISTS discussion_den_id;
