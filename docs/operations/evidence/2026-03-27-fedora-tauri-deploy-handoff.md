# Fedora Tauri Deploy Handoff Evidence — 2026-03-27

## Domain + DNS Status (placeholders)
- Domain: `<MY_DOMAIN>`
- Matrix server name (federation): `<MATRIX_SERVER_NAME>`
- Public A/AAAA records:
  - `<MY_DOMAIN> -> TODO`
  - `<MATRIX_SERVER_NAME> -> TODO`
- Reverse proxy endpoint reachability:
  - `https://<MY_DOMAIN>/.well-known/matrix/client` -> TODO
  - `https://<MY_DOMAIN>/.well-known/matrix/server` -> TODO
  - `https://<MY_DOMAIN>/_matrix/client/versions` -> TODO
- DNS status: **PENDING** (server-side verification required)

## Completed local steps

### 1) Local deployment config bootstrap
Status: **BLOCKED (missing local secrets/config files in this workspace)**

Command:
```bash
test -f deploy/docker/blackout-backend/.env && echo ".env present"
```
Output:
```text
(no output)
```

Command:
```bash
test -f config.json && echo "config.json present"
```
Output:
```text
(no output)
```

Command:
```bash
rg -n "blackout\.yourdomain\.com|<generate-strong|<strong-" deploy/docker/blackout-backend/.env config.json
```
Output:
```text
rg: deploy/docker/blackout-backend/.env: No such file or directory (os error 2)
rg: config.json: No such file or directory (os error 2)
```

Command:
```bash
git check-ignore -v deploy/docker/blackout-backend/.env config.json
```
Output:
```text
.gitignore:28:.env\tdeploy/docker/blackout-backend/.env
.gitignore:19:/config.json\tconfig.json
```

Notes:
- `.env` and `config.json` are intentionally local and gitignored.
- This handoff cannot complete local deploy validation until those files are created on the target machine.

### 2) Docker Compose validation preflight
Status: **PARTIAL / FAILED in this environment**

Command:
```bash
cd deploy/docker/blackout-backend && docker compose config
```
Output:
```text
/bin/bash: line 1: docker: command not found
```

Notes:
- Docker CLI is unavailable in this execution environment.
- Perform compose validation on the Fedora deployment host.

### 3) Web frontend build
Status: **COMPLETED**

Command:
```bash
pnpm install --frozen-lockfile
```
Output:
```text
Scope: all 14 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 3s
```

Command:
```bash
pnpm --filter @blackout/blackout-web build:web
```
Output:
```text
vite v7.3.1 building client environment for production...
✓ built in 982ms
```

Command:
```bash
test -d apps/blackout-web/dist && echo "dist exists"
```
Output:
```text
dist exists
```

Command:
```bash
cp --update=none config.json apps/blackout-web/dist/config.json || true
```
Output:
```text
cp: cannot stat 'config.json': No such file or directory
```

### 4) Tauri production build
Status: **FAILED (system dependency)**

Command:
```bash
cd blackout-desktop && pnpm tauri build
```
Output:
```text
error: failed to run custom build command for `glib-sys v0.18.1`
The system library `glib-2.0` required by crate `glib-sys` was not found.
The file `glib-2.0.pc` needs to be installed and the PKG_CONFIG_PATH environment variable must contain its parent directory.
```

Command:
```bash
find blackout-desktop/src-tauri/target/release/bundle -maxdepth 3 -type f | head -n 20
```
Output:
```text
find: ‘blackout-desktop/src-tauri/target/release/bundle’: No such file or directory
```

Classification:
- Build failure is **dependency/system-package related**, not a repository code regression.

## Pending server-only steps

### A) Provision deployment-local files first
Status: **PENDING (prerequisite)**
- Create `deploy/docker/blackout-backend/.env` on the Fedora host.
- Create root `config.json` on the Fedora host (or place equivalent runtime config where deployment expects it).
- Populate production values for domain, secrets, and service credentials.

### B) Firewall + ports
Status: **PENDING**
- Open inbound TCP: `80`, `443`
- Open inbound UDP range for LiveKit RTP: `${LIVEKIT_RTC_UDP_START}-${LIVEKIT_RTC_UDP_END}`
- Restrict management ports as needed (SSH, monitoring)

Commands (Fedora examples):
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=50100-50200/udp
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

### C) Certbot issuance/renewal
Status: **PENDING**
- Ensure DNS already points to server before issuance.
- Ensure nginx challenge path serves `/.well-known/acme-challenge/`.

Commands:
```bash
sudo docker compose -f deploy/docker/blackout-backend/docker-compose.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d <MY_DOMAIN> --email <ADMIN_EMAIL> --agree-tos --no-eff-email
```

### D) Compose deployment up
Status: **PENDING**

Commands:
```bash
cd deploy/docker/blackout-backend
sudo docker compose config
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs -f --tail=200 nginx synapse livekit lk-jwt-service
```

### E) First admin user bootstrap
Status: **PENDING**

Commands:
```bash
sudo docker compose exec synapse register_new_matrix_user \
  -c /data/homeserver.yaml \
  http://localhost:8008
```

## Sign-off checklist
- [ ] Deployment-local `.env` and `config.json` created on Fedora host
- [ ] DNS propagated for `<MY_DOMAIN>` and `<MATRIX_SERVER_NAME>`
- [ ] TLS certificates issued and mounted
- [ ] All compose services healthy
- [ ] Federation test passed from external network
- [ ] First admin user created and secured
- [ ] Secret placeholders replaced with production secrets
