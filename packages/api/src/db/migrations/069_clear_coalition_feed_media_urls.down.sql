-- Forward-only data cleanup: the placeholder URLs were never valid, so there is
-- nothing to restore. Intentional valid no-op so the migration runner's up/down
-- round-trip (verify-migrations-ephemeral) executes cleanly.
SELECT 1;
