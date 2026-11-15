# Production-grade Docker Compose blueprint

This reference stack provides a hardened five-tier topology:

-   `reverse-proxy` (Caddy) – public ingress/TLS termination.
-   `app` – API/web application.
-   `worker` – async jobs and background processing.
-   `db` (PostgreSQL) – durable relational data.
-   `cache` (Redis) – low-latency cache/queue state.
-   `backup` (optional `ops` profile) – scheduled PostgreSQL backups to a persistent volume.

## 1) Env file strategy

Use layered env files and keep secrets outside git.

1. Commit shared defaults in `.env.example`.
2. Commit production-safe overrides in `.env.production.example`.
3. Copy both to runtime files:

    ```bash
    cp .env.example .env
    cp .env.production.example .env.production
    ```

4. Store credentials in `./.secrets/*.txt` and mount through Compose secrets (`*_FILE` env vars).

Precedence is `environment:` > `.env.production` > `.env`.

## 2) Healthchecks

Every runtime service has a healthcheck:

-   `app`: `/health` endpoint (the API's unauthenticated readiness probe).
-   `worker`: `./bin/worker-healthcheck` command (a heartbeat the worker writes once it has loaded the store).
-   `db`: `pg_isready`.
-   `cache`: `redis-cli PING` with password.
-   `reverse-proxy`: Caddy admin API probe.

Compose startup and restarts rely on `condition: service_healthy`. Caddy also runs its own active health check of `app` (`health_uri` in `Caddyfile`), on the same `/health`, and sends no traffic to an `app` that fails it.

## 3) Startup ordering

Ordering is explicit via `depends_on`:

-   `app` waits for `db` + `cache` healthy.
-   `worker` waits for `db`, `cache`, and `app` healthy.
-   `reverse-proxy` waits for `app` healthy.
-   `backup` waits for `db` healthy.

`app` also runs migrations in its start command before booting traffic handlers.

### Stopping `app`

`docker compose stop`, a restart or a redeploy sends SIGTERM to the container's PID 1, and SIGKILL once `stop_grace_period` has passed: 20 s for `app` and `app_canary`, twice the API's `SHUTDOWN_TIMEOUT_MS` default (10 s, which is also Docker's default grace).

-   The API is PID 1, so it receives the signal itself. The `app` command runs `./bin/migrate`, then `exec`s `bin/start-app`, which execs node. `app_canary` runs the image's `CMD`, `./bin/start-app`. While the migrations run, the shell is PID 1 and ignores SIGTERM, so a stop then waits out the grace period.
-   On SIGTERM the API stops accepting connections. Once every connection has closed, it flushes the write-behind store and exits 0. The store acknowledges a write once its in-memory mirror has it, and writes it to Postgres just after (`packages/api/src/db/writeBehindQueue.ts`). The flush is what keeps a stop from losing the writes still queued.
-   If a connection is still open after `SHUTDOWN_TIMEOUT_MS`, the API exits 0 without the flush. An SSE stream or a WebSocket client, such as an OBS overlay, stays open until its client leaves, so while one is connected every stop takes this path. When Postgres keeps up, the queue has usually emptied by then; any write still queued at that point is lost.
-   Requests the API had not started handling when it stopped accepting are reset, not answered.

### The worker

`worker` runs the API's periodic loops (`packages/api/src/backgroundLoops.ts`), so the `app` replicas, started with `BLACKOUT_BACKGROUND_WORKERS_DISABLED=1`, only serve requests.

-   It loads the store before any loop starts, through the API's own boot (`packages/api/src/db/runtimeStoreBoot.ts`: pending migrations under the migration lock, the migration checksum audit, hydration). In production it refuses to start unless `BLACKOUT_DB_MODE=postgres` and `LOG_HASH_SALT` are set, and it refuses `BLACKOUT_DB_PG_NOTIFY=0`.
-   Only the holder of the background-leader lock, a Postgres advisory lock that the API also takes when it runs the loops itself, runs the loops. Another worker stands by and retries every 15 s. A worker that loses the lock stops its loops and exits 1, and `restart: unless-stopped` boots it again.
-   On SIGTERM (`docker compose stop`, or a redeploy) it starts no new work, waits up to half of `SHUTDOWN_TIMEOUT_MS` (default 10 s, Docker's default stop grace period) for running ticks, flushes the store, releases the lock and exits 0. The compose command is exec form and `bin/start-worker` execs node, so the worker is the process that receives the signal.
-   Due work it reaches more than 15 minutes late (after an outage, say; ten loop intervals if a custom cadence makes that longer) is not done late: a scheduled message expires unsent, and a dead-man switch gets one 72-hour grace window instead of firing (see `KNOWN_LIMITATIONS.md`).

## 4) Persistent volumes

Named volumes keep state across redeploys:

-   `db_data` for PostgreSQL.
-   `cache_data` for Redis AOF/RDB.
-   `proxy_data`/`proxy_config` for TLS certificates and Caddy state.
-   `db_backups` for scheduled backups.

Because these are named volumes, `docker compose pull && up -d` can roll containers without data loss.

## 5) Backup strategy

Two-layer backup pattern:

-   **Scheduled**: `backup` service (daily dump, 7 daily / 4 weekly / 6 monthly retention).
-   **On-demand**: `scripts/backup.sh` creates timestamped PostgreSQL dump + Redis snapshot + checksums.

Recommended production hardening:

-   Replicate `db_backups` off-host (S3, GCS, rsync target).
-   Encrypt at rest and in transit.
-   Run periodic restore drills in CI/staging.

## 6) CI deployment hooks

See `.github/workflows/deploy-compose-prod.yml` for hooks that:

1. Build and push image tag.
2. SSH to target host.
3. Pull new image.
4. Run `docker compose up -d --remove-orphans`.
5. Run post-deploy health gate.
6. Trigger backup verification workflow.

Use GitHub environments + required reviewers for gated production releases.

## Matrix compliance release gate (Complement)

`scripts/release-gate-checks.sh` can run a Complement-based Matrix compliance gate in addition to backup/restore/health checks.

Enable the gate during phased rollout:

```bash
ENABLE_MATRIX_COMPLIANCE_GATE=1 \
MATRIX_COMPLEMENT_SMOKE_CMD="./complement-run.sh smoke" \
./scripts/release-gate-checks.sh
```

Required environment for smoke checks:

-   `ENABLE_MATRIX_COMPLIANCE_GATE=1` to activate the gate.
-   `MATRIX_COMPLEMENT_SMOKE_CMD` must run a **minimal, deterministic** Complement smoke profile against the deployed Synapse target (pin your image/tag and test selection).

Optional environment for E2EE-critical flows:

-   `ENABLE_MATRIX_COMPLEMENT_CRYPTO=1` to run crypto scenarios.
-   `MATRIX_COMPLEMENT_CRYPTO_CMD` for the Complement crypto command.

Execution profile knobs:

-   `MATRIX_COMPLEMENT_SMOKE_PROFILE` (default: `synapse-deployed-smoke`)
-   `MATRIX_COMPLEMENT_CRYPTO_PROFILE` (default: `synapse-deployed-crypto`)
-   `MATRIX_COMPLIANCE_ARTIFACT_DIR` (default: `ops/evidence/matrix-compliance`)
-   `MATRIX_COMPLIANCE_GATE_SCRIPT` to override script path used by `release-gate-checks.sh`

Machine-readable output:

-   `scripts/matrix-compliance-gate.sh` writes a timestamped run directory with:
    -   `result.json` (overall/suite pass-fail state, exit codes, artifact paths)
    -   `result.env` (shell-friendly key/value output for pipeline ingestion)
    -   `smoke.log` and `crypto.log` (suite logs)

If smoke fails, or crypto is enabled and fails, the gate exits non-zero and blocks promotion.

## Cloudflare Tunnel migration runbook

For staged Cloudflare Tunnel + TLS + DNS migration (staging then production), see:

-   `CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`

## Security review

For threat model and hardening guidance of Tunnel/TLS/DNS, see:

-   `NETWORK_SECURITY_REVIEW.md`

## Networking E2E test matrix

For executable migration test steps and pass/fail criteria, see:

-   `NETWORK_E2E_TEST_MATRIX.md`

## Registration control architecture

For invite-only/domain-allowlist/rate-limit/abuse-throttle/admin-override design (API + DB + middleware), see:

-   `REGISTRATION_CONTROL_ARCHITECTURE.md`

## Production operations baseline

For backup/restore drills, media/config backup policy, on-call handoff, release gates, and evidence cadence, see:

-   `OPS_BASELINE.md`
-   `cron/production-ops.cron`
