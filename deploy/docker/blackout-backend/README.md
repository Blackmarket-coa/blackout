# Blackout backend (Docker Compose) with MatrixRTC voice/video

This stack provisions a full backend for Blackout with Matrix + LiveKit calling support.

Upstream dependency tracking and adoption decisions are documented in [`docs/matrix-upstreams.md`](../../../docs/matrix-upstreams.md) at the repository root.

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
10. `sygnal` (`matrixdotorg/sygnal`) – push gateway for APNs/FCM delivery
11. `matrix-hookshot` (`halfshot/matrix-hookshot`, optional `integrations` profile) – webhook/feed bridge
12. `hookshot-db` (`postgres`, optional `integrations` profile) – Hookshot persistence
13. `mautrix-discord` (`dock.mau.dev/mautrix/discord`, optional `integrations` profile) – Discord chat bridge
14. `mautrix-discord-db` (`postgres`, optional `integrations` profile) – Mautrix Discord persistence


## Version matrix (pinned images)

| Service | Current pinned version | Source repo URL | Last reviewed date | Upgrade cadence |
| --- | --- | --- | --- | --- |
| matrix-authentication-service | `ghcr.io/element-hq/matrix-authentication-service:v1.15.0` | https://github.com/element-hq/matrix-authentication-service | 2026-04-25 | Monthly |
| sygnal | `matrixdotorg/sygnal:v0.17.0` | https://github.com/matrix-org/sygnal | 2026-04-25 | Monthly |
| draupnir | `the-draupnir-project/draupnir:v3.0.0` | https://github.com/the-draupnir-project/Draupnir | 2026-04-25 | Monthly |
| matrix-hookshot | `halfshot/matrix-hookshot:7.3.2` | https://github.com/matrix-org/matrix-hookshot | 2026-04-25 | Monthly |
| livekit-server | `livekit/livekit-server:v1.11.0` | https://github.com/livekit/livekit | 2026-04-25 | Monthly |

## Files

- `docker-compose.yml`
- `nginx/nginx.conf`
- `synapse/homeserver.yaml.template`
- `mas/config.yaml.template`
- `livekit/config.yaml`
- `sygnal/sygnal.yaml`
- `.env.example`
- `integrations/README.md`
- `integrations/hookshot/config.yml.template`
- `integrations/hookshot/registration.yml.template`
- `integrations/mautrix-discord/config.yaml.template`
- `integrations/mautrix-discord/registration.yaml.template`
- `integrations/mautrix-discord/RUNBOOK.md`
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

## Push gateway (Sygnal) setup

Sygnal is included as an internal push gateway service and is reachable from Synapse at `${SYGNAL_URL}`.

### Provider configuration

1. Copy `.env.example` to `.env` and configure all `SYGNAL_*` values.
2. Enable providers you intend to use:
   - APNs: set `SYGNAL_APNS_ENABLED=true`, then provide Team ID, Key ID, Topic, and mount your `.p8` key via `SYGNAL_APNS_KEY_DIR` / `SYGNAL_APNS_KEYFILE`.
   - FCM: set `SYGNAL_FCM_ENABLED=true`, then set `SYGNAL_FCM_PROJECT_ID` and `SYGNAL_FCM_API_KEY`.
3. Ensure client pusher registration uses app IDs matching `SYGNAL_APNS_APP_ID` (iOS) and `SYGNAL_FCM_APP_ID` (Android).
4. Restart services after configuration changes:

```bash
docker compose up -d synapse sygnal
```

### Verification flow

1. **Push registration test**
   - From a Matrix client (or API), register a pusher with `kind: http` and `url: ${SYGNAL_PUBLIC_URL}`.
   - Verify via Synapse API that the pusher exists:

```bash
curl -s -H "Authorization: Bearer <ACCESS_TOKEN>" \
  https://<domain>/_matrix/client/v3/pushers | jq
```

2. **Event delivery check**
   - Send a message to the registered user while the device/app is backgrounded.
   - Confirm Synapse can reach Sygnal and receives a 2xx response:

```bash
docker compose logs --tail=200 synapse sygnal
```

3. **Expected logs**
   - Synapse: pusher activity logs indicating an outbound HTTP notify request to `sygnal`.
   - Sygnal: accepted notification requests and upstream provider responses (APNs/FCM success or detailed provider errors).
   - On provider auth issues, Sygnal logs include explicit credential or token errors; fix env values and restart `sygnal`.


## Integrations profile (optional): Matrix Hookshot

Enable the optional Compose profile when you want webhook/feed bridging:

```bash
docker compose --profile integrations up -d hookshot-db matrix-hookshot
```

Hookshot renders these files on startup:

- `integrations/hookshot/config.yml`
- `integrations/hookshot/registration.yml`

Mautrix Discord renders these files on startup:

- `integrations/mautrix-discord/config.yaml`
- `integrations/mautrix-discord/registration.yaml`

### Synapse appservice registration flow

1. Render registration by starting the Hookshot service once (command above).
2. Keep `app_service_config_files` in `synapse/homeserver.yaml.template` pointing to:
   - `/integrations/hookshot/registration.yml`
   - `/integrations/mautrix-discord/registration.yaml`
3. Restart Synapse so it loads the appservice registration:

```bash
docker compose up -d synapse
```

4. Validate bridge login/user provisioning from Synapse logs:

```bash
docker compose logs --tail=200 synapse matrix-hookshot
```

### Production operational notes

- **Rate limits:** keep Synapse registration/message limits enabled for appservices and constrain ingress/webhook sources at your reverse proxy/WAF.
- **Bot permissions:** scope Hookshot bot power levels to the minimum required rooms; avoid global admin for bridge bots.
- **Secret management:** move `HOOKSHOT_AS_TOKEN`, `HOOKSHOT_HS_TOKEN`, and DB credentials into Docker secrets/secret manager, then rotate on incident or personnel change.
- **Database durability:** back up `hookshot-db` (`hookshot_db_data`) with Synapse backups to preserve bridge state and delivery checkpoints.
