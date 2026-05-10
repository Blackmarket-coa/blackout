-- Analytics warehouse bootstrap. Runs on first init of the ClickHouse
-- data volume only (the /docker-entrypoint-initdb.d hook). For
-- existing volumes, run by hand — see
-- docs/runbooks/ANALYTICS_WAREHOUSE.md.
--
-- Schema layout:
--   analytics       — fact / dimension tables fed by the FBM event bus
--                     (AOG §2.2). Cube semantic models live on top.
--   analytics_raw   — landing zone for ingested events before any
--                     transform; retained 30d, purged via TTL.

CREATE DATABASE IF NOT EXISTS analytics;
CREATE DATABASE IF NOT EXISTS analytics_raw;

-- Example landing table — minimal seed so Cube has something to model
-- and Metabase has something to render. Replace with the real FBM
-- event schema when AOG §2.2 lands. Includes TTL so the demo doesn't
-- accumulate indefinitely.
CREATE TABLE IF NOT EXISTS analytics_raw.events
(
    event_id        UUID,
    event_type      LowCardinality(String),
    occurred_at     DateTime64(3, 'UTC'),
    actor_mxid      String,
    coalition_id    Nullable(String),
    payload         String CODEC(ZSTD(3))
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (event_type, occurred_at, event_id)
TTL occurred_at + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;
