# Blackout single-server production baseline runbook

This runbook provides deployment manifests and operating steps for:

-   Blackout frontend static app
-   Blackout API
-   Synapse
-   PostgreSQL
-   Redis
-   coturn

## 1) Layout and persistence model

## Persistent volumes

| Volume                     | Contents                           | Backup criticality |
| -------------------------- | ---------------------------------- | ------------------ |
| `blackout-postgres-data`   | PostgreSQL data files              | Critical           |
| `blackout-redis-data`      | Redis AOF                          | Medium             |
| `blackout-synapse-data`    | Synapse config/state/keys          | Critical           |
| `blackout-synapse-media`   | Synapse media store                | Critical           |
| `blackout-coturn-data`     | coturn runtime state               | Medium             |
| `blackout-letsencrypt`     | TLS certificates and renewal state | Critical           |
| `blackout-certbot-webroot` | ACME webroot challenge files       | Low                |

## Least-privilege networking

-   `edge` network: externally reachable services (`reverse-proxy`, `coturn`, `certbot`).
-   `app` network (`internal: true`): east-west app traffic (`frontend`, `api`, `synapse`, plus proxy/coturn).
-   `data` network (`internal: true`): only stateful services and consumers (`postgres`, `redis`, `api`, `synapse`).
-   `bmc-bridge` network (external, created `--internal`): cross-stack link
    between `api` and the Free Black Market backend only — see §19.

No database or Redis ports are published to the host.

## Images

The three application images are built on the host by `deploy.sh`; none of
them is pulled from a registry:

| Service    | Image                      | Built from                                                                                                       |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `frontend` | `blackout-frontend:stable` | `apps/blackout-client/Dockerfile` (context: repo root)                                                           |
| `api`      | `blackout-api:hono`        | `infra/single-server-baseline/Dockerfile.blackout-api-hono` (Hono `@blackout/api`, context: repo root)           |
| `synapse`  | `blackout-synapse:stable`  | `apps/blackout-server/docker/Dockerfile` — the Blackout Synapse fork (`1.98.0+blackout.1`), not upstream Synapse |

`docker-compose.yml` defaults to these tags (`FRONTEND_TAG`, `API_TAG`,
`SYNAPSE_TAG` in `.env`). `deploy.sh` also builds `blackout-api:stable` and
`blackout-api:stable-pg` (the legacy Python service under
`apps/blackout-server/services/blackout-api`); this stack does not run them.

`deploy.sh` runs `docker compose up` in `$INFRA_DIR` (default
`/opt/blackout-infra`), so Compose layers that directory's
`docker-compose.override.yml` over `docker-compose.yml`. That host override
is not tracked in git; `docker-compose.override.yml.example` is the committed
copy of what it must contain:

-   the three image pins above, with healthchecks matching each image (the
    Synapse fork ships `curl` but not `wget`; the Hono image is `node:alpine`
    with busybox `wget` and no `python`) — without them a base file from before
    these images landed would start `ghcr.io/blackout/*` and stock Synapse;
-   the Hono API's `blackout_api` database URL and the `api-migrate` one-shot.
    The `blackout` role and `blackout_api` database are not created by
    `postgres/initdb/`; create them once on a fresh volume;
-   the `FREEBLACKMARKET_*` block and `bmc-bridge` attachment (§19).

The Hono API exits at boot in production unless `LOG_HASH_SALT` is set
(`packages/api/src/config/env.ts`); `.env.example` lists it next to
`JWT_SECRET_PRIMARY`, and both compose files pass it to `api`. Use a
high-entropy value and keep it stable (`docs/security/metadata-minimization.md`).

When you change the example, mirror the change into the host override.

## Not part of this stack

There is no rageshake server and no Dimension integration manager in this
stack, and nginx has no `/rageshake/` or `/dimension/` route. A client
`config.json` that sets `bugReportEndpointUrl` or `integrationsUrl` /
`integrationsUiUrl` to `https://matrix.theblackout.app/rageshake/...` or
`/dimension/...` points at endpoints that do not exist here; the committed
client `config.json` drops those keys.

## 2) Pre-deploy checklist

1. DNS records point all required names to this server:
    - `theblackout.app`
    - `chat.theblackout.app`
    - `api.theblackout.app`
    - `matrix.theblackout.app`
    - `turn.theblackout.app`
2. Open firewall ports:
    - `80/tcp`, `443/tcp`
    - `3478/tcp`, `3478/udp`, `5349/tcp`
    - relay range `49160-49200/udp`
    - LiveKit RTC: `7881/tcp`, media range `50100-50200/udp` (the SFU
      websocket itself stays behind nginx at `/livekit/sfu`)
3. Install Docker Engine and Compose plugin.
4. Copy this folder to `/opt/blackout`.
5. Create env file and the host override:

```bash
cd /opt/blackout
cp .env.example .env
chmod 600 .env
# Replace every CHANGE_ME value, including JWT_SECRET_PRIMARY and LOG_HASH_SALT
# (the api container will not start without LOG_HASH_SALT).
cp docker-compose.override.yml.example docker-compose.override.yml
# The override attaches api to the external bmc-bridge network (§19); create it
# once even before the FBM link is live, or compose refuses to start:
docker network create --internal bmc-bridge
```

Build the images (see "Images" above) before the first `docker compose up`;
they are local tags, so `up` has nothing to pull. These are the build steps
`deploy.sh` runs (it also resets `REPO_DIR` to `origin/develop` and recreates
the stack, so use it for later deploys, not for first boot):

```bash
cd <repo-checkout>
docker build -f apps/blackout-client/Dockerfile -t blackout-frontend:stable .
docker build -f infra/single-server-baseline/Dockerfile.blackout-api-hono -t blackout-api:hono .
(cd apps/blackout-server && DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t blackout-synapse:stable .)
```

6. Render templated configs:

```bash
set -a
source .env
set +a
envsubst < synapse/homeserver.yaml.template > synapse/homeserver.yaml
envsubst < coturn/turnserver.conf.template > coturn/turnserver.conf
envsubst < livekit/livekit.yaml.template > livekit/livekit.yaml
envsubst < draupnir/production.yaml.template > draupnir/production.yaml
chmod 600 synapse/homeserver.yaml coturn/turnserver.conf livekit/livekit.yaml draupnir/production.yaml
```

MatrixRTC calls need the `LIVEKIT_*` variables set in `.env` (see
`.env.example`) before rendering — the same key pair feeds both the SFU
config and the `lk-jwt` token bridge. After `docker compose up`, verify with
`pnpm guard:call-config` (repo) and check that
`https://theblackout.app/.well-known/matrix/client` returns the
`org.matrix.msc4143.rtc_foci` entry; the client's call UI reports
`healthy` once the focus resolves.

## 3) Initial TLS bootstrap

Start reverse-proxy first for ACME challenge responses:

```bash
docker compose up -d reverse-proxy
```

Issue certificate once (manual certbot profile):

```bash
docker compose run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  -d theblackout.app \
  -d chat.theblackout.app \
  -d api.theblackout.app \
  -d matrix.theblackout.app \
  -d turn.theblackout.app \
  -m ${LETSENCRYPT_EMAIL} \
  --agree-tos --no-eff-email
```

Then start full stack:

```bash
docker compose up -d
```

## 4) Startup order and dependency graph

Compose startup order (health-gated):

1. `postgres`, `redis`
2. `api`, `synapse` (wait for healthy DB/Redis)
3. `frontend`
4. `reverse-proxy`
5. `coturn`
6. scheduled certbot renewal timer

Validate health:

```bash
docker compose ps
curl -f https://theblackout.app/
curl -f https://api.theblackout.app/health
curl -f https://matrix.theblackout.app/_matrix/client/versions
```

## 5) Systemd integration

Install units:

```bash
sudo cp systemd/blackout-stack.service /etc/systemd/system/
sudo cp systemd/blackout-backup.service /etc/systemd/system/
sudo cp systemd/blackout-backup.timer /etc/systemd/system/
sudo cp systemd/blackout-certbot-renew.service /etc/systemd/system/
sudo cp systemd/blackout-certbot-renew.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blackout-stack.service
sudo systemctl enable --now blackout-backup.timer
sudo systemctl enable --now blackout-certbot-renew.timer
```

## 6) Backup hooks and schedule

Backup hook script: `backup/backup.sh`

Captured artifacts:

-   Postgres logical dump (`postgres.sql.gz`)
-   Synapse volumes archive (`synapse-data-media.tgz`)
-   Rendered Synapse and coturn config
-   Compose manifest and `.env`
-   SHA256 manifest

Manual run:

```bash
sudo systemctl start blackout-backup.service
```

Check timer:

```bash
systemctl list-timers blackout-backup.timer
```

## 7) Rollback procedure

### A) Application image rollback

Images are local builds, so there is nothing to `pull`. Before a deploy,
keep the running image under a second tag, e.g.
`docker tag blackout-api:hono blackout-api:hono-prev` (same for
`blackout-frontend:stable` / `blackout-synapse:stable`).

1. Point the service back at the retained tag: set `FRONTEND_TAG` /
   `API_TAG` / `SYNAPSE_TAG` in `.env`, and the matching `image:` line in
   `docker-compose.override.yml` (the override's pin wins over `.env`). Or
   rebuild the previous commit with the commands in `deploy.sh`.
2. Re-deploy:

```bash
docker compose up -d frontend api synapse reverse-proxy
```

3. Validate health endpoints.

### B) Full stack rollback from backup

1. Stop stack:

```bash
docker compose down
```

2. Restore Synapse/config snapshots from chosen backup directory.
3. Restore DB:

```bash
docker compose up -d postgres
zcat /var/backups/blackout/<STAMP>/postgres.sql.gz | docker compose exec -T postgres psql -U ${POSTGRES_USER} ${POSTGRES_DB}
```

4. Start services:

```bash
docker compose up -d
```

## 8) Disaster recovery (new host)

1. Provision new host, install Docker + Compose.
2. Restore `/opt/blackout` folder (compose + configs + `.env`).
3. Restore backup directory under `/var/backups/blackout`.
4. Recreate named volumes.
5. Restore database dump and Synapse archives.
6. Start stack with `docker compose up -d`.
7. Re-point DNS A records to new host IP.
8. Validate endpoints and federation.

## 9) Post-deploy validation matrix

```bash
docker compose ps
```

Expected: core services `Up` and healthy; `certbot` is a manual profile service used by systemd renewal jobs.

```bash
docker compose logs --tail=100 synapse api reverse-proxy
```

Expected: no crash loops; successful upstream traffic.

```bash
curl -I https://theblackout.app
curl -I https://chat.theblackout.app
curl -I https://api.theblackout.app/health
curl -I https://matrix.theblackout.app/_matrix/client/versions
curl -I https://turn.theblackout.app/healthz
```

Expected: `200`/`204` (or `404` for `/healthz` if coturn metrics disabled).

## 10) Launch security baseline (single-server)

### Security controls table

| Control area                     | Baseline control                                                                                                                           | Implementation location                                                          | Owner                   | Cadence                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------- | ----------------------------------- |
| Public surface minimization      | Only `80/443` (web) and TURN listener ports are exposed; DB/Redis stay private on internal networks.                                       | `docker-compose.yml` (`ports`, `expose`, internal networks), Nginx host routing. | Platform Ops            | Continuous                          |
| Admin route lockdown             | Deny `/_synapse/admin` at the reverse proxy so admin APIs are not internet-reachable.                                                      | `nginx/sites-available/theblackout.app.conf`                                     | Platform Ops + Security | Continuous                          |
| Login rate limiting              | Nginx IP-based request throttling on Matrix login API.                                                                                     | `nginx/nginx.conf` + matrix server `location` limits                             | Security Engineering    | Continuous                          |
| Registration rate limiting       | Nginx IP-based throttling on Matrix registration API plus Synapse registration enabled by default with verification requirements enforced. | `nginx/nginx.conf`, `theblackout.app.conf`, `synapse/homeserver.yaml.template`   | Security Engineering    | Continuous                          |
| Media upload rate limiting       | Nginx throttling on media upload route to reduce flood and storage abuse risk.                                                             | `nginx/nginx.conf` + matrix server `location` limits                             | Platform Ops            | Continuous                          |
| Federation ingress rate limiting | Nginx throttling on federation/key ingress endpoints to contain burst abuse from remote homeservers.                                       | `nginx/nginx.conf` + matrix server `location` limits                             | Security Engineering    | Continuous                          |
| Secret rotation policy           | Rotate DB/Redis/Synapse/TURN secrets on a fixed schedule and after incidents; document completion in change log.                           | `.env`, `synapse/homeserver.yaml`, `coturn/turnserver.conf`                      | Security + On-call      | Every 90 days + on incident         |
| TLS expiry alerting              | Weekly certificate expiry check with warning threshold at 21 days; alert on-call if below threshold.                                       | systemd timer + OpenSSL check command                                            | Platform Ops            | Weekly                              |
| Bot abuse mitigation runbook     | Tie launch baseline to bot-abuse incident workflow (detect, contain, challenge, block, review).                                            | `RUNBOOK.md` §11                                                                 | Security On-call        | During incidents + monthly tabletop |

### Implementation checklist

-   [ ] Confirm host firewall allows only required ingress: `80/tcp`, `443/tcp`, TURN (`3478/tcp+udp`, `5349/tcp`, relay UDP range).
-   [ ] Deploy latest Nginx config with rate-limit zones and admin API deny rule.
-   [ ] Confirm Synapse launch posture matches intended registration posture (open by default, or explicitly disabled for invite-only cohorts). For the invite-only / one-time-token flow see [`synapse/ENABLE_REGISTRATION.md`](synapse/ENABLE_REGISTRATION.md).
-   [ ] Set and store strong unique secrets in `.env` for DB/Redis/Synapse/TURN.
-   [ ] Execute secret rotation procedure (generate new secrets, update templates, restart impacted services, revoke old material).
-   [ ] Install weekly TLS expiry alert via systemd timer or cron (21-day warning threshold).
-   [ ] Wire alerts to on-call channel (email/PagerDuty/Slack webhook) and record test alert evidence.
-   [ ] Review bot-abuse mitigation runbook with on-call before launch.
-   [ ] Run verification commands in §12 and attach outputs to launch ticket.

## 11) Bot abuse mitigation runbook integration

When abuse indicators spike (signup bursts, login spray, upload floods, federation spam), follow this sequence:

1. **Detect**: verify with Nginx and Synapse logs (`429`, repeated auth failures, media burst anomalies).
2. **Contain**: temporarily tighten Nginx/Synapse limits and, if needed, set registration to invite-only/closed.
3. **Challenge**: route suspicious traffic through upstream anti-bot controls (WAF/challenge at CDN if present).
4. **Block**: apply IP/ASN temporary deny rules with expiry notes.
5. **Recover**: normalize limits after attack subsides; monitor for 24h.
6. **Review**: publish incident notes, add IoCs, and update limit thresholds/runbook.

## 11.1) Draupnir moderation sidecar

The `draupnir` service enforces policy lists, protections, and raid
lockdowns; the Blackout client's moderation console
(`features/moderation/draupnir`) is a front-end for the same management
room. One-time bootstrap:

1. Register a dedicated bot account (e.g. `@draupnir:theblackout.app`)
   using a registration token or the admin API, and mint it a
   non-expiring access token:

```bash
curl -s -XPOST https://matrix.theblackout.app/_matrix/client/v3/login \
  -d '{"type":"m.login.password","identifier":{"type":"m.id.user","user":"draupnir"},"password":"<bot password>"}' | jq -r .access_token
```

2. Create a **private** management room, invite the bot and your
   moderators, and give the bot moderator power (PL 50+) there and in
   every room it should protect.
3. Set `DRAUPNIR_ACCESS_TOKEN` and `DRAUPNIR_MANAGEMENT_ROOM` in `.env`,
   render the config (step 6 in the pre-deploy checklist), and
   `docker compose up -d draupnir`.
4. Point the client console at the same room: each moderator sets the
   `co.bmc.draupnir` account-data event to
   `{"managementRoomId": "!...:theblackout.app"}` (or
   `managementRoomAlias`) — the console's setup screen does this.
5. Verify: send `!draupnir status` in the management room; the bot
   should reply. `docker logs blackout-draupnir` shows enforcement
   decisions.

Draupnir state lives in the `blackout-draupnir-data` volume; include it
in the backup schedule alongside the Synapse volumes.

## 12) Verification steps with commands

Run these after any baseline change.

```bash
# 1) Validate rendered Compose model
cd /opt/blackout && docker compose config >/tmp/blackout.compose.rendered.yaml

# 2) Validate Nginx syntax inside the running reverse-proxy container
docker compose exec reverse-proxy nginx -t

# 3) Confirm admin route lockdown (expect 403)
curl -I https://matrix.theblackout.app/_synapse/admin/v1/server_version

# 4) Confirm login endpoint is reachable and rate-limited under burst
auth_payload='{"type":"m.login.password","identifier":{"type":"m.id.user","user":"probe"},"password":"bad"}'
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}
"     -H 'Content-Type: application/json'     -d "$auth_payload"     https://matrix.theblackout.app/_matrix/client/v3/login
 done | sort | uniq -c

# 5) Confirm registration endpoint throttles (expect some 429s)
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}
"     -H 'Content-Type: application/json'     -d '{"username":"probe'$i'","password":"x","auth":{"type":"m.login.dummy"}}'     https://matrix.theblackout.app/_matrix/client/v3/register
done | sort | uniq -c

# 6) Check federation ingress endpoint availability
curl -I https://matrix.theblackout.app/_matrix/federation/v1/version

# 7) TLS expiry check (warn if <21 days)
DOMAIN=matrix.theblackout.app
end_date=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
end_epoch=$(date -d "$end_date" +%s)
now_epoch=$(date +%s)
days_left=$(( (end_epoch - now_epoch) / 86400 ))
echo "TLS days remaining: $days_left"
[ "$days_left" -lt 21 ] && echo "ALERT: certificate expires in <21 days" && exit 2 || true

# 8) Secret age review evidence (example using file mtime)
stat -c '%n %y' .env synapse/homeserver.yaml coturn/turnserver.conf
```

Expected outcomes:

-   Nginx config test passes.
-   Admin API returns `403`/`401` at edge (not open access).
-   Burst login/registration tests produce `429` responses.
-   TLS check reports >=21 days remaining (or triggers alert path).

## 13) Capacity telemetry

Synapse exposes Prometheus metrics on a dedicated internal listener on
port 9101 at path `/_synapse/metrics`. The listener is configured in
`synapse/homeserver.yaml.template` (the `type: metrics` listener and
`enable_metrics: true` toggle); the docker-compose service exposes
9101 only inside the `app`/`data` networks, never to the host.

The matching Prometheus scrape job is defined in
`deploy/docker/production/monitoring/prometheus/prometheus.yml.example`
under the `synapse` job. The Grafana dashboard that consumes these
metrics is `docs/operations/dashboards/synapse_capacity_dashboard.json`.

The dashboard covers the §4.1 watch-items from
`docs/AGGRESSIVE_OPERATIONS_GUIDE.md`: federation outbound queue
(PDUs and EDUs), media-store growth proxies, state-group count,
request-time p95, background DB transaction p95, and process resource
use.

Postgres-side panels (autovacuum lag on Synapse state tables, connection
pool utilisation, buffer-cache hit ratio) are fed by the
`postgres-exporter` service in `docker-compose.yml`, scraped by the
`postgres` job in
`deploy/docker/production/monitoring/prometheus/prometheus.yml.example`.

The exporter currently connects as `POSTGRES_USER` (the application
superuser) for simplicity. The recommended upgrade is a dedicated
read-only role:

```sql
CREATE USER postgres_exporter WITH PASSWORD '<secret>';
GRANT pg_monitor TO postgres_exporter;
```

Then update `DATA_SOURCE_NAME` on the exporter and the secret in the
secrets manager. Tracked here because it is a low-priority hardening
step rather than a Foundation gate.

Capacity bands are deliberately not set; per §4.1, they require
operating telemetry that does not yet exist. The dashboard is the
substrate for setting them once the data is in.

## 14) Media store lifecycle

Media retention is configured under the `media_retention:` block in
`synapse/homeserver.yaml.template`:

| Class                               | Retained for | Why                                                     |
| ----------------------------------- | ------------ | ------------------------------------------------------- |
| Local media (uploaded by our users) | 365 days     | Cannot be re-fetched from elsewhere; treat as user data |
| Remote media (federation-cached)    | 30 days      | Re-fetchable from the originating homeserver on demand  |

To widen retention, increase the values; to tighten, decrease and run
a manual GC pass through the Synapse admin API. Synapse runs a media
retention background task automatically after the values are set;
no separate cron is required.

The media-store volume (`blackout-synapse-media`, mounted at `/media`)
is in the §1 backup-criticality "Critical" tier. Retention only
controls Synapse's GC cadence; backups are independent and continue to
hold media beyond the retention window.

## 15) Postgres baseline tuning

The Postgres container runs with the config file at
`postgres/postgresql.conf` (mounted at `/etc/postgresql/postgresql.conf`
inside the container). Tuning rationale and re-evaluation triggers
live as comments in the config file itself.

Headlines:

-   **Memory**: `shared_buffers=8GB`, `effective_cache_size=24GB`,
    `work_mem=32MB`, `maintenance_work_mem=2GB`. Conservative for the
    consolidated DL360; widen once telemetry shows the planner spilling.
-   **Autovacuum**: more aggressive than Postgres defaults
    (`autovacuum_vacuum_scale_factor=0.05`,
    `autovacuum_analyze_scale_factor=0.025`,
    `autovacuum_max_workers=4`). Synapse state-table churn is the
    rationale.
-   **WAL**: `wal_level=replica` plus `wal_compression=on`, ready for
    the Differentiation milestone streaming-replication deliverable.
-   **Observability**: `pg_stat_statements` preloaded;
    `track_io_timing=on`; `log_autovacuum_min_duration=1s` so autovacuum
    starvation surfaces in logs.

Reload non-restart parameters with `pg_ctl reload` from inside the
postgres container; restart the service for memory-related changes.

## 16) Worker-mode references

Synapse runs as a single process by default. Worker-mode artifacts are
pre-staged but not enabled:

-   Worker config files: `synapse/workers/{federation_sender,generic_worker,background_worker}.yaml`.
-   Commented-in main-process stanzas: bottom of
    `synapse/homeserver.yaml.template`.
-   Enablement runbook (when, how, validation, rollback):
    `docs/runbooks/SYNAPSE_WORKER_ENABLEMENT.md`.

The triggers that justify enabling workers are panels on the
`synapse_capacity` dashboard (§13 above); the runbook lists the
specific thresholds. Until those triggers fire, leave workers
disabled. The §9.2 tracker row in the operations guide is satisfied
by the artifacts existing in a clearly enable-able state, not by them
being live.

## 17) Spatial layer base (PostGIS + Martin + PMTiles)

The single Postgres instance carries the spatial layer in addition to
Synapse and the application schema. The image is the upstream
`postgis/postgis:16-3.4-alpine` — binary-compatible with vanilla
Postgres for non-spatial consumers, with the PostGIS extension
available for the dedicated `spatial` database created by
`postgres/initdb/01-spatial-database.sql`.

Tile serving is via MapLibre Martin
(`ghcr.io/maplibre/martin:v0.14.2`), config-only-adopted via
`martin/martin.yaml`. Martin reads the `coalition` schema from the
spatial database and any `.pmtiles` archives dropped under
`martin/pmtiles/`. Public access is via the nginx `/tiles/` location
on `api.theblackout.app`.

Bootstrap, basemap download, and the existing-volume migration path
live in `docs/runbooks/SPATIAL_LAYER_BASE.md`.

Hardening backlog:

-   **Read-only `martin` Postgres role.** Currently Martin connects as
    `POSTGRES_USER` (the app superuser) for first-deploy simplicity. The
    upgrade path to a dedicated read-only role is in
    `docs/runbooks/SPATIAL_LAYER_BASE.md` §3 and parallels the
    `pg_monitor` upgrade for the postgres-exporter (§13 above).
-   **Cert SAN for `tiles.theblackout.app`.** The Differentiation
    milestone (17 heatmap layers + flash mob layer) may want tiles on a
    dedicated hostname for cache-header divergence and observability
    separation. Path-based routing is fine until then.

## 18) Analytics warehouse (ClickHouse + Cube + Metabase)

The Foundation milestone analytics consolidation (AOG §9.3) ships
three OSS services on the same host:

-   **ClickHouse** (`clickhouse/clickhouse-server:24.3-alpine`) — OLAP
    store. Memory cap 8 GB via `clickhouse/config.d/blackout.xml`.
    Schemas `analytics` and `analytics_raw` created by initdb.
-   **Cube** (`cubejs/cube:v0.36.0`) — semantic layer reading from
    ClickHouse. One seed model in `cube/schema/Events.yml`.
-   **Metabase** (`metabase/metabase:v0.50.0`) — BI / dashboarding,
    AGPL-3.0 Community Edition. App data in the `metabase` Postgres
    database created by `postgres/initdb/02-metabase-database.sql`.
    Listens on 3001 (3000 is taken by Martin per §17).

All three are internal-only at this milestone. Maintainer access to
Metabase is via SSH tunnel (`ssh -L 3001:localhost:3001`). Public
exposure is deferred to the Differentiation milestone — see
`docs/runbooks/ANALYTICS_WAREHOUSE.md` §0 for the rationale (SSO
wiring + AGPL-3.0 modification posture both want resolving first).

Bootstrap, smoke test, schema patterns, and the existing-volume
migration path live in `docs/runbooks/ANALYTICS_WAREHOUSE.md`.

Hardening backlog:

-   **Dedicated read-only ClickHouse users** for Cube and Metabase
    (currently both connect as `default`). Parallels the `pg_monitor`
    upgrade for postgres-exporter (§13) and the read-only `martin`
    role (§17).
-   **clickhouse-backup cron** integrated into
    `infra/single-server-baseline/backup/`. Skip until the analytics
    workload becomes load-bearing.
-   **Metabase SSO** against the Matrix/Keycloak surface so admin
    access stops depending on a separate password store.

## 19) Free Black Market marketplace link (cross-stack networking)

The Blackout marketplace ("The Black Market" in the client) sources its
catalog from a Free Black Market (FBM) backend running as a _separate_
Compose project on the same host (`~/free-black-market`, container
`free-black-market-backend-1`). The two stacks are joined by a dedicated
bridge network so the link survives container recreates — never by a manual
`docker network connect`, which is runtime-only state that silently
disappears on the next `--force-recreate`.

Note on paths: this section uses `/opt/blackout-infra` for the live deploy
directory; §2 says `/opt/blackout`. Some deployments copied this folder to
`/opt/blackout-infra` — use whatever directory holds your live
`docker-compose.yml` + `docker-compose.override.yml`.

Topology rules:

-   The shared network is created **once**, out of band, and declared
    `external: true` in both stacks' override files.
-   It is created with `--internal`. This is load-bearing: `api` otherwise
    sits only on `internal: true` networks, and a plain bridge would grant it
    NAT egress to the internet. `--internal` still allows container-to-container
    traffic and DNS on that network.
-   Only two containers join it: `blackout-api` and the FBM `backend`. FBM's
    postgres/redis/minio stay on FBM's own default network, unreachable from
    Blackout.
-   `FREEBLACKMARKET_BASE_URL` targets the container directly
    (`http://free-black-market-backend-1:9000`). Do not point it at the
    public `https://api.freeblackmarket.com` — that hairpins out through
    Cloudflare and back into the same host.
-   FBM mounts the commerce surface at `/v1/integrations/blackout/commerce`,
    which is the provider's default path prefix. `FREEBLACKMARKET_API_PREFIX`
    exists as an override if FBM ever moves that mount (a path packed into
    the base URL would be discarded by URL resolution).
-   The reverse direction uses the same bridge. FBM signs its outbound
    webhooks (purchases, membership sync, ledger) with
    `FREEBLACKMARKET_WEBHOOK_SECRET` and POSTs them to
    `${BLACKOUT_API_BASE}/v1/marketplace/webhooks/freeblackmarket`. On the FBM
    backend set:

    ```
    BLACKOUT_API_BASE=http://blackout-api:9000
    ```

    `blackout-api` is the api container name (resolvable on `bmc-bridge`) and
    9000 is its listen port (`PORT=9000` in `docker-compose.yml`, the port
    nginx's `blackout_api` upstream uses; the `EXPOSE 3001` in
    `Dockerfile.blackout-api-hono` is not what it listens on). Give the bare
    origin: FBM appends `/v1/marketplace/webhooks/freeblackmarket` itself. With
    `BLACKOUT_API_BASE` unset FBM's emitter treats the channel as unconfigured
    and sends nothing — FBM's config does not require the variable, so the
    gap is silent. FBM also reads `BLACKOUT_API_BASE` for its spatial
    consumer (`FBM_BLACKOUT_SPATIAL`, server-to-server, fine over the bridge)
    and for the scaffolded Blackout content-platform provider, whose OAuth
    authorize URL is a browser redirect and would not resolve at the bridge
    address; that provider is unimplemented today.

### FBM service-token integration (default off)

`docker-compose.override.yml.example` and `.env.example` carry commented
entries for the second FBM link. Leave them commented until you roll it out:

-   `FBM_ENTITLEMENTS_BASE_URL` — FBM origin over the bridge,
    `http://free-black-market-backend-1:9000`. The API also accepts
    `…:9000/v1/integrations/blackout`; both resolve to the same integration
    root (`packages/api/src/integrations/fbm/integrationRoot.ts`).
-   `FBM_ENTITLEMENTS_SERVICE_TOKEN` — must equal FBM's
    `ENTITLEMENTS_SERVICE_TOKEN`. With either of these two unset, entitlement
    reads, coalition pushes and reputation events no-op.
-   `FBM_MATRIX_BRIDGE_ENABLED=0` — FBM → Matrix room bridge and its sweepers.
-   `FBM_ACL_SYNC_ENABLED=0` — entitlements → Matrix ACL sync and its
    reconcile loop.

The two worker gates are on only when set to `1` or `true`.

### One-time prerequisite

```bash
docker network create --internal bmc-bridge
```

### Rollout

```bash
# 1) Rebuild the api image from a repo checkout whose provider targets the
#    FBM commerce mount (context is the repo root; the checkout lives
#    wherever this host keeps it, e.g. ~/blackout-new on the current
#    production host).
cd <your-blackout-repo-checkout>
docker build -f infra/single-server-baseline/Dockerfile.blackout-api-hono -t blackout-api:hono .

# 2) FBM side: pull the override that attaches the backend to bmc-bridge.
cd ~/free-black-market
git pull
docker compose config >/dev/null   # validate merge before touching containers
docker compose up -d backend
# FBM env prerequisites (already-live deployments have these):
#   FBM_BLACKOUT_INTEGRATION=1 and FREEBLACKMARKET_API_KEY matching
#   Blackout's — otherwise the commerce surface answers 503/401, which
#   Blackout's logs still report as marketplace.catalog.fetch_failed.
#   For FBM -> Blackout webhooks, also FREEBLACKMARKET_WEBHOOK_SECRET matching
#   Blackout's and BLACKOUT_API_BASE=http://blackout-api:9000 (see above).

# 3) Blackout side: back up, then mirror the FREEBLACKMARKET_* environment
#    block and the api networks list from docker-compose.override.yml.example
#    into the live override, and add the two secrets to .env.
cd /opt/blackout-infra
cp docker-compose.override.yml docker-compose.override.yml.bak.$(date +%Y%m%d-%H%M%S)
# edit docker-compose.override.yml per the .example (env block + networks +
# top-level bmc-bridge declaration); then append to .env (chmod 600):
#   FREEBLACKMARKET_API_KEY=...
#   FREEBLACKMARKET_WEBHOOK_SECRET=...
docker compose config >/dev/null   # validate before recreating
docker compose up -d --force-recreate api
```

### Acceptance checks

```bash
# 1) Catalog reachable end to end (expect the seeded listings, not [])
curl -s 'https://chat.theblackout.app/v1/marketplace/listings' | head -c 400

# 2) No fetch failures; no provider silently dropped (provider_init_failed
#    means the FBM secrets are missing/empty in the api environment)
docker logs blackout-api --since 10m 2>&1 | grep -Ei 'fetch_failed|provider_init_failed' || echo OK

# 3) Wiring survives recreate (the whole point of the declarative setup)
docker compose up -d --force-recreate api
docker inspect blackout-api -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
#   expect bmc-bridge alongside blackout-app/blackout-data, and NOT
#   free-black-market_default (the old manual connect must be gone)
docker exec blackout-api wget -qO- http://free-black-market-backend-1:9000/health

# 4) Still no internet egress from the api container (must FAIL)
docker exec blackout-api wget -qO- --timeout=5 https://api.github.com \
  && echo 'ALERT: api has internet egress' || echo OK

# 5) Shared network exists and is internal (expect: true)
docker network inspect bmc-bridge -f '{{.Internal}}'

# 6) FBM can reach the webhook target named by its BLACKOUT_API_BASE (expect 200)
docker exec free-black-market-backend-1 node -e \
  "fetch('http://blackout-api:9000/health').then(r => console.log(r.status))"
```
