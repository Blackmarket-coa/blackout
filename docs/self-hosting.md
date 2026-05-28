# Self-Hosting Blackout

This guide covers running your own Blackout instance — a federated Matrix
homeserver plus the Blackout web client, API, and supporting services. You get
full data sovereignty, your own namespace on the Matrix network, and the ability
to federate with any other Matrix server including `theblackout.app`.

Blackout is licensed under **AGPL-3.0** — self-hosting is free and the full
source is available in this repository.

## Requirements

- Linux server with Docker Engine 24+ and the Compose plugin
- **2+ vCPU, 4+ GB RAM, 20 GB free disk** (dev / small community)
- **4+ vCPU, 8+ GB RAM, 100 GB free disk** (production with analytics)
- A domain name (e.g. `example.com`) with DNS A records pointing to your server
- Firewall: ports 80/tcp, 443/tcp, 3478/tcp+udp, 5349/tcp, 49160-49200/udp

Choose the path below that matches your needs.

---

## Quickstart: Dev Stack (5 minutes)

A minimal Synapse + PostgreSQL + Redis stack for local evaluation or
development. Runs on `localhost` with no domain or TLS required.

### 1) Create the Synapse config

```bash
mkdir -p dev/synapse
cat > dev/synapse/homeserver.yaml << 'EOF'
server_name: "localhost"
pid_file: /data/homeserver.pid
listeners:
  - port: 8008
    tls: false
    type: http
    x_forwarded: true
    resources:
      - names: [client, federation]
        compress: false
database:
  name: psycopg2
  args:
    user: postgres
    password: "${POSTGRES_PASSWORD}"
    host: postgres
    port: 5432
    database: synapse
redis:
  enabled: true
  host: redis
  password: "${REDIS_PASSWORD}"
  port: 6379
log_config: "/data/theblackout.app.log.config"
media_store_path: /data/media_store
enable_registration: true
enable_registration_without_verification: true
registration_shared_secret: "dev-secret-thirty-two-chars!!"
report_stats: false
EOF
```

### 2) Set environment variables

```bash
export POSTGRES_PASSWORD=dev-password-please-change-me
export REDIS_PASSWORD=dev-redis-please-change-me
```

### 3) Start the stack

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 4) Verify

```bash
curl -s http://localhost:8008/_matrix/client/versions | head -c 200
```

The homeserver is now running at `http://localhost:8008`. To use the Blackout
client, see the [web](#building-the-client) section below.

---

## Minimal Production: continuwuity (Rust)

The Rust homeserver ships as a single binary with an embedded RocksDB database.
No external PostgreSQL or Redis is required — useful for resource-constrained
hosts or simplified operations. Build from the `continuwuity-fork/` directory
or use a pre-built Docker image.

### Docker (one command)

Set these env vars, then launch:

```bash
export CONTINUWUITY_SERVER_NAME="example.com"
export CONTINUWUITY_PORT="8008"
export CONTINUWUITY_WELL_KNOWN_CLIENT="https://matrix.example.com"
export CONTINUWUITY_WELL_KNOWN_SERVER="matrix.example.com:443"

docker run -d \
  --name continuwuity \
  -p 8008:8008 \
  -v ./data:/var/lib/conduwuit \
  -e CONTINUWUITY_SERVER_NAME \
  -e CONTINUWUITY_PORT \
  -e CONTINUWUITY_WELL_KNOWN \
  ghcr.io/girlbossceo/conduwuit:v0.4.7
```

### Build from source

```bash
cd continuwuity-fork
# Build the release binary
docker build -f docker/Dockerfile -t continuwuity:local .
```

Place a reverse proxy (nginx, Caddy, or Traefik) in front of port 8008 for
TLS termination. Example compose files with Caddy and Traefik are in
`continuwuity-fork/docs/public/deploying/`.

Key config options are documented in
[`conduwuit-example.toml`](../continuwuity-fork/conduwuit-example.toml).
For federation setup, see [FEDERATION.md](FEDERATION.md).

---

## Full Production: Single-Server Stack

This is the canonical production deployment. The entire stack lives in
[`infra/single-server-baseline/`](../infra/single-server-baseline/) and includes:

| Service       | Role                                     |
|---------------|------------------------------------------|
| nginx         | TLS termination, routing, rate limiting  |
| certbot       | Let's Encrypt certificate automation     |
| frontend      | Blackout web client SPA                  |
| api           | Hono-based Blackout API                  |
| synapse       | Matrix homeserver (Python)               |
| postgres      | Primary database (PostGIS-enabled)       |
| redis         | Cache and pub/sub                        |
| coturn        | TURN/STUN for voice/video relay          |
| clickhouse    | OLAP analytics database                  |
| cube          | Semantic layer (ClickHouse → Metabase)   |
| metabase      | BI dashboards                            |
| martin        | Map tile server                          |
| perturbation  | Traffic-bounding sidecar                 |

### 1) Clone and copy the baseline

```bash
git clone https://github.com/Blackmarket-coa/blackout.git
cp -r blackout/infra/single-server-baseline /opt/blackout
cd /opt/blackout
```

### 2) Create your `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env` and set at minimum:

```dotenv
PRIMARY_DOMAIN="example.com"
LETSENCRYPT_EMAIL="you@example.com"
POSTGRES_DB="synapse"
POSTGRES_USER="synapse"
POSTGRES_PASSWORD="generate-a-strong-password"
REDIS_PASSWORD="generate-another-strong-password"
SYNAPSE_REGISTRATION_SHARED_SECRET="generate-secret-string"
SYNAPSE_MACAROON_SECRET_KEY="generate-secret-string"
SYNAPSE_FORM_SECRET="generate-secret-string"
TURN_STATIC_AUTH_SECRET="generate-secret-string"
TURN_EXTERNAL_IP="198.51.100.1"
FRONTEND_TAG="latest"
API_TAG="latest"
```

### 3) Render config templates

```bash
export $(grep -v '^#' .env | xargs)
envsubst < synapse/homeserver.yaml.template > synapse/homeserver.yaml
envsubst < coturn/turnserver.conf.template > coturn/turnserver.conf
```

### 4) Bootstrap TLS

Start only the reverse proxy, then issue certificates:

```bash
docker compose up -d reverse-proxy
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "${LETSENCRYPT_EMAIL}" \
  --agree-tos --no-eff-email \
  -d "${PRIMARY_DOMAIN}" \
  -d "matrix.${PRIMARY_DOMAIN}" \
  -d "api.${PRIMARY_DOMAIN}" \
  -d "chat.${PRIMARY_DOMAIN}" \
  -d "turn.${PRIMARY_DOMAIN}"
```

### 5) Start the full stack

```bash
docker compose up -d
```

### 6) Verify

```bash
curl -s https://${PRIMARY_DOMAIN}/.well-known/matrix/server
curl -s https://matrix.${PRIMARY_DOMAIN}/_matrix/federation/v1/version
docker compose ps
```

For the full operations guide — backups, rollback, disaster recovery, monitoring,
and alerting — see the [single-server RUNBOOK](../infra/single-server-baseline/RUNBOOK.md).

---

## Building the client

Once the backend is up, build and serve the Blackout web client:

```bash
# From the repo root
pnpm install
cp config.sample.json config.json
# Edit config.json to point "default_server_config" at your homeserver
pnpm web:build
```

The build output is in `apps/blackout-client/dist/`. In the single-server stack,
this is built into a Docker image and served by nginx directly.

---

## Post-deploy checklist

- [ ] **Create admin user**
  ```bash
  docker compose exec synapse register_new_matrix_user \
    -u admin -p '<password>' -a -c /data/homeserver.yaml \
    http://localhost:8008
  ```

- [ ] **Verify federation**
  Visit [federationtester.matrix.org](https://federationtester.matrix.org) and
  enter your server name. Confirm well-known delegation, port reachability, and
  signing key publication.

  See [FEDERATION.md](FEDERATION.md) for manual checks and troubleshooting.

- [ ] **Configure registration posture**
  In `.env`, set:
  ```dotenv
  SYNAPSE_ENABLE_REGISTRATION=true
  SYNAPSE_ENABLE_REGISTRATION_WITHOUT_VERIFICATION=false
  SYNAPSE_REGISTRATION_REQUIRES_TOKEN=false
  ```
  Then re-render `homeserver.yaml` and restart Synapse. See
  [`synapse/ENABLE_REGISTRATION.md`](../infra/single-server-baseline/synapse/ENABLE_REGISTRATION.md)
  for all registration modes.

- [ ] **Verify TURN**
  Test voice/video relay by starting a call between two users. Check coturn
  metrics at `curl -s http://localhost:9641/metrics`.

- [ ] **Enable backups**
  ```bash
  sudo cp systemd/blackout-backup.service systemd/blackout-backup.timer /etc/systemd/system/
  sudo systemctl enable --now blackout-backup.timer
  ```
  This runs `backup/backup.sh` every 6 hours, retaining 14 days of Postgres
  dumps and Synapse volume archives.

- [ ] **Enable certbot auto-renewal**
  ```bash
  sudo cp systemd/blackout-certbot-renew.service systemd/blackout-certbot-renew.timer /etc/systemd/system/
  sudo systemctl enable --now blackout-certbot-renew.timer
  ```

- [ ] **Create your first room**
  Log in to your Blackout client and create a room. Invite a user on another
  Matrix homeserver (e.g. `@username:matrix.org`) to confirm federation is
  working end-to-end.

---

## Alternative Stacks

### Backend microservices stack

For deployments that need integration bridges (Discord, Telegram, Signal,
WhatsApp, Slack), push notifications (Sygnal), delegated auth (MAS/OIDC), or
LiveKit-based voice/video, use the backend microservices stack documented in
[`deploy/docker/blackout-backend/README.md`](../deploy/docker/blackout-backend/README.md).
This stack profiles in 26 services and is more complex to operate.

### Fedora + Tauri

For self-hosting on Fedora with native Tauri desktop and mobile clients, see
[`docs/deploying-blackout-fedora-tauri.md`](deploying-blackout-fedora-tauri.md).

### Cloud / managed hosting

A deployment matrix comparing cloud providers, self-hosted bare-metal, and
packaging options is in
[`docs/operations/deployment_matrix_cloud_selfhost.md`](operations/deployment_matrix_cloud_selfhost.md).

---

## Further reading

- **[FEDERATION.md](FEDERATION.md)** — Server discovery, well-known endpoints, DNS, firewall
- **[RUNBOOK.md](../infra/single-server-baseline/RUNBOOK.md)** — Day-2 operations, rollback, disaster recovery
- **[SECURITY.md](SECURITY.md)** — Vulnerability reporting
- **[THREAT_MODEL.md](THREAT_MODEL.md)** — Adversary model and trust boundaries
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** — How to contribute back
