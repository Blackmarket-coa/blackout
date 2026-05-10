# Analytics warehouse — bootstrap and operations

Foundation milestone deliverable per
[`../AGGRESSIVE_OPERATIONS_GUIDE.md` §9.3](../AGGRESSIVE_OPERATIONS_GUIDE.md)
row "ClickHouse + Cube + Metabase analytics consolidation". Adopts
three OSS upstreams with config-only modification:

| Component | Upstream | License | Role | Modification |
|---|---|---|---|---|
| ClickHouse | <https://github.com/ClickHouse/ClickHouse> | Apache-2.0 | Columnar OLAP store | Memory + concurrency caps via `clickhouse/config.d/blackout.xml`; analytics DBs created by initdb |
| Cube | <https://github.com/cube-js/cube> | Apache-2.0 | Semantic / metrics layer | Driver pointed at ClickHouse via env; one seed schema in `cube/schema/Events.yml` |
| Metabase (CE) | <https://github.com/metabase/metabase> | AGPL-3.0 | BI / dashboarding | App data on Postgres `metabase` DB; `MB_JETTY_PORT=3001` to free 3000 for Martin |

The three plug into the single-server-baseline stack with one new
stateful service (ClickHouse). Cube and Metabase are stateless from a
data-warehouse perspective — Cube caches in `/cube/data`, Metabase
metadata persists in Postgres.

---

## 0) Topology

```
maintainer (SSH tunnel)
  └─ metabase:3001 ──► postgres (metabase app DB)
                  └─► clickhouse:8123 (analytics queries)

@blackout/api / future ingestion workers
  └─ clickhouse:8123 (writes to analytics_raw.events)

future BI consumers / dashboards
  └─ cube:4000 ──► clickhouse:8123 (modeled queries via Cube semantic layer)
```

All three services are internal-only (no published host ports). Public
access for Metabase is **deferred to the Differentiation milestone**;
maintainer access at the Foundation milestone is via SSH tunnel:

```sh
ssh -L 3001:localhost:3001 deploy@<primary-host>
docker compose port metabase 3001  # confirm it's listening
# Browse to http://localhost:3001 in a local browser.
```

The deferral is deliberate — opening Metabase to the public web
requires SSO wiring against the Matrix/Keycloak surface and a cert
SAN; that's Differentiation work. AGPL-3.0 also makes outside-network
exposure a license consideration that's better resolved before any
modifications land.

---

## 1) Bootstrap

### 1.1 Fresh deploy

If both data volumes (`postgres-data` and `clickhouse-data`) are
being initialised from scratch, the init scripts run automatically:

- `postgres/initdb/02-metabase-database.sql` creates the `metabase`
  Postgres database for Metabase's app data.
- `clickhouse/initdb/01-analytics-database.sql` creates the
  `analytics` and `analytics_raw` databases plus the seed
  `analytics_raw.events` landing table (30-day TTL).

Verify:

```sh
docker compose exec postgres psql -U "$POSTGRES_USER" -lqt \
  | grep metabase
docker compose exec clickhouse clickhouse-client --user default \
  --password "$CLICKHOUSE_PASSWORD" \
  --query "SHOW DATABASES" | grep analytics
```

### 1.2 Existing volume

Init scripts only fire on a fresh data dir. For existing volumes, run
the equivalent commands once.

Postgres side (Metabase app DB):

```sh
docker compose exec postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE metabase;"
```

ClickHouse side (analytics DBs + seed table):

```sh
docker compose exec clickhouse clickhouse-client \
  --user default --password "$CLICKHOUSE_PASSWORD" \
  --multiquery < infra/single-server-baseline/clickhouse/initdb/01-analytics-database.sql
```

### 1.3 First-time Metabase setup

Metabase's first start opens an admin-creation wizard at the SSH
tunnel URL (§0). Walk through it once:

1. Create the admin user.
2. Add a data source: **Database type → ClickHouse**, host
   `clickhouse`, port `8123`, db `analytics_raw`, user `default`,
   password from `$CLICKHOUSE_PASSWORD`.
3. Save. Metabase scans the schema; the `events` seed table appears.

Persist the admin credentials in the chosen secrets manager
(`docs/runbooks/SECRETS_MANAGER_MIGRATION.md`).

### 1.4 Smoke test

```sh
# ClickHouse round-trip:
docker compose exec clickhouse clickhouse-client --user default \
  --password "$CLICKHOUSE_PASSWORD" \
  --query "INSERT INTO analytics_raw.events VALUES
            (generateUUIDv4(), 'smoke', now64(3), '@smoke:test', NULL, '{}');
            SELECT count() FROM analytics_raw.events;"

# Cube readiness:
docker compose exec cube wget -qO- http://127.0.0.1:4000/readyz

# Cube query through the REST API (requires CUBE_API_SECRET):
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({}, process.env.CUBE_API_SECRET))")
docker compose exec cube wget -qO- \
  --header="Authorization: $TOKEN" \
  'http://127.0.0.1:4000/cubejs-api/v1/load?query={"measures":["Events.count"]}'

# Metabase health:
docker compose exec metabase wget -qO- http://127.0.0.1:3001/api/health
```

---

## 2) Schema management

### 2.1 ClickHouse — analytical models

The `analytics` schema (vs. `analytics_raw`) is for shaped
fact/dimension tables. Recommended pattern:

- Land events in `analytics_raw.events` (already created, 30-day TTL).
- Materialise rolled-up tables in `analytics.*` via ClickHouse
  materialised views or Cube pre-aggregations.
- Query the `analytics.*` tables from Cube; treat `analytics_raw.*`
  as a debug surface only.

Example materialised view (not created by init — left for the model
owner):

```sql
CREATE TABLE analytics.events_daily
(
    event_date Date,
    event_type LowCardinality(String),
    coalition_id Nullable(String),
    event_count UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, event_type, coalition_id);

CREATE MATERIALIZED VIEW analytics.events_daily_mv
TO analytics.events_daily AS
SELECT
    toDate(occurred_at) AS event_date,
    event_type,
    coalition_id,
    count() AS event_count
FROM analytics_raw.events
GROUP BY event_date, event_type, coalition_id;
```

### 2.2 Cube — semantic layer

Drop new model files in `infra/single-server-baseline/cube/schema/`.
YAML and JS are both supported; the seed uses YAML for readability.

Cube reloads schemas on file change in dev mode only. Production
mode (our setting) requires a restart:

```sh
docker compose restart cube
```

The seed model `Events.yml` covers count, distinct actors, distinct
coalitions, and a "last 7 days" segment. Replace with the real FBM
event taxonomy when AOG §2.2 lands.

### 2.3 Metabase — dashboards

Metabase's dashboard / question metadata lives in the `metabase`
Postgres database and is captured by the existing
`infra/single-server-baseline/backup/` tooling. Export individual
dashboards as JSON via Metabase's serdes feature for review-able
artifacts.

---

## 3) Capacity sketch

Sized for the consolidated DL360 host (AOG §2.4 + §4.1).

- ClickHouse: 8 GB max server memory (config.d/blackout.xml). Idle
  ~250 MB. Initial workload (seed events table only) negligible.
  Working set scales with `analytics.*` tables; revisit when those
  exceed 50 GB on disk.
- Cube: idle ~150 MB. Per-query memory dominated by ClickHouse-side
  computation, not Cube-side.
- Metabase: idle ~600 MB (JVM). Each concurrent query adds ~50 MB.
  Foundation milestone usage is single-maintainer SSH-tunnel access,
  so concurrency is 1.

Total fresh-add to the host: ~1 GB resident plus ClickHouse data
volume.

Capacity bands deliberately not set — same posture as the spatial
layer (`SPATIAL_LAYER_BASE.md` §5) and Postgres (`RUNBOOK.md` §13).

---

## 4) Backup and recovery

- ClickHouse data volume (`blackout-clickhouse-data`) lives outside
  the Postgres backup tooling. Add a `clickhouse-backup` cron job to
  `infra/single-server-baseline/backup/` when the analytics workload
  becomes load-bearing — tracked as a follow-up.
- Cube state (`blackout-cube-data`) is cache only; safe to lose.
- Metabase metadata is in the Postgres `metabase` database and is
  captured by existing nightly Postgres dumps. Restore = restore the
  `metabase` database alongside the application database.

---

## 5) Hardening backlog

The first deploy connects everything as superusers / `default` for
simplicity. Recommended hardening once analytics has stable
consumers:

- **Dedicated ClickHouse user for Cube** with read-only on
  `analytics`/`analytics_raw`, no schema-mutation rights.
- **Dedicated ClickHouse user for Metabase** with the same scope.
- **Metabase SSO** wired to the Matrix/Keycloak surface so admin
  access doesn't depend on a separate password store.
- **Public nginx route** under `analytics.theblackout.app` (cert SAN
  required) once SSO and AGPL-3.0 modification posture are
  resolved.

Tracked in `infra/single-server-baseline/RUNBOOK.md` §18.

---

## 6) Cross-references

- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §2.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — FBM as canonical event bus
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §9.3](../AGGRESSIVE_OPERATIONS_GUIDE.md) — analytics consolidation row
- [`../../infra/single-server-baseline/docker-compose.yml`](../../infra/single-server-baseline/docker-compose.yml) — clickhouse / cube / metabase services
- [`../../infra/single-server-baseline/clickhouse/`](../../infra/single-server-baseline/clickhouse/) — config + initdb
- [`../../infra/single-server-baseline/cube/`](../../infra/single-server-baseline/cube/) — Cube config + schema
- [`../../infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md) §18 — operator notes + hardening backlog
