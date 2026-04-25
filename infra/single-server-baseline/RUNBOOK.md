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

| Control area | Baseline control | Implementation location | Owner | Cadence |
|---|---|---|---|---|
| Public surface minimization | Only `80/443` (web) and TURN listener ports are exposed; DB/Redis stay private on internal networks. | `docker-compose.yml` (`ports`, `expose`, internal networks), Nginx host routing. | Platform Ops | Continuous |
| Admin route lockdown | Deny `/_synapse/admin` at the reverse proxy so admin APIs are not internet-reachable. | `nginx/sites-available/theblackout.app.conf` | Platform Ops + Security | Continuous |
| Login rate limiting | Nginx IP-based request throttling on Matrix login API. | `nginx/nginx.conf` + matrix server `location` limits | Security Engineering | Continuous |
| Registration rate limiting | Nginx IP-based throttling on Matrix registration API plus Synapse registration enabled by default with verification requirements enforced. | `nginx/nginx.conf`, `theblackout.app.conf`, `synapse/homeserver.yaml.template` | Security Engineering | Continuous |
| Media upload rate limiting | Nginx throttling on media upload route to reduce flood and storage abuse risk. | `nginx/nginx.conf` + matrix server `location` limits | Platform Ops | Continuous |
| Federation ingress rate limiting | Nginx throttling on federation/key ingress endpoints to contain burst abuse from remote homeservers. | `nginx/nginx.conf` + matrix server `location` limits | Security Engineering | Continuous |
| Secret rotation policy | Rotate DB/Redis/Synapse/TURN secrets on a fixed schedule and after incidents; document completion in change log. | `.env`, `synapse/homeserver.yaml`, `coturn/turnserver.conf` | Security + On-call | Every 90 days + on incident |
| TLS expiry alerting | Weekly certificate expiry check with warning threshold at 21 days; alert on-call if below threshold. | systemd timer + OpenSSL check command | Platform Ops | Weekly |
| Bot abuse mitigation runbook | Tie launch baseline to bot-abuse incident workflow (detect, contain, challenge, block, review). | `RUNBOOK.md` §11 | Security On-call | During incidents + monthly tabletop |

### Implementation checklist

- [ ] Confirm host firewall allows only required ingress: `80/tcp`, `443/tcp`, TURN (`3478/tcp+udp`, `5349/tcp`, relay UDP range).
- [ ] Deploy latest Nginx config with rate-limit zones and admin API deny rule.
- [ ] Confirm Synapse launch posture matches intended registration posture (open by default, or explicitly disabled for invite-only cohorts).
- [ ] Set and store strong unique secrets in `.env` for DB/Redis/Synapse/TURN.
- [ ] Execute secret rotation procedure (generate new secrets, update templates, restart impacted services, revoke old material).
- [ ] Install weekly TLS expiry alert via systemd timer or cron (21-day warning threshold).
- [ ] Wire alerts to on-call channel (email/PagerDuty/Slack webhook) and record test alert evidence.
- [ ] Review bot-abuse mitigation runbook with on-call before launch.
- [ ] Run verification commands in §12 and attach outputs to launch ticket.

## 11) Bot abuse mitigation runbook integration

When abuse indicators spike (signup bursts, login spray, upload floods, federation spam), follow this sequence:

1. **Detect**: verify with Nginx and Synapse logs (`429`, repeated auth failures, media burst anomalies).
2. **Contain**: temporarily tighten Nginx/Synapse limits and, if needed, set registration to invite-only/closed.
3. **Challenge**: route suspicious traffic through upstream anti-bot controls (WAF/challenge at CDN if present).
4. **Block**: apply IP/ASN temporary deny rules with expiry notes.
5. **Recover**: normalize limits after attack subsides; monitor for 24h.
6. **Review**: publish incident notes, add IoCs, and update limit thresholds/runbook.

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
- Nginx config test passes.
- Admin API returns `403`/`401` at edge (not open access).
- Burst login/registration tests produce `429` responses.
- TLS check reports >=21 days remaining (or triggers alert path).

