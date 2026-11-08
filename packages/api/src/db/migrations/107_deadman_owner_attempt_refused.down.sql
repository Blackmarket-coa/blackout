-- Reverting forgets every refused attempt not yet acted on: a switch whose
-- owner's check-in was refused during a database outage, and who has not
-- checked in since, then fires at its deadline as it did before 107, rather
-- than getting the backlog window. Nothing else depends on the column.
ALTER TABLE deadman_switches DROP COLUMN IF EXISTS owner_attempt_refused_at;
