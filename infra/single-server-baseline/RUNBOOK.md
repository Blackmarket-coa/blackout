# Blackout single-server production baseline runbook

This runbook provides deployment manifests and operating steps for:
- Blackout frontend static app
- Blackout API
- Synapse
- PostgreSQL
- Redis
- coturn

## 1) Layout and persistence model

## Persistent volumes

| Volume | Contents | Backup criticality |
|---|---|---|
| `blackout-postgres-data` | PostgreSQL data files | Critical |
| `blackout-redis-data` | Redis AOF | Medium |
| `blackout-synapse-data` | Synapse config/state/keys | Critical |
| `blackout-synapse-media` | Synapse media store | Critical |
| `blackout-coturn-data` | coturn runtime state | Medium |
| `blackout-letsencrypt` | TLS certificates and renewal state | Critical |
| `blackout-certbot-webroot` | ACME webroot challenge files | Low |

## Least-privilege networking

- `edge` network: externally reachable services (`reverse-proxy`, `coturn`, `certbot`).
- `app` network (`internal: true`): east-west app traffic (`frontend`, `api`, `synapse`, plus proxy/coturn).
- `data` network (`internal: true`): only stateful services and consumers (`postgres`, `redis`, `api`, `synapse`).

No database or Redis ports are published to the host.

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
3. Install Docker Engine and Compose plugin.
4. Copy this folder to `/opt/blackout`.
5. Create env file:

```bash
cd /opt/blackout
cp .env.example .env
chmod 600 .env
```

6. Render templated configs:

```bash
set -a
source .env
set +a
envsubst < synapse/homeserver.yaml.template > synapse/homeserver.yaml
envsubst < coturn/turnserver.conf.template > coturn/turnserver.conf
chmod 600 synapse/homeserver.yaml coturn/turnserver.conf
```

## 3) Initial TLS bootstrap

Start only reverse-proxy and certbot webroot:

```bash
docker compose up -d reverse-proxy certbot
```

Issue certificate once:

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
6. `certbot` renewal loop

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
sudo systemctl daemon-reload
sudo systemctl enable --now blackout-stack.service
sudo systemctl enable --now blackout-backup.timer
```

## 6) Backup hooks and schedule

Backup hook script: `backup/backup.sh`

Captured artifacts:
- Postgres logical dump (`postgres.sql.gz`)
- Synapse volumes archive (`synapse-data-media.tgz`)
- Rendered Synapse and coturn config
- Compose manifest and `.env`
- SHA256 manifest

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

1. Edit `.env` and set previous `FRONTEND_TAG` and/or `API_TAG`.
2. Re-deploy:

```bash
docker compose pull frontend api
docker compose up -d frontend api reverse-proxy
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
Expected: all services `Up` and `healthy` (except certbot may show long-running loop).

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
