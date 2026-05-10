-- Metabase application database. Metabase stores its dashboards,
-- users, and saved questions in this database; analytical data lives
-- in ClickHouse and is queried through Metabase's data-source wiring.
--
-- Runs on first init of the Postgres data volume only. For existing
-- volumes, run by hand — see docs/runbooks/ANALYTICS_WAREHOUSE.md.

CREATE DATABASE metabase;
\connect metabase
COMMENT ON DATABASE metabase IS
    'Metabase application metadata (dashboards, users, saved questions). Analytical data lives in ClickHouse — see docs/runbooks/ANALYTICS_WAREHOUSE.md.';
