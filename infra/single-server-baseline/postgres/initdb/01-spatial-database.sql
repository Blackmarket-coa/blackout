-- Spatial database bootstrap.
--
-- Runs on first init of the Postgres data volume only (the
-- /docker-entrypoint-initdb.d entrypoint hook). For existing volumes,
-- run the equivalent commands by hand — see
-- docs/runbooks/SPATIAL_LAYER_BASE.md.
--
-- The spatial database is owned by the same POSTGRES_USER as the
-- application database. Coalition layer / Martin readers connect as
-- this user. A read-only role for Martin is the recommended hardening
-- step once the spatial layer has stable consumers; tracked in
-- infra/single-server-baseline/RUNBOOK.md §16.

CREATE DATABASE spatial;

-- The PostGIS extension is created inside the spatial database, not
-- the application database, to avoid surprising the application schema
-- with the postgis catalog.
\connect spatial

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Schema for Coalition spatial-layer working tables. Specific tables
-- (coalition_polygons, fulfillment_node_locations, heatmap source
-- views) are created by Blackout-side migrations or seeded from the
-- coalition module exports.
CREATE SCHEMA IF NOT EXISTS coalition;

COMMENT ON SCHEMA coalition IS
    'Coalition spatial layer working tables. See AOG §9.2 row "Spatial layer integration (PostGIS + Martin + PMTiles)".';
