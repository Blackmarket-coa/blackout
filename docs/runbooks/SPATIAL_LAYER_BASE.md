# Spatial layer base — bootstrap and operations

Foundation milestone deliverable per
[`../AGGRESSIVE_OPERATIONS_GUIDE.md` §9.2](../AGGRESSIVE_OPERATIONS_GUIDE.md)
row "Spatial layer integration (PostGIS + Martin + PMTiles) — base".

The spatial layer is OSS-leverage scaffolding. We adopt three upstream
projects with minimal modification:

| Component | Upstream | License | Modification |
|---|---|---|---|
| PostGIS | <https://postgis.net> via [`postgis/postgis`](https://github.com/postgis/docker-postgis) image | GPL-2.0 (server) + various | Image swap on the existing Postgres service; `coalition` schema added |
| MapLibre Martin | <https://github.com/maplibre/martin> | Apache-2.0 / MIT | Config-only adoption via `martin/martin.yaml` |
| PMTiles | <https://github.com/protomaps/PMTiles> format + Protomaps planet builds | BSD-3-Clause (format) / ODbL (data) | None — drop-in basemap |

The three plug into the single-server-baseline stack with no new
stateful service beyond Martin (which is stateless).

---

## 0) Topology

```
nginx (443)
  └─ /tiles/ → martin:3000
                ├─ postgres (spatial DB, postgis extension) — Coalition working tables
                └─ /var/lib/martin/pmtiles — PMTiles basemap archives
```

Martin is internal-only (no host port published). Public access is
via the nginx `/tiles/` location on `api.theblackout.app`.

---

## 1) Bootstrap

### 1.1 Fresh deploy

If the Postgres data volume is being initialised from scratch, the
init script at
`infra/single-server-baseline/postgres/initdb/01-spatial-database.sql`
runs automatically on first start. Verify after `docker compose up`:

```sh
docker compose exec postgres psql -U "$POSTGRES_USER" -d spatial \
  -c "SELECT postgis_full_version();"
```

Expected: a single row reporting PostGIS 3.4.x and the GEOS/PROJ
versions bundled with the alpine image.

### 1.2 Existing volume (most deploys)

The init script only fires on a fresh `PGDATA`. For existing volumes,
run the equivalent commands by hand once:

```sh
docker compose exec postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE spatial;"
docker compose exec postgres psql -U "$POSTGRES_USER" -d spatial \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;
      CREATE EXTENSION IF NOT EXISTS postgis_topology;
      CREATE SCHEMA IF NOT EXISTS coalition;"
```

The Postgres image swap (`postgres:16-alpine` →
`postgis/postgis:16-3.4-alpine`) is binary-compatible — Synapse and
the application schema are unaffected. The first start on the new
image is a normal restart, not a migration.

### 1.3 Drop in a basemap

Martin starts with no PMTiles. To get a basemap working:

```sh
# Build a regional extract from an OSM PBF. Requires the protomaps
# pmtiles CLI:
#   https://github.com/protomaps/go-pmtiles
pmtiles convert north-america-latest.osm.pbf north-america.pmtiles
mv north-america.pmtiles infra/single-server-baseline/martin/pmtiles/
docker compose restart martin
```

Or pull a daily Protomaps planet build (large, ~110 GB):
<https://maps.protomaps.com/builds/>.

### 1.4 Smoke test

```sh
# Internal — from the host:
curl -sf http://localhost/tiles/catalog
# Should list pmtiles sources and any auto-published coalition schema sources.

# Internal — round-trip a tile:
curl -sf -o /tmp/tile.pbf \
  http://localhost/tiles/north-america/0/0/0
file /tmp/tile.pbf
# Expected: "data" or "Vector tile data"; non-zero size.

# External — same after DNS / cert:
curl -sf -o /dev/null -w '%{http_code}\n' \
  https://api.theblackout.app/tiles/catalog
```

---

## 2) Coalition working tables

The `coalition` schema in the spatial database is the working area
for Coalition layer tables (polygon boundaries, fulfillment-node
locations, heatmap source views — see
[`AGGRESSIVE_OPERATIONS_GUIDE.md` §9.2](../AGGRESSIVE_OPERATIONS_GUIDE.md)
Differentiation milestone row "Spatial layer feature parity").

Tables added to `coalition` are auto-published as Martin tile
sources thanks to the `auto_publish.from_schemas: ['coalition']` knob
in `martin.yaml`. New table → new tile source on next request, no
Martin restart required.

Recommended table conventions:

- A single geometry column per table, named `geom`, with SRID 4326
  (WGS84). Martin handles the projection on the wire.
- Indexable. Add `CREATE INDEX ... USING GIST (geom)` so tile
  bounding-box queries don't sequential-scan.
- `ALTER TABLE ... CLUSTER ON <gist_index>` for tables that are
  read-heavy and write-rare.

---

## 3) Hardening (deferred but tracked)

The current bootstrap connects Martin as `POSTGRES_USER` (the app
superuser) to keep the first deploy simple. The recommended hardening
once the spatial layer has stable consumers:

```sql
CREATE USER martin WITH PASSWORD '<secret>';
GRANT CONNECT ON DATABASE spatial TO martin;
\connect spatial
GRANT USAGE ON SCHEMA coalition, public TO martin;
GRANT SELECT ON ALL TABLES IN SCHEMA coalition TO martin;
ALTER DEFAULT PRIVILEGES IN SCHEMA coalition GRANT SELECT ON TABLES TO martin;
```

Then update `martin` service's `DATABASE_URL` in the compose to point
at the new role. Tracked in
[`../../infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md)
§16 next to the `pg_monitor` upgrade for the postgres-exporter.

---

## 4) Backup and recovery

The spatial database lives in the same Postgres data volume as the
application schema and Synapse. Existing backup tooling
([`../../infra/single-server-baseline/backup/`](../../infra/single-server-baseline/backup/))
captures it at the cluster level — no separate procedure needed.

PMTiles archives in `infra/single-server-baseline/martin/pmtiles/`
are reproducible from upstream sources (Protomaps planet builds,
Geofabrik OSM extracts). They are **not** backed up to the offsite
vault by default; document the basemap source in deployment notes
so it can be regenerated.

---

## 5) Capacity sketch

Sized for the consolidated DL360 host described in
[`../AGGRESSIVE_OPERATIONS_GUIDE.md` §2.4 + §4.1](../AGGRESSIVE_OPERATIONS_GUIDE.md).

- Martin's resident memory is dominated by `cache_size_mb` (256 MB).
  Idle: ~50 MB. Worst case under heavy basemap load: ~400 MB. Fits
  trivially on the host.
- PostGIS adds ~150 MB to the Postgres image size on disk. Working
  set growth depends on `coalition.*` table sizes; an empty schema
  adds nothing measurable.
- Tile request rate at the Foundation milestone is expected to be
  low (Coalition page renders only). Martin can serve thousands of
  tiles per second on this host before nginx becomes the bottleneck.

Capacity bands for the spatial layer are deliberately not set;
follow the same posture as `RUNBOOK.md` §13 — set bands once
operating telemetry exists.

---

## 6) Cross-references

- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §2.4](../AGGRESSIVE_OPERATIONS_GUIDE.md) — unified deployment topology
- [`../AGGRESSIVE_OPERATIONS_GUIDE.md` §9.2](../AGGRESSIVE_OPERATIONS_GUIDE.md) — Spatial layer integration row
- [`../../infra/single-server-baseline/docker-compose.yml`](../../infra/single-server-baseline/docker-compose.yml) — postgres + martin services
- [`../../infra/single-server-baseline/martin/martin.yaml`](../../infra/single-server-baseline/martin/martin.yaml) — Martin config
- [`../../infra/single-server-baseline/postgres/initdb/01-spatial-database.sql`](../../infra/single-server-baseline/postgres/initdb/01-spatial-database.sql) — fresh-init script
- [`../../infra/single-server-baseline/RUNBOOK.md`](../../infra/single-server-baseline/RUNBOOK.md) §17 — operator notes + hardening backlog
