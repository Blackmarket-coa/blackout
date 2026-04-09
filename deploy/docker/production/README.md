# Production-grade Docker Compose blueprint

This reference stack provides a hardened five-tier topology:

- `reverse-proxy` (Caddy) – public ingress/TLS termination.
- `app` – API/web application.
- `worker` – async jobs and background processing.
- `db` (PostgreSQL) – durable relational data.
- `cache` (Redis) – low-latency cache/queue state.
- `backup` (optional `ops` profile) – scheduled PostgreSQL backups to a persistent volume.

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

- `app`: `/healthz` endpoint.
- `worker`: `./bin/worker-healthcheck` command.
- `db`: `pg_isready`.
- `cache`: `redis-cli PING` with password.
- `reverse-proxy`: Caddy admin API probe.

Compose startup and restarts rely on `condition: service_healthy`.

## 3) Startup ordering

Ordering is explicit via `depends_on`:

- `app` waits for `db` + `cache` healthy.
- `worker` waits for `db`, `cache`, and `app` healthy.
- `reverse-proxy` waits for `app` healthy.
- `backup` waits for `db` healthy.

`app` also runs migrations in its start command before booting traffic handlers.

## 4) Persistent volumes

Named volumes keep state across redeploys:

- `db_data` for PostgreSQL.
- `cache_data` for Redis AOF/RDB.
- `proxy_data`/`proxy_config` for TLS certificates and Caddy state.
- `db_backups` for scheduled backups.

Because these are named volumes, `docker compose pull && up -d` can roll containers without data loss.

## 5) Backup strategy

Two-layer backup pattern:

- **Scheduled**: `backup` service (daily dump, 7 daily / 4 weekly / 6 monthly retention).
- **On-demand**: `scripts/backup.sh` creates timestamped PostgreSQL dump + Redis snapshot + checksums.

Recommended production hardening:

- Replicate `db_backups` off-host (S3, GCS, rsync target).
- Encrypt at rest and in transit.
- Run periodic restore drills in CI/staging.

## 6) CI deployment hooks

See `.github/workflows/deploy-compose-prod.yml` for hooks that:

1. Build and push image tag.
2. SSH to target host.
3. Pull new image.
4. Run `docker compose up -d --remove-orphans`.
5. Run post-deploy health gate.
6. Trigger backup verification workflow.

Use GitHub environments + required reviewers for gated production releases.

## Cloudflare Tunnel migration runbook

For staged Cloudflare Tunnel + TLS + DNS migration (staging then production), see:

- `CLOUDFLARE_TUNNEL_MIGRATION_RUNBOOK.md`
