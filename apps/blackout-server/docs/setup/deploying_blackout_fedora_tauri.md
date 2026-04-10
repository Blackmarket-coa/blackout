# Deploying Blackout on Fedora with Tauri Clients

This guide describes how to deploy Blackout end-to-end, including:

- What to prepare locally in VS Code.
- What to run on a Fedora server.
- How to build and distribute Tauri desktop/mobile clients.

## Architecture overview

Blackout deployment has two distinct parts:

1. **Fedora server**: backend stack (Synapse, PostgreSQL, Redis, LiveKit, nginx) and web frontend serving.
2. **Tauri clients**: native desktop/mobile wrappers built locally (or in CI) that connect to your deployed server.

## 1) Local files to configure in VS Code

Primary deployment files:

```text
deploy/docker/blackout-backend/
├── docker-compose.yml
├── .env.example
├── nginx/nginx.conf
├── synapse/homeserver.yaml.template
├── livekit/config.yaml
└── well-known/matrix/{client,server}
```

Tauri desktop wrapper:

```text
blackout-desktop/src-tauri/
├── tauri.conf.json
├── Cargo.toml
└── src/main.rs
```

Client runtime config template:

```text
config.sample.json
```

### Step 1: Configure backend `.env`

```bash
cp deploy/docker/blackout-backend/.env.example deploy/docker/blackout-backend/.env
```

Edit `deploy/docker/blackout-backend/.env` with your domain and generated secrets:

```env
SERVER_NAME=blackout.yourdomain.com
MATRIX_SERVER_NAME=blackout.yourdomain.com
MATRIX_HOMESERVER_URL=https://blackout.yourdomain.com
MATRIX_WELL_KNOWN_CLIENT_URL=https://blackout.yourdomain.com

POSTGRES_PASSWORD=<generate-strong-password>
REDIS_PASSWORD=<generate-strong-password>
SYNAPSE_REGISTRATION_SHARED_SECRET=<generate-strong-secret>
SYNAPSE_MACAROON_SECRET_KEY=<generate-strong-secret>
SYNAPSE_FORM_SECRET=<generate-strong-secret>
LIVEKIT_API_SECRET=<generate-strong-secret>
LK_JWT_SIGNING_KEY=<generate-strong-secret>

CERTBOT_EMAIL=you@yourdomain.com
```

Generate secrets with:

```bash
openssl rand -hex 32
```

### Step 2: Configure client `config.json`

Copy and update your web client config:

```bash
cp config.sample.json config.json
```

Update the homeserver and identity URLs:

```json
{
  "default_server_config": {
    "m.homeserver": {
      "base_url": "https://blackout.yourdomain.com",
      "server_name": "blackout.yourdomain.com"
    },
    "m.identity_server": {
      "base_url": "https://blackout.yourdomain.com"
    }
  },
  "brand": "Blackout",
  "element_call": {
    "url": "https://blackout.yourdomain.com/livekit/sfu",
    "brand": "Blackout Calls"
  }
}
```

### Step 3: Verify Tauri configuration

Check `blackout-desktop/src-tauri/tauri.conf.json`:

- `frontendDist` points at your built web app.
- If using updater, set `plugins.updater.pubkey`.

Generate updater keys:

```bash
pnpm tauri signer generate -w ~/.tauri/blackout.key
```

## 2) Fedora server setup

### Step 4: Install Docker

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### Step 5: Open firewall ports

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=7880/tcp
sudo firewall-cmd --permanent --add-port=7881/tcp
sudo firewall-cmd --permanent --add-port=50100-50200/udp
sudo firewall-cmd --reload
```

### Step 6: Configure DNS

Create an A record for `blackout.yourdomain.com` to your server public IP.

### Step 7: Upload backend deployment directory

```bash
scp -r deploy/docker/blackout-backend/ user@your-server:/opt/blackout/
```

### Step 8: Generate Synapse signing key

```bash
cd /opt/blackout
set -a && source .env && set +a

docker run --rm \
  -v "$(pwd)/synapse:/templates" \
  -v synapse_data:/data \
  -e SYNAPSE_SERVER_NAME="${MATRIX_SERVER_NAME}" \
  -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate
```

### Step 9: Obtain TLS certificate

```bash
docker compose up -d nginx

docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "${CERTBOT_EMAIL}" \
  --agree-tos --no-eff-email \
  -d "${SERVER_NAME}"
```

### Step 10: Launch the full stack

```bash
docker compose up -d
```

Expected services:

- postgres
- redis
- synapse
- livekit
- lk-jwt-service
- draupnir
- nginx
- certbot

### Step 11: Validate endpoints

```bash
curl https://blackout.yourdomain.com/_matrix/client/versions
curl https://blackout.yourdomain.com/.well-known/matrix/client
curl https://blackout.yourdomain.com/livekit/jwt/
curl -I https://blackout.yourdomain.com/livekit/sfu/
```

### Step 12: Create first admin user

```bash
docker exec -it blackout-synapse register_new_matrix_user \
  -u admin -p <password> -a \
  -c /data/homeserver.yaml \
  http://localhost:8008
```

## 3) Serve the web frontend

### Option A (recommended): Docker image

```bash
docker build -f deploy/docker/Dockerfile -t blackout-web .
docker save blackout-web | ssh user@server 'docker load'
```

### Option B: Node.js server

```bash
sudo dnf install -y nodejs
npm install -g pnpm

git clone <your-repo> /opt/blackout-web
cd /opt/blackout-web
pnpm install --frozen-lockfile
pnpm --filter @blackout/blackout-web build:web
cp config.json apps/blackout-web/dist/config.json
PORT=3000 node index.js
```

Sample systemd unit:

```ini
[Unit]
Description=Blackout Web Frontend
After=network.target

[Service]
Type=simple
User=blackout
WorkingDirectory=/opt/blackout-web
ExecStart=/usr/bin/node index.js
Environment=PORT=3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 4) Build Tauri desktop clients

Run on laptop/CI (not the Fedora server).

```bash
pnpm install
cd blackout-desktop
pnpm tauri build
```

Artifacts appear in:

```text
blackout-desktop/src-tauri/target/release/bundle/
```

Typical outputs include `rpm`, `deb`, `appimage`, `dmg`, and `msi`.

## 5) Build Tauri mobile clients

### Android

```bash
cd blackout-desktop
pnpm tauri android init
pnpm tauri android build
```

### iOS (macOS + Xcode required)

```bash
cd blackout-desktop
pnpm tauri ios init
pnpm tauri ios build
```

## 6) Traffic flow

```text
Tauri/Web clients --HTTPS--> nginx (:443)
  /_matrix/*      -> synapse:8008
  /livekit/jwt    -> lk-jwt-service:8080
  /livekit/sfu    -> livekit:7880
  /.well-known/*  -> static files

synapse -> postgres:5432
synapse -> redis:6379
livekit media -> UDP 50100-50200
```

## 7) SELinux notes (Fedora)

If volume permission errors occur:

```bash
sudo setsebool -P container_manage_cgroup on
```

Or relabel bind mounts using `:Z` in `docker-compose.yml`.

## 8) Operations

Backups:

```bash
docker exec blackout-postgres pg_dump -U synapse synapse > backup.sql
docker cp blackout-synapse:/data/media_store ./media_backup/
docker exec blackout-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
```

Monitoring:

```bash
docker compose ps
docker compose logs -f synapse
docker compose logs -f nginx
```

Updates:

```bash
docker compose pull
docker compose up -d
```

## Quick checklist

1. Configure `.env` and `config.json` locally.
2. Set DNS A record.
3. Upload backend deployment files.
4. Install Docker + open firewall ports.
5. Generate Synapse key + issue TLS cert.
6. Run `docker compose up -d`.
7. Serve the web frontend.
8. Build/distribute Tauri installers from laptop/CI.
