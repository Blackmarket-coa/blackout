-- Idempotent bootstrap for the Blackout API database.
--
-- Connect as a postgres superuser to the *postgres* maintenance database.
-- The role password is taken from the :blackout_password psql variable so
-- it can be supplied without echoing it into shell history, e.g.:
--
--   psql -U postgres -d postgres \
--        -v blackout_password="$BLACKOUT_DB_PASSWORD" \
--        -f bootstrap-db.sql
--
-- The script is safe to re-run: existing role/db are left untouched.

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blackout') THEN
        EXECUTE format('CREATE ROLE blackout LOGIN PASSWORD %L', :'blackout_password');
    END IF;
END
$$;

SELECT format('CREATE DATABASE %I OWNER %I', 'blackout_api', 'blackout')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'blackout_api')
\gexec

GRANT ALL PRIVILEGES ON DATABASE blackout_api TO blackout;
