# Cloudflare Tunnel + TLS + DNS migration runbook (staging + production)

This runbook covers a staged migration for Dockerized services that sit behind `cloudflared` and Cloudflare DNS.

---

## 0) Target architecture

- `cloudflared` runs as a Docker container on each environment (`staging`, `prod`).
- Public DNS records in Cloudflare are switched from legacy origin/ingress to Cloudflare Tunnel CNAME routes.
- TLS mode is **Full (strict)** in Cloudflare.
- Origin TLS is terminated either:
  - at reverse proxy (Caddy/Nginx/Traefik) with Cloudflare Origin Certificate, or
  - by local service certs trusted by cloudflared ingress (if you terminate in app tier).

---

## 1) Preflight checklist

> Complete this in staging first, then repeat for production.

### 1.1 Account and access

- [ ] Cloudflare account access with DNS + Zero Trust permissions.
- [ ] Zone is active (no pending nameserver change).
- [ ] API token scoped for tunnel + DNS automation (least privilege).
- [ ] Break-glass owner account documented.

### 1.2 Inventory and dependency map

- [ ] List all hostnames to migrate (e.g., `api`, `ws`, `admin`, `metrics` if public).
- [ ] Capture current origin endpoints and TLS modes.
- [ ] Capture dependent allowlists/firewall rules (partners, webhook senders, corporate IPs).
- [ ] Confirm websocket and long-lived HTTP support requirements.

### 1.3 Docker host readiness

- [ ] Docker Engine healthy and persistent storage available.
- [ ] Time sync enabled (NTP/chrony).
- [ ] Outbound egress to Cloudflare required ports allowed.
- [ ] Existing reverse proxy health endpoint reachable from localhost.

### 1.4 DNS and TTL preparation

- [ ] Lower DNS TTL to `60` seconds **at least 24h before cutover**.
- [ ] Export current DNS records (backup JSON/CSV).
- [ ] Mark records that will become tunnel CNAMEs.

### 1.5 TLS readiness

- [ ] Cloudflare SSL/TLS mode set target: **Full (strict)**.
- [ ] Origin certificate/key available and mounted in reverse proxy.
- [ ] Certificate SANs include all target hostnames.
- [ ] TLS handshake from `cloudflared` to origin validated in staging.

### 1.6 Observability readiness

- [ ] Dashboards built for 4xx/5xx, latency p95/p99, tunnel disconnects.
- [ ] Alert routes verified (PagerDuty/Slack/email).
- [ ] Synthetic probes for each public endpoint created.

---

## 2) Staging rollout (step-by-step)

### 2.1 Create a tunnel (once per environment)

```bash
# auth (interactive, run on secure admin workstation)
cloudflared tunnel login

# create tunnel
cloudflared tunnel create blackout-staging

# create credentials file location
mkdir -p deploy/docker/production/.cloudflared/staging
# copy generated <TUNNEL_ID>.json to:
# deploy/docker/production/.cloudflared/staging/credentials.json
```

### 2.2 Create cloudflared config

Create `deploy/docker/production/cloudflared/staging-config.yml`:

```yaml
tunnel: <STAGING_TUNNEL_ID>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: api-staging.example.com
    service: https://reverse-proxy:443
    originRequest:
      http2Origin: true
      noTLSVerify: false
  - hostname: ws-staging.example.com
    service: https://reverse-proxy:443
    originRequest:
      http2Origin: true
      noTLSVerify: false
  - service: http_status:404
```

### 2.3 Add tunnel service to Compose

Example snippet (add to your staging compose override):

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:2026.4.0
    command: tunnel --no-autoupdate run --config /etc/cloudflared/config.yml
    restart: unless-stopped
    depends_on:
      reverse-proxy:
        condition: service_healthy
    volumes:
      - ./cloudflared/staging-config.yml:/etc/cloudflared/config.yml:ro
      - ./.cloudflared/staging/credentials.json:/etc/cloudflared/credentials.json:ro
    networks:
      - edge
```

### 2.4 Create DNS routes for staging hostnames

```bash
# from project root using cloudflared DNS helper
cloudflared tunnel route dns blackout-staging api-staging.example.com
cloudflared tunnel route dns blackout-staging ws-staging.example.com
```

Alternative API example:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "type":"CNAME",
    "name":"api-staging",
    "content":"<TUNNEL_ID>.cfargotunnel.com",
    "ttl":60,
    "proxied":true
  }'
```

### 2.5 Deploy staging

```bash
docker compose -f deploy/docker/production/docker-compose.yml \
  -f deploy/docker/production/docker-compose.staging.yml \
  up -d reverse-proxy cloudflared

docker compose -f deploy/docker/production/docker-compose.yml \
  -f deploy/docker/production/docker-compose.staging.yml \
  ps
```

### 2.6 Validate staging before production approval

```bash
# DNS path
curl -I https://api-staging.example.com/healthz

# websocket upgrade
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: ws-staging.example.com" \
  https://ws-staging.example.com/

# origin service directly from host (sanity)
docker compose -f deploy/docker/production/docker-compose.yml exec -T reverse-proxy \
  wget -q -O- http://app:3000/healthz
```

**Exit criteria for staging:** 24h stable with no critical alerts, error budget impact acceptable.

---

## 3) Production cutover (step-by-step)

### 3.1 Change freeze and comms

- [ ] Announce maintenance/cutover window.
- [ ] Freeze unrelated deploys.
- [ ] Keep legacy ingress running for rollback window.

### 3.2 Repeat tunnel provisioning for prod

```bash
cloudflared tunnel create blackout-prod
mkdir -p deploy/docker/production/.cloudflared/prod
# place credentials.json under .cloudflared/prod
```

Create `deploy/docker/production/cloudflared/prod-config.yml` using production hostnames.

### 3.3 Deploy `cloudflared` in parallel

```bash
docker compose -f deploy/docker/production/docker-compose.yml \
  -f deploy/docker/production/docker-compose.prod-tunnel.yml \
  up -d cloudflared
```

### 3.4 DNS migration sequence

1. Create tunnel CNAME records for each production hostname.
2. Verify each resolves to `<TUNNEL_ID>.cfargotunnel.com`.
3. Keep legacy origin records documented and ready for rollback.
4. Confirm Cloudflare proxy status is enabled (orange cloud).

### 3.5 TLS policy switch

- Set SSL/TLS encryption mode to **Full (strict)**.
- Confirm origin cert chain is valid for all hostnames.
- Verify no fallback to insecure mode.

---

## 4) Rollback plan

> Trigger rollback immediately if any P1/P2 symptom persists > 5 minutes.

### 4.1 Rollback triggers

- 5xx rate above threshold (e.g., >2% for 5 minutes).
- Auth/session breakage > threshold.
- Websocket failure rate spikes.
- Tunnel flaps/disconnects with customer impact.

### 4.2 DNS rollback steps

```bash
# restore previous DNS records (from backup export)
# remove or disable tunnel CNAME records
# restore A/AAAA/CNAME to legacy ingress
```

### 4.3 Runtime rollback steps

```bash
# stop tunnel path only
docker compose -f deploy/docker/production/docker-compose.yml \
  -f deploy/docker/production/docker-compose.prod-tunnel.yml \
  stop cloudflared

# optional: remove cloudflared service container
docker compose -f deploy/docker/production/docker-compose.yml \
  -f deploy/docker/production/docker-compose.prod-tunnel.yml \
  rm -f cloudflared
```

### 4.4 Post-rollback verification

- Confirm DNS propagated back to legacy ingress.
- Confirm synthetic tests green.
- Publish incident update and next attempt timeline.

---

## 5) Post-cutover verification commands (production)

Run at cutover +5m, +30m, +2h, +24h:

```bash
# DNS resolution
for h in api.example.com ws.example.com; do
  dig +short "$h"
done

# HTTP health and headers
curl -sS -D - -o /dev/null https://api.example.com/healthz

# cert details
openssl s_client -connect api.example.com:443 -servername api.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates

# Cloudflare edge response trace (if endpoint enabled)
curl -s https://api.example.com/cdn-cgi/trace

# tunnel container logs
docker compose -f deploy/docker/production/docker-compose.yml \
  -f deploy/docker/production/docker-compose.prod-tunnel.yml \
  logs --since=10m cloudflared

# app health from origin network
docker compose -f deploy/docker/production/docker-compose.yml exec -T app \
  wget -q -O- http://127.0.0.1:3000/healthz
```

---

## 6) Monitoring alarms to add

Set baseline from staging, then tune for prod traffic.

### 6.1 Availability and correctness

- **Synthetic check failure** per hostname (2/3 regions failing for 3 minutes).
- **HTTP 5xx ratio** > 2% for 5 minutes (warning), > 5% for 5 minutes (critical).
- **HTTP 4xx surge** > 3x baseline for 10 minutes.

### 6.2 Performance

- **p95 latency** > 800ms for 10 minutes.
- **p99 latency** > 1500ms for 10 minutes.
- **Websocket connect failures** > 1% for 5 minutes.

### 6.3 Tunnel health

- **cloudflared disconnect/reconnect flaps** > 3 in 10 minutes.
- **No active tunnel connections** for 1 minute (critical).
- **Ingress origin dial errors** > threshold (warn/critical tiers).

### 6.4 Origin and platform

- **Reverse proxy upstream failure count** spike.
- **Container restart count** (`cloudflared`, `reverse-proxy`, `app`) > 2/hour.
- **DB saturation** (connections > 85%, disk usage > 80%).
- **Redis memory pressure** > 85% maxmemory.

### 6.5 Security/TLS

- **Certificate expiry** < 21 days (warning), < 7 days (critical).
- **Unexpected SSL mode change** from Full (strict).
- **WAF/Rate-limit anomaly** (if enabled) for critical routes.

---

## 7) Suggested file layout for this repo

```text
deploy/docker/production/
  docker-compose.yml
  docker-compose.staging.yml
  docker-compose.prod-tunnel.yml
  cloudflared/
    staging-config.yml
    prod-config.yml
  .cloudflared/
    staging/credentials.json   # untracked
    prod/credentials.json      # untracked
```

Add to `.gitignore`:

```gitignore
deploy/docker/production/.cloudflared/
```

---

## 8) Operational notes

- Pin `cloudflared` image versions; avoid floating `latest`.
- Rotate tunnel credentials and API tokens periodically.
- Keep rollback DNS payloads pre-generated.
- Rehearse rollback quarterly.
