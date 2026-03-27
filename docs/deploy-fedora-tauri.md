# Deploying Blackout on Fedora with Tauri Desktop & Mobile Clients

This guide covers how to build Blackout Tauri clients locally in VS Code, deploy the
backend stack to a Fedora server, and connect everything together. All services are
free and open-source; the only costs are a server and a domain name.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Local Setup](#2-prerequisites--local-setup)
3. [Configure the Server Environment](#3-configure-the-server-environment)
4. [Configure the Client](#4-configure-the-client)
5. [Build the Tauri Desktop App](#5-build-the-tauri-desktop-app)
6. [Build Tauri Mobile Apps](#6-build-tauri-mobile-apps)
7. [Deploy the Backend to Fedora](#7-deploy-the-backend-to-fedora)
8. [Serve the Web Frontend](#8-serve-the-web-frontend)
9. [How the Tauri Client Connects to the Server](#9-how-the-tauri-client-connects-to-the-server)
10. [Operations & Maintenance](#10-operations--maintenance)

---

## 1. Architecture Overview

```
+--------------------+      HTTPS       +----------------------------------+
| Tauri Desktop App  | ----------------> |          Fedora Server           |
| (or Mobile App)    |                  |                                  |
|                    |                  |  nginx :443                      |
| WebView loads the  |                  |    +-- /_matrix/*  -> synapse    |
| Blackout web       |                  |    +-- /livekit/jwt -> lk-jwt   |
| frontend, which    |                  |    +-- /livekit/sfu -> livekit  |
| talks to Synapse   |                  |    +-- /.well-known -> static   |
+--------------------+                  |                                  |
                                        |  synapse -> postgres :5432       |
+--------------------+      HTTPS       |          -> redis :6379          |
| Web Browser        | ----------------> |                                  |
| (blackout-web)     |                  |  livekit :7880  (WebSocket)      |
+--------------------+                  |  livekit :50100-50200 (UDP/RTC)  |
                                        +----------------------------------+
```

**Backend services** (all containerised via Docker Compose):

| Service | Image | Role |
|---------|-------|------|
| synapse | `matrixdotorg/synapse` | Matrix homeserver |
| postgres | `postgres:16-alpine` | Synapse database |
| redis | `redis:7-alpine` | Cache / session store |
| livekit | `livekit/livekit-server` | WebRTC SFU for voice/video |
| lk-jwt-service | `element-hq/lk-jwt-service` | MatrixRTC auth bridge |
| draupnir | `draupnir-project/draupnir` | Moderation bot |
| nginx | `nginx:1.27-alpine` | Reverse proxy + TLS termination |
| certbot | `certbot/certbot` | Let's Encrypt auto-renewal |

---

## 2. Prerequisites & Local Setup

### System requirements (laptop / dev machine)

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 22.11 | [nodejs.org](https://nodejs.org) or `dnf install nodejs` |
| pnpm | 9.15.4 | `corepack enable && corepack prepare pnpm@9.15.4 --activate` |
| Rust | >= 1.77 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Tauri CLI | >= 2.1.0 | Installed as a devDependency in `blackout-desktop/package.json` |

### Tauri system dependencies

**Fedora / RHEL:**

```bash
sudo dnf install -y \
  webkit2gtk4.1-devel \
  openssl-devel \
  curl wget file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  gtk3-devel \
  pango-devel \
  glib2-devel \
  atk-devel \
  gdk-pixbuf2-devel
```

**Ubuntu / Debian:**

```bash
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libgtk-3-dev
```

**macOS:** Xcode Command Line Tools (`xcode-select --install`) + Rust.

**Windows:** Visual Studio Build Tools (C++ workload) + Rust + WebView2 runtime.

### Clone and install

```bash
git clone https://github.com/blackmarket-coa/blackout.git
cd blackout
pnpm install
```

### Recommended VS Code extensions

- **Tauri** (`tauri-apps.tauri-vscode`) — run/debug Tauri apps
- **rust-analyzer** (`rust-lang.rust-analyzer`) — Rust language support
- **Even Better TOML** (`tamasfe.even-better-toml`) — Cargo.toml editing
- **ESLint** (`dbaeumer.vscode-eslint`)

---

## 3. Configure the Server Environment

All server configuration lives in `deploy/docker/blackout-backend/`. You can edit
these files locally in VS Code and upload them to the server later.

### 3.1 Create the `.env` file

```bash
cp deploy/docker/blackout-backend/.env.example deploy/docker/blackout-backend/.env
```

Open `.env` and fill in your values. Generate secrets with:

```bash
openssl rand -hex 32
```

### 3.2 Environment variables reference

| Variable | What it does | Example |
|----------|-------------|---------|
| `SERVER_NAME` | Your public domain (nginx, certbot) | `blackout.yourdomain.com` |
| `MATRIX_SERVER_NAME` | Matrix federation domain | `blackout.yourdomain.com` |
| `MATRIX_HOMESERVER_URL` | Full URL to your homeserver | `https://blackout.yourdomain.com` |
| `MATRIX_WELL_KNOWN_CLIENT_URL` | URL for `.well-known` discovery | `https://blackout.yourdomain.com` |
| `POSTGRES_DB` | Synapse database name | `synapse` |
| `POSTGRES_USER` | Synapse database user | `synapse` |
| `POSTGRES_PASSWORD` | Database password | (generate) |
| `REDIS_PASSWORD` | Redis auth password | (generate) |
| `SYNAPSE_REPORT_STATS` | Report anonymous stats to matrix.org | `no` |
| `SYNAPSE_ENABLE_REGISTRATION` | Allow public sign-up | `false` |
| `SYNAPSE_REGISTRATION_SHARED_SECRET` | Shared secret for admin user creation | (generate) |
| `SYNAPSE_MACAROON_SECRET_KEY` | Macaroon signing key | (generate) |
| `SYNAPSE_FORM_SECRET` | Form CSRF secret | (generate) |
| `LIVEKIT_WS_PORT` | LiveKit WebSocket port | `7880` |
| `LIVEKIT_TCP_PORT` | LiveKit TCP fallback port | `7881` |
| `LIVEKIT_RTC_UDP_START` | WebRTC media UDP range start | `50100` |
| `LIVEKIT_RTC_UDP_END` | WebRTC media UDP range end | `50200` |
| `LIVEKIT_API_KEY` | LiveKit API key | `devkey` (change for prod) |
| `LIVEKIT_API_SECRET` | LiveKit API secret | (generate) |
| `LIVEKIT_INTERNAL_URL` | Internal LiveKit URL (container network) | `ws://livekit:7880` |
| `LK_JWT_SIGNING_KEY` | JWT signing key for MatrixRTC bridge | (generate) |
| `LK_JWT_TRUSTED_HOSTS` | Trusted host for JWT validation | `blackout.yourdomain.com` |
| `DRAUPNIR_ACCESS_TOKEN` | Moderation bot access token | (create after Synapse is running) |
| `DRAUPNIR_MANAGEMENT_ROOM` | Room ID for moderation commands | `!roomid:yourdomain.com` |
| `DRAUPNIR_PANTALAIMON_USE` | Use Pantalaimon E2EE proxy | `false` |
| `CERTBOT_EMAIL` | Email for Let's Encrypt notifications | `admin@yourdomain.com` |

---

## 4. Configure the Client

### 4.1 Create `config.json`

```bash
cp config.sample.json config.json
```

Edit `config.json` to point at your server:

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
    "default_theme": "light",
    "element_call": {
        "url": "https://blackout.yourdomain.com/livekit/sfu",
        "brand": "Blackout Calls"
    },
    "jitsi": {
        "preferred_domain": "meet.jit.si"
    },
    "security": {
        "hardened_mode": true,
        "steganography": {
            "enabled": false,
            "mode": "image-lsb",
            "require_verification": true
        }
    }
}
```

### 4.2 How config resolution works

The web app (`apps/blackout-web/src/config.ts`) resolves the homeserver URL in this
order:

1. `VITE_MATRIX_HOMESERVER_URL` environment variable (build-time)
2. `BLACKOUT_SERVER_URL` environment variable (build-time fallback)
3. `config.json` in the build output directory (runtime)
4. Falls back to `https://matrix.blackout.local`

For Tauri builds, the `config.json` approach is the simplest: the file gets copied into
`apps/blackout-web/dist/` during the build and is loaded at runtime by the WebView.

---

## 5. Build the Tauri Desktop App

### 5.1 How it works

The Tauri build process is defined in `blackout-desktop/package.json`:

```json
{
  "scripts": {
    "dev": "pnpm icons:generate && tauri dev",
    "build": "pnpm icons:generate && tauri build"
  }
}
```

`tauri.conf.json` tells Tauri to build the web frontend first:

```json
{
  "build": {
    "beforeBuildCommand": "cd ../.. && pnpm --filter @blackout/blackout-web build:web",
    "frontendDist": "../../apps/blackout-web/dist"
  }
}
```

So a single `pnpm build` in `blackout-desktop/`:
1. Generates icons from `src-tauri/icons/blackout.svg`
2. Builds the Blackout web frontend into `apps/blackout-web/dist/`
3. Compiles the Rust wrapper (`src-tauri/src/main.rs`)
4. Bundles everything into native installers

### 5.2 Development mode

```bash
# From the project root
cd blackout-desktop
pnpm dev
```

This starts the Vite dev server on `http://localhost:5173` and opens the Tauri window
pointing at it. Hot-reload works for the web frontend.

### 5.3 Production build

```bash
# Make sure config.json is in place first
cp config.json apps/blackout-web/public/config.json

# Build
cd blackout-desktop
pnpm build
```

### 5.4 Build output

Artifacts appear in `blackout-desktop/src-tauri/target/release/bundle/`:

| Platform | File | Location |
|----------|------|----------|
| Fedora/RHEL | `.rpm` | `bundle/rpm/blackout-0.1.0-1.x86_64.rpm` |
| Debian/Ubuntu | `.deb` | `bundle/deb/blackout_0.1.0_amd64.deb` |
| Universal Linux | `.AppImage` | `bundle/appimage/blackout_0.1.0_amd64.AppImage` |
| macOS | `.dmg` | `bundle/dmg/Blackout_0.1.0_aarch64.dmg` |
| Windows | `.msi` | `bundle/msi/Blackout_0.1.0_x64_en-US.msi` |
| Windows | `.exe` (NSIS) | `bundle/nsis/Blackout_0.1.0_x64-setup.exe` |

### 5.5 Desktop features (built-in)

The Tauri wrapper (`src-tauri/src/main.rs`) provides:

- **System tray** with show/hide/quit menu
- **Unread badge count** on tray icon tooltip
- **Native notifications** via `tauri-plugin-notification`
- **Global shortcut** `Super+Shift+B` to toggle window
- **Minimize to tray** on close (configurable)
- **Single instance** enforcement
- **Auto-start** on login (macOS LaunchAgent)
- **Deep linking** for `matrix://` URLs
- **Auto-updater** checking GitHub releases

### 5.6 Auto-updater setup (optional)

Generate a signing keypair:

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/blackout.key
```

Set the public key in `blackout-desktop/src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://your-update-server.com/releases/latest.json"
      ],
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

When building release artifacts, set the `TAURI_SIGNING_PRIVATE_KEY` environment
variable to the contents of your private key file.

---

## 6. Build Tauri Mobile Apps

Tauri 2.x supports Android and iOS targets.

### 6.1 Android

**Prerequisites:**
- Android Studio with SDK and NDK installed
- `ANDROID_HOME` and `NDK_HOME` environment variables set
- Rust Android targets: `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`

```bash
cd blackout-desktop
pnpm tauri android init    # one-time setup, creates android/ project
pnpm tauri android dev     # run on emulator or connected device
pnpm tauri android build   # produce release APK/AAB
```

### 6.2 iOS

**Prerequisites:**
- macOS with Xcode installed
- Rust iOS targets: `rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim`

```bash
cd blackout-desktop
pnpm tauri ios init    # one-time setup, creates ios/ project
pnpm tauri ios dev     # run on simulator
pnpm tauri ios build   # produce release .ipa
```

### 6.3 Alternative: Capacitor mobile wrapper

The project also includes a Capacitor-based mobile wrapper at `blackout-mobile/`
(app ID `co.bmc.blackout`). This is a separate build path that wraps the same web
frontend with Capacitor plugins (camera, push notifications, haptics, etc.).

Use Tauri mobile if you want a single build system for desktop + mobile.
Use Capacitor if you need specific Capacitor plugins or prefer the Capacitor ecosystem.

---

## 7. Deploy the Backend to Fedora

### 7.1 Install Docker on Fedora

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# Log out and back in for group membership to take effect
```

### 7.2 Open firewall ports

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=7880/tcp    # LiveKit WebSocket
sudo firewall-cmd --permanent --add-port=7881/tcp    # LiveKit TCP fallback
sudo firewall-cmd --permanent --add-port=50100-50200/udp  # WebRTC media
sudo firewall-cmd --reload
```

### 7.3 SELinux (Fedora-specific)

Fedora enables SELinux by default. If you hit permission errors with Docker volumes:

```bash
sudo setsebool -P container_manage_cgroup on
```

Alternatively, add `:Z` to volume mounts in `docker-compose.yml` to auto-relabel:

```yaml
volumes:
  - ./nginx/nginx.conf:/etc/nginx/templates/nginx.conf.template:ro,Z
```

### 7.4 DNS

Create an A record pointing your domain to the server's public IP:

```
blackout.yourdomain.com  →  203.0.113.10
```

Wait for DNS propagation before requesting TLS certificates.

### 7.5 Upload files to server

From your laptop:

```bash
scp -r deploy/docker/blackout-backend/ user@your-server:/opt/blackout/
```

### 7.6 Generate Synapse signing key

On the server:

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

### 7.7 Obtain TLS certificate

```bash
# Start nginx so ACME challenge is reachable
docker compose up -d nginx

# Request certificate
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "${CERTBOT_EMAIL}" \
  --agree-tos --no-eff-email \
  -d "${SERVER_NAME}"
```

### 7.8 Start the full stack

```bash
docker compose up -d
```

### 7.9 Validate

```bash
# Matrix homeserver responds
curl -s https://blackout.yourdomain.com/_matrix/client/versions | head

# Well-known discovery works (clients use this to find your server)
curl -s https://blackout.yourdomain.com/.well-known/matrix/client | head

# LiveKit JWT service responds
curl -s https://blackout.yourdomain.com/livekit/jwt/ | head

# Federation delegation works
curl -s https://blackout.yourdomain.com/.well-known/matrix/server | head
```

### 7.10 Create your first user

```bash
docker exec -it blackout-synapse register_new_matrix_user \
  -u admin -p YOUR_PASSWORD -a \
  -c /data/homeserver.yaml \
  http://localhost:8008
```

---

## 8. Serve the Web Frontend

The Tauri desktop app bundles the web frontend and doesn't need a hosted web
version. However, if you also want browser access, you have two options.

### Option A: Docker image (recommended)

Build from the existing Dockerfile in the repo:

```bash
# On your laptop
docker build -f deploy/docker/Dockerfile -t blackout-web .

# Transfer to server
docker save blackout-web | ssh user@your-server 'docker load'

# Run on server
docker run -d --name blackout-web \
  -p 8080:80 \
  --restart unless-stopped \
  blackout-web
```

Then add a location block to your nginx config to proxy to it.

### Option B: Node.js server

The project includes a lightweight Node.js static file server (`index.js`) that
serves the built frontend with SPA fallback routing.

On the server:

```bash
# Install Node.js
sudo dnf install -y nodejs
npm install -g pnpm

# Clone and build
git clone https://github.com/blackmarket-coa/blackout.git /opt/blackout-web
cd /opt/blackout-web
pnpm install --frozen-lockfile
pnpm --filter @blackout/blackout-web build:web

# Copy your config into the build output
cp config.json apps/blackout-web/dist/config.json
```

Create a systemd service:

```ini
# /etc/systemd/system/blackout-web.service
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

```bash
sudo systemctl enable --now blackout-web
```

The server listens on port 3000 and exposes `/health` and `/ready` endpoints.

---

## 9. How the Tauri Client Connects to the Server

Understanding the connection flow:

1. **Build time**: `pnpm build` in `blackout-desktop/` triggers `beforeBuildCommand`
   which builds the web frontend into `apps/blackout-web/dist/`.

2. **Config baked in**: The `config.json` you placed in the web app's public
   directory gets included in the dist output. This file contains
   `m.homeserver.base_url` pointing to your Fedora server.

3. **Runtime**: When a user launches the Tauri app, it opens a native WebView that
   loads the bundled web frontend from disk (not from a server). The frontend
   reads `config.json`, discovers the homeserver URL, and connects to your
   Fedora server over HTTPS.

4. **Matrix protocol**: All communication flows through the Matrix client-server API
   at `https://blackout.yourdomain.com/_matrix/`. Voice/video calls use LiveKit
   via the `/livekit/sfu/` WebSocket endpoint.

5. **Well-known discovery**: The client can also discover the server via
   `/.well-known/matrix/client`, which returns the homeserver URL and LiveKit
   RTC foci endpoints.

```
Tauri App (native window)
  └── WebView
       └── Blackout Web Frontend (loaded from disk)
            └── reads config.json
                 └── connects to https://blackout.yourdomain.com
                      ├── /_matrix/*         → Synapse (chat, auth, sync)
                      ├── /livekit/sfu/*     → LiveKit (voice/video WebRTC)
                      └── /livekit/jwt/*     → lk-jwt-service (call auth)
```

---

## 10. Operations & Maintenance

### Create additional users

```bash
docker exec -it blackout-synapse register_new_matrix_user \
  -u USERNAME -p PASSWORD \
  -c /data/homeserver.yaml \
  http://localhost:8008
```

Add `-a` flag to make them an admin.

### Backups

```bash
# PostgreSQL
docker exec blackout-postgres pg_dump -U synapse synapse > synapse_backup.sql

# Synapse media store
docker cp blackout-synapse:/data/media_store ./media_backup/

# Redis (trigger background save, then copy)
docker exec blackout-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
docker cp blackout-redis:/data/appendonly.aof ./redis_backup/
```

### TLS certificate renewal

The certbot container automatically renews certificates every 12 hours. No action
needed. If you need to force a renewal:

```bash
docker compose exec certbot certbot renew --force-renewal
docker compose restart nginx
```

### Updating services

```bash
cd /opt/blackout
docker compose pull      # Pull latest images
docker compose up -d     # Recreate containers with new images
```

### Monitoring

```bash
docker compose ps                    # Service status
docker compose logs -f synapse       # Follow Synapse logs
docker compose logs -f nginx         # Follow nginx access/error logs
docker compose logs -f livekit       # Follow LiveKit logs
```

### Updating the Tauri desktop app

1. Make changes locally in VS Code
2. Bump the version in `blackout-desktop/src-tauri/tauri.conf.json`
3. Run `cd blackout-desktop && pnpm build`
4. Distribute the new installers to users
5. If auto-updater is configured, upload artifacts and `latest.json` to your
   update endpoint

---

## Quick Reference: Port Map

| Port | Protocol | Service | Purpose |
|------|----------|---------|---------|
| 80 | TCP | nginx | HTTP (redirects to 443) |
| 443 | TCP | nginx | HTTPS (TLS termination) |
| 7880 | TCP | LiveKit | WebSocket signaling |
| 7881 | TCP | LiveKit | TCP fallback for WebRTC |
| 50100-50200 | UDP | LiveKit | WebRTC media streams |
| 8008 | TCP | Synapse | Matrix API (internal only, behind nginx) |
| 8080 | TCP | lk-jwt-service | MatrixRTC JWT (internal only) |
| 6379 | TCP | Redis | Cache (internal only) |
| 5432 | TCP | PostgreSQL | Database (internal only) |
