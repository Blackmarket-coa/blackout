# Blackout backend (Docker Compose) with MatrixRTC voice/video

This stack provisions a full backend for Blackout with Matrix + LiveKit calling support.

## Services included

1. `synapse` (`ghcr.io/element-hq/synapse:v1.130.0`) – Matrix homeserver
2. `postgres` (`postgres`) – Synapse DB
3. `redis` (`redis`) – cache/session store
4. `livekit` (`livekit/livekit-server`) – SFU for voice/video
5. `lk-jwt-service` (`ghcr.io/element-hq/lk-jwt-service`) – MatrixRTC auth bridge
6. `draupnir` (`the-draupnir-project/draupnir`) – moderation bot
7. `nginx` (`nginx`) – reverse proxy + `.well-known`
8. `certbot` (`certbot/certbot`) – Let's Encrypt renewal
9. `mas` (`ghcr.io/element-hq/matrix-authentication-service`) – Matrix Authentication Service for MSC3861 delegated auth

## Files

- `docker-compose.yml`
- `nginx/nginx.conf`
- `synapse/homeserver.yaml.template`
- `mas/config.yaml.template`
- `livekit/config.yaml`
- `.env.example`
- `well-known/matrix/client`
- `well-known/matrix/server`

## 1) Configure environment

```bash
cp .env.example .env
# then edit .env values (passwords, secrets, tokens, and domain)
```

Default domain is `blackout.coop`.

## Auth modes

This deployment supports two explicit authentication modes.

### Mode A: Local Synapse auth

Use Synapse's local username/password authentication and registration.

Recommended `.env` values:

```dotenv
SYNAPSE_AUTH_MODE=local
SYNAPSE_PASSWORD_AUTH_ENABLED=true
SYNAPSE_MSC3861_ENABLED=false
```

In this mode:

- `/_matrix/*` traffic is handled by Synapse (except MAS compatibility routes, which are inert unless MSC3861 is enabled).
- Users authenticate directly with Synapse local auth.

### Mode B: MAS-delegated auth (MSC3861/OIDC delegation)

Use Matrix Authentication Service as the auth layer and delegate auth from Synapse.

Recommended `.env` values:

```dotenv
SYNAPSE_AUTH_MODE=mas
SYNAPSE_PASSWORD_AUTH_ENABLED=false
SYNAPSE_MSC3861_ENABLED=true
```

Also populate all `MAS_*` and `SYNAPSE_MSC3861_*` variables in `.env`:

- MAS issuer/public URLs
- Synapse-as-client ID/secret/auth method
- Synapse ↔ MAS admin token/secret
- MAS signing/encryption keys
- Optional upstream OIDC provider client details and callback URL

## 2) Prepare Synapse config and keys

Generate initial config and signing key once:

```bash
docker run --rm -it \
  -v "$(pwd)/synapse:/templates" \
  -v synapse_data:/data \
  -e SYNAPSE_SERVER_NAME="${MATRIX_SERVER_NAME}" \
  -e SYNAPSE_REPORT_STATS=no \
  ghcr.io/element-hq/synapse:v1.130.0 generate
```

Then keep using `synapse/homeserver.yaml.template` as the source template for runtime config generation.

## 3) Issue first TLS certificate

Bring up nginx first so ACME challenge endpoint is reachable:

```bash
docker compose up -d nginx
```

Request certificate:

```bash
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email "${CERTBOT_EMAIL}" \
  --agree-tos --no-eff-email \
  -d "${SERVER_NAME}"
```

## 4) Start entire stack

```bash
docker compose up -d
```

## 5) Validate routing

- `https://<domain>/_matrix/client/versions` → Synapse
- `https://<domain>/_matrix/client/v3/login` → MAS compatibility layer (when MAS mode is enabled)
- `https://<domain>/.well-known/openid-configuration` → MAS discovery
- `https://<domain>/_oauth/` → MAS OAuth endpoints
- `https://<domain>/account/` → MAS account management UI
- `https://<domain>/livekit/jwt/` → lk-jwt-service
- `https://<domain>/livekit/sfu/` → LiveKit websocket endpoint
- `https://<domain>/.well-known/matrix/client` → Matrix client discovery + `rtc_foci`
- `https://<domain>/.well-known/matrix/server` → federation delegation

## Networking / ports

Expose and forward:

- `80/tcp` and `443/tcp` for nginx
- `7880/tcp` (LiveKit websocket)
- `7881/tcp` (LiveKit TCP fallback)
- `50100-50200/udp` (LiveKit WebRTC media)

## Notes

- `matrix-org/synapse` was archived on April 26, 2024; this stack tracks the active upstream image namespace `element-hq/synapse` via pinned semver tags.
- `nginx` templates resolve domain variables from `.env` at container startup.
- `.well-known/matrix/client` includes both `org.matrix.msc4143.rtc_foci` and `rtc_foci` for compatibility.
- `certbot` container performs automated renewals every 12h.
- Draupnir requires a valid appservice/bot access token and management room ID.

## Migration: local auth → MAS delegated auth (safe cutover)

Use this sequence to minimize login disruption:

1. **Prepare MAS config and secrets while still in local mode**
   - Fill all `MAS_*` and `SYNAPSE_MSC3861_*` variables.
   - Keep:
     - `SYNAPSE_MSC3861_ENABLED=false`
     - `SYNAPSE_PASSWORD_AUTH_ENABLED=true`
2. **Bring MAS up and verify endpoints**
   - `docker compose up -d mas nginx`
   - Verify:
     - `/.well-known/openid-configuration`
     - `/_oauth/`
3. **Dry-run migration/import tooling (if migrating existing users/tokens)**
   - Use MAS `syn2mas check` and then `syn2mas migrate --dry-run` against your Synapse and MAS config.
4. **Schedule a maintenance window**
   - Pause new registrations/logins.
   - Back up Postgres and Synapse data volumes.
5. **Enable delegated auth in Synapse**
   - Set:
     - `SYNAPSE_MSC3861_ENABLED=true`
     - `SYNAPSE_PASSWORD_AUTH_ENABLED=false`
     - `SYNAPSE_AUTH_MODE=mas`
   - Restart:
     - `docker compose up -d synapse mas nginx`
6. **Post-cutover checks**
   - Test login, refresh, logout flows from a client.
   - Confirm Synapse client APIs and federation still work.
   - Keep backups until you are confident rollback is unnecessary.
