# Deploying Blackout on Fedora with Tauri Clients

This guide covers self-hosting the Blackout backend stack on a Fedora server and building native Tauri clients (desktop/mobile) from your laptop or CI.

## Architecture overview

Your deployment has two parts:

1. **Fedora server**: Synapse + PostgreSQL + Redis + LiveKit + nginx (+ certbot + Draupnir)
2. **Tauri clients**: native desktop/mobile wrappers that load the Blackout web bundle and connect to your homeserver

```text
Tauri/Desktop/Mobile/Web Browser
              │ HTTPS
              ▼
        nginx :443 (Fedora)
          ├─ /_matrix/*      -> synapse:8008
          ├─ /livekit/jwt     -> lk-jwt-service:8080
          ├─ /livekit/sfu     -> livekit:7880
          └─ /.well-known/*   -> static files

synapse -> postgres:5432 + redis:6379
livekit media -> UDP 50100-50200
```

## Files you will configure locally

- Backend deployment: `deploy/docker/blackout-backend/`
  - `docker-compose.yml`
  - `.env.example`
  - `nginx/nginx.conf`
  - `synapse/homeserver.yaml.template`
  - `livekit/config.yaml`
  - `well-known/matrix/client`
  - `well-known/matrix/server`
- Desktop wrapper: `blackout-desktop/src-tauri/`
  - `tauri.conf.json`
  - `Cargo.toml`
  - `src/main.rs`
- Client runtime config template: `config.sample.json`

## 1) Configure backend environment

```bash
cp deploy/docker/blackout-backend/.env.example deploy/docker/blackout-backend/.env
```

Set at least:

```dotenv
SERVER_NAME=blackout.yourdomain.com
MATRIX_SERVER_NAME=blackout.yourdomain.com
MATRIX_HOMESERVER_URL=https://blackout.yourdomain.com
MATRIX_WELL_KNOWN_CLIENT_URL=https://blackout.yourdomain.com

POSTGRES_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
SYNAPSE_REGISTRATION_SHARED_SECRET=<strong-secret>
SYNAPSE_MACAROON_SECRET_KEY=<strong-secret>
SYNAPSE_FORM_SECRET=<strong-secret>
LIVEKIT_API_SECRET=<strong-secret>
LK_JWT_SIGNING_KEY=<strong-secret>

CERTBOT_EMAIL=you@yourdomain.com
```

Generate secrets with:

```bash
openssl rand -hex 32
```

## 2) Configure web client runtime

Copy `config.sample.json` to `config.json`, then point it to your domain:

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

Keep the remaining keys from `config.sample.json` unless intentionally changing defaults.

## 3) Configure Tauri desktop wrapper

In `blackout-desktop/src-tauri/tauri.conf.json`, verify your `frontendDist` points to the built web assets.

For updater support:

```bash
pnpm tauri signer generate -w ~/.tauri/blackout.key
```

Then set `plugins.updater.pubkey` and host your update manifest (`latest.json`) at a reachable URL.

## 4) Prepare Fedora server

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Log out/in after group changes.

## 5) Open required firewall ports

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=7880/tcp
sudo firewall-cmd --permanent --add-port=7881/tcp
sudo firewall-cmd --permanent --add-port=50100-50200/udp
sudo firewall-cmd --reload
```

## 6) DNS

Create an `A` record for `blackout.yourdomain.com` to your Fedora server public IP. Wait for propagation before requesting TLS.

## 7) Upload backend directory

```bash
scp -r deploy/docker/blackout-backend/ user@your-server:/opt/blackout/
```

## 8) Generate Synapse signing key

On server:

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

## 9) Obtain TLS certificate

```bash
docker compose up -d nginx

docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "${CERTBOT_EMAIL}" \
  --agree-tos --no-eff-email \
  -d "${SERVER_NAME}"
```

## 10) Start full stack

```bash
docker compose up -d
```

Expected services:

| Service | Image | Purpose |
|---|---|---|
| postgres | postgres:16-alpine | Synapse DB |
| redis | redis:7-alpine | Cache/session |
| synapse | matrixdotorg/synapse | Matrix homeserver |
| livekit | livekit/livekit-server | Voice/video SFU |
| lk-jwt-service | element-hq/lk-jwt-service | MatrixRTC auth bridge |
| draupnir | draupnir-project/draupnir | Moderation bot |
| nginx | nginx:1.27-alpine | Reverse proxy + TLS |
| certbot | certbot/certbot | TLS renewal loop |

## 11) Validate deployment

```bash
curl https://blackout.yourdomain.com/_matrix/client/versions
curl https://blackout.yourdomain.com/.well-known/matrix/client
curl https://blackout.yourdomain.com/livekit/jwt/
curl -I https://blackout.yourdomain.com/livekit/sfu/
```

## 12) Create first admin user

```bash
docker exec -it blackout-synapse register_new_matrix_user \
  -u admin -p '<password>' -a \
  -c /data/homeserver.yaml \
  http://localhost:8008
```

## Serving the web frontend

### Option A (recommended): Container image

```bash
docker build -f deploy/docker/Dockerfile -t blackout-web .
docker save blackout-web | ssh user@server 'docker load'
```

Run this image behind nginx (or on another port + proxy).

### Option B: Node.js process

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

`index.js` serves `apps/blackout-web/dist` with SPA fallback plus `/health`.

## Build desktop clients (laptop/CI)

```bash
pnpm install
cd blackout-desktop
pnpm tauri build
```

Artifacts are in `blackout-desktop/src-tauri/target/release/bundle/` (`rpm`, `deb`, `appimage`, `dmg`, `msi`, `nsis`).

## Build mobile clients (optional)

Android:

```bash
cd blackout-desktop
pnpm tauri android init
pnpm tauri android build
```

iOS (macOS + Xcode):

```bash
cd blackout-desktop
pnpm tauri ios init
pnpm tauri ios build
```

## Fedora SELinux notes

If volume permission issues occur:

```bash
sudo setsebool -P container_manage_cgroup on
```

And/or apply Docker volume relabeling with `:Z` mounts in compose.

## Operations

Backups:

```bash
docker exec blackout-postgres pg_dump -U synapse synapse > backup.sql
docker cp blackout-synapse:/data/media_store ./media_backup/
docker exec blackout-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
```

Health/logs:

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


## AI prompts for steps that can be completed in this repo

The prompts below are scoped to tasks that can be done locally in this repository (no server SSH required).

### Prompt 1: Prepare deployment config files

```text
You are working in the Blackout repo. Create deployment-ready local config files without committing secrets.

Tasks:
1) Copy `deploy/docker/blackout-backend/.env.example` to `deploy/docker/blackout-backend/.env` if missing.
2) Copy `config.sample.json` to `config.json` if missing.
3) Replace all `blackout.yourdomain.com` placeholders with `<MY_DOMAIN>` in both files.
4) Print a checklist of required secret keys that still need real values.
5) Do not commit `.env`.

Validation commands to run:
- `test -f deploy/docker/blackout-backend/.env && echo ".env present"`
- `test -f config.json && echo "config.json present"`
- `rg -n "blackout\.yourdomain\.com|<generate-strong|<strong-" deploy/docker/blackout-backend/.env config.json`
```

### Prompt 2: Validate backend compose config before upload

```text
From the repo root, validate `deploy/docker/blackout-backend/docker-compose.yml` and referenced env defaults.

Tasks:
1) Run compose config rendering from `deploy/docker/blackout-backend/`.
2) Report missing variables, bad interpolation, or schema issues.
3) Summarize exposed ports/services from the rendered config.

Commands:
- `cd deploy/docker/blackout-backend && docker compose config`
- `cd deploy/docker/blackout-backend && docker compose config --services`
```

### Prompt 3: Verify Matrix well-known and nginx templates

```text
Audit the backend templates for domain/path consistency.

Tasks:
1) Inspect `deploy/docker/blackout-backend/nginx/nginx.conf` and `deploy/docker/blackout-backend/well-known/matrix/*`.
2) Confirm matrix endpoints (`/_matrix/`, `/.well-known/matrix/client`, `/.well-known/matrix/server`) align with `SERVER_NAME`/`MATRIX_SERVER_NAME` conventions.
3) Flag any hardcoded hostnames that should be templated via `.env`.
4) Provide a minimal patch if inconsistencies exist.

Validation command:
- `rg -n "matrix|well-known|server_name|blackout\.yourdomain\.com" deploy/docker/blackout-backend/nginx deploy/docker/blackout-backend/well-known`
```

### Prompt 4: Build web assets used by desktop/mobile wrappers

```text
Build the Blackout web frontend and verify dist artifacts expected by wrappers.

Tasks:
1) Install dependencies with lockfile.
2) Build `@blackout/blackout-web`.
3) Verify output directory contents and ensure `config.json` can be copied into the dist folder.

Commands:
- `pnpm install --frozen-lockfile`
- `pnpm --filter @blackout/blackout-web build:web`
- `test -d apps/blackout-web/dist && echo "dist exists"`
- `cp -n config.json apps/blackout-web/dist/config.json || true`
```

### Prompt 5: Build Tauri desktop binaries locally

```text
From this repo, perform a desktop preflight for Tauri and attempt a production build.

Tasks:
1) Check `blackout-desktop/src-tauri/tauri.conf.json` for updater/frontendDist values.
2) Run Tauri build from `blackout-desktop/`.
3) List generated installers under `src-tauri/target/release/bundle/`.
4) If build fails, classify whether dependency/system-package related vs project config related.

Commands:
- `cd blackout-desktop && pnpm tauri build`
- `find blackout-desktop/src-tauri/target/release/bundle -maxdepth 3 -type f | head -n 50`
```

### Prompt 6: Create a deployment handoff checklist artifact

```text
Generate `docs/operations/evidence/<DATE>-fedora-tauri-deploy-handoff.md` with:
- domain and DNS status placeholders
- completed local steps (config, compose validation, web build, tauri build)
- pending server-only steps (firewall, certbot, compose up, first admin user)
- exact commands and outputs (or TODO) for each check

Then run:
- `git status --short`
- `rg -n "TODO|PENDING|FAILED" docs/operations/evidence/<DATE>-fedora-tauri-deploy-handoff.md`
```

### What is intentionally excluded from AI-local prompts

These require server/network access or operator credentials and should be run directly by an admin on Fedora:

- Fedora package installation and firewall changes
- DNS record creation
- TLS certificate issuance via certbot against public domain
- Production `docker compose up -d` on the target host
- Synapse admin user creation on live infrastructure

## Quick checklist

- Configure `.env` and `config.json` locally
- Configure DNS
- Upload backend files to Fedora server
- Install Docker + open firewall
- Generate Synapse key + request TLS cert
- `docker compose up -d`
- Serve web frontend (container or Node)
- Build/distribute Tauri desktop/mobile clients
