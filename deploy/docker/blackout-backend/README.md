# Blackout backend (Docker Compose) with MatrixRTC voice/video

This stack provisions a full backend for Blackout with Matrix + LiveKit calling support.

Upstream dependency tracking and adoption decisions are documented in [`docs/matrix-upstreams.md`](../../../docs/matrix-upstreams.md) at the repository root.

## Services included

Default profile (always on):

1. `synapse` (`ghcr.io/element-hq/synapse:v1.130.0`) – Matrix homeserver
2. `postgres` (`postgres`) – Synapse DB
3. `redis` (`redis`) – cache/session store
4. `livekit` (`livekit/livekit-server`) – SFU for voice/video
5. `lk-jwt-service` (`ghcr.io/element-hq/lk-jwt-service`) – MatrixRTC auth bridge
6. `draupnir` (`the-draupnir-project/draupnir`) – moderation bot
7. `nginx` (`nginx`) – reverse proxy + `.well-known`
8. `certbot` (`certbot/certbot`) – Let's Encrypt renewal
9. `mas` (`ghcr.io/element-hq/matrix-authentication-service`) – delegated auth (MSC3861)
10. `sygnal` (`matrixdotorg/sygnal`) – push gateway for APNs/FCM delivery
11. `synapse-admin` (`ghcr.io/etkecc/synapse-admin`) – admin UI exposed at `/admin/`
12. `rageshake` (`ghcr.io/matrix-org/rageshake`) – debug-log/bug-report receiver consumed by blackout-client/desktop/mobile, exposed at `/rageshake/`

Optional `pantalaimon` profile (E2EE proxy used by Draupnir/Hookshot/Maubot):

13. `pantalaimon` (`matrixdotorg/pantalaimon`) – activated when `DRAUPNIR_PANTALAIMON_USE=true`

Optional `media-repo` profile (replaces Synapse media handling):

14. `mmr-db` (`postgres`) – matrix-media-repo persistence
15. `matrix-media-repo` (`ghcr.io/t2bot/matrix-media-repo`) – horizontally-scalable media server with quarantine and dedup; nginx routes `/_matrix/media`, `/_matrix/client/v1/media`, and `/_matrix/federation/v1/media` here

Optional `registration` profile:

16. `matrix-registration` (`devture/matrix-registration`) – token-gated invite registration UI exposed at `/register/`

Optional `integrations` profile:

17. `matrix-hookshot` + `hookshot-db` – webhook/feed bridge
18. `mautrix-discord` + `mautrix-discord-db` – Discord bridge
19. `mautrix-telegram` + `mautrix-telegram-db` – Telegram bridge
20. `mautrix-signal` + `mautrix-signal-db` – Signal bridge
21. `mautrix-whatsapp` + `mautrix-whatsapp-db` – WhatsApp bridge
22. `mautrix-slack` + `mautrix-slack-db` – Slack bridge
23. `mautrix-googlechat` + `mautrix-googlechat-db` – Google Chat bridge
24. `matrix-appservice-irc` + `matrix-appservice-irc-db` – IRC bridge (Libera.Chat by default)
25. `maubot` + `maubot-db` (`dock.mau.dev/maubot/maubot`) – pluggable bot framework served at `/_matrix/maubot/`
26. `dimension` (`turt2live/matrix-dimension`) – integration manager UI served at `/dimension/`

Optional alternative homeservers (run instead of `synapse`, mutually exclusive):

-   `alt-homeserver-conduwuit` profile: `conduwuit` (`ghcr.io/girlbossceo/conduwuit`) – Rust low-resource homeserver
-   `alt-homeserver-dendrite` profile: `dendrite` + `dendrite-db` (`matrixdotorg/dendrite-monolith`) – Go second-generation homeserver

## Version matrix (pinned images)

| Service                       | Current pinned version                                     | Source repo URL                                             | Last reviewed date | Upgrade cadence     |
| ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------ | ------------------- |
| matrix-authentication-service | `ghcr.io/element-hq/matrix-authentication-service:v1.15.0` | https://github.com/element-hq/matrix-authentication-service | 2026-04-25         | Monthly             |
| sygnal                        | `matrixdotorg/sygnal:v0.17.0`                              | https://github.com/matrix-org/sygnal                        | 2026-04-25         | Monthly             |
| draupnir                      | `the-draupnir-project/draupnir:v3.0.0`                     | https://github.com/the-draupnir-project/Draupnir            | 2026-04-25         | Monthly             |
| pantalaimon                   | `matrixdotorg/pantalaimon:0.10.5`                          | https://github.com/matrix-org/pantalaimon                   | 2026-04-25         | Quarterly           |
| matrix-media-repo             | `ghcr.io/t2bot/matrix-media-repo:v1.3.7`                   | https://github.com/turt2live/matrix-media-repo              | 2026-04-25         | Monthly             |
| synapse-admin                 | `ghcr.io/etkecc/synapse-admin:0.10.3`                      | https://github.com/etkecc/synapse-admin                     | 2026-04-25         | Monthly             |
| rageshake                     | `ghcr.io/matrix-org/rageshake:latest`                      | https://github.com/matrix-org/rageshake                     | 2026-04-25         | Quarterly           |
| matrix-registration           | `devture/matrix-registration:0.10.2`                       | https://github.com/zeratax/matrix-registration              | 2026-04-25         | Quarterly           |
| maubot                        | `dock.mau.dev/maubot/maubot:0.5.0`                         | https://github.com/maubot/maubot                            | 2026-04-25         | Monthly             |
| matrix-dimension              | `turt2live/matrix-dimension:latest`                        | https://github.com/turt2live/matrix-dimension               | 2026-04-25         | Quarterly           |
| matrix-hookshot               | `halfshot/matrix-hookshot:7.3.2`                           | https://github.com/matrix-org/matrix-hookshot               | 2026-04-25         | Monthly             |
| mautrix-discord               | `dock.mau.dev/mautrix/discord:v0.7.2`                      | https://github.com/mautrix/discord                          | 2026-04-25         | Monthly             |
| mautrix-telegram              | `dock.mau.dev/mautrix/telegram:v0.15.2`                    | https://github.com/mautrix/telegram                         | 2026-04-25         | Monthly             |
| mautrix-signal                | `dock.mau.dev/mautrix/signal:v0.7.4`                       | https://github.com/mautrix/signal                           | 2026-04-25         | Monthly             |
| mautrix-whatsapp              | `dock.mau.dev/mautrix/whatsapp:v0.11.2`                    | https://github.com/mautrix/whatsapp                         | 2026-04-25         | Monthly             |
| mautrix-slack                 | `dock.mau.dev/mautrix/slack:v0.1.3`                        | https://github.com/mautrix/slack                            | 2026-04-25         | Monthly             |
| mautrix-googlechat            | `dock.mau.dev/mautrix/googlechat:v0.5.2`                   | https://github.com/mautrix/googlechat                       | 2026-04-25         | Monthly             |
| matrix-appservice-irc         | `matrixdotorg/matrix-appservice-irc:release-3.0.3`         | https://github.com/matrix-org/matrix-appservice-irc         | 2026-04-25         | Monthly             |
| livekit-server                | `livekit/livekit-server:v1.11.0`                           | https://github.com/livekit/livekit                          | 2026-04-25         | Monthly             |
| conduwuit                     | `ghcr.io/girlbossceo/conduwuit:v0.4.7`                     | https://github.com/girlbossceo/conduwuit                    | 2026-04-25         | Quarterly (Monitor) |
| dendrite                      | `matrixdotorg/dendrite-monolith:v0.13.8`                   | https://github.com/element-hq/dendrite                      | 2026-04-25         | Quarterly (Monitor) |

## Files

-   `docker-compose.yml`
-   `nginx/nginx.conf`
-   `synapse/homeserver.yaml.template`
-   `mas/config.yaml.template`
-   `livekit/config.yaml`
-   `sygnal/sygnal.yaml`
-   `.env.example`
-   `integrations/README.md`
-   `integrations/hookshot/config.yml.template`
-   `integrations/hookshot/registration.yml.template`
-   `integrations/mautrix-discord/config.yaml.template`
-   `integrations/mautrix-discord/registration.yaml.template`
-   `integrations/mautrix-discord/RUNBOOK.md`
-   `well-known/matrix/client`
-   `well-known/matrix/server`

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

-   `/_matrix/*` traffic is handled by Synapse (except MAS compatibility routes, which are inert unless MSC3861 is enabled).
-   Users authenticate directly with Synapse local auth.

### Mode B: MAS-delegated auth (MSC3861/OIDC delegation)

Use Matrix Authentication Service as the auth layer and delegate auth from Synapse.

Recommended `.env` values:

```dotenv
SYNAPSE_AUTH_MODE=mas
SYNAPSE_PASSWORD_AUTH_ENABLED=false
SYNAPSE_MSC3861_ENABLED=true
```

Also populate all `MAS_*` and `SYNAPSE_MSC3861_*` variables in `.env`:

-   MAS issuer/public URLs
-   Synapse-as-client ID/secret/auth method
-   Synapse ↔ MAS admin token/secret
-   MAS signing/encryption keys
-   Optional upstream OIDC provider client details and callback URL
-   The ecosystem relying-party clients (W2): `MAS_FBM_CLIENT_*` (FBM's Medusa
    `mas` auth provider) and `MAS_BLACKOUT_API_CLIENT_*` (the Blackout API's
    native `/v1/auth/oidc/*` login). Client ids are 26-char ULIDs; each
    `*_REDIRECT_URI` must EXACTLY match the relying party's configured
    callback. Claim semantics + integration contract:
    `docs/contracts/mas-identity.md`.

In Mode B the client well-known (`/.well-known/matrix/client`) is rendered
from `well-known/matrix/client.mas` and additionally advertises the OIDC
issuer via MSC2965 (`org.matrix.msc2965.authentication` → `MAS_ISSUER`), so
OIDC-native clients can discover MAS. In Mode A the rendered well-known is
byte-identical to before.

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

-   `https://<domain>/_matrix/client/versions` → Synapse
-   `https://<domain>/_matrix/client/v3/login` → MAS compatibility layer (when MAS mode is enabled)
-   `https://<domain>/.well-known/openid-configuration` → MAS discovery
-   `https://<domain>/_oauth/` → MAS OAuth endpoints
-   `https://<domain>/account/` → MAS account management UI
-   `https://<domain>/livekit/jwt/` → lk-jwt-service
-   `https://<domain>/livekit/sfu/` → LiveKit websocket endpoint
-   `https://<domain>/.well-known/matrix/client` → Matrix client discovery + `rtc_foci`
-   `https://<domain>/.well-known/matrix/server` → federation delegation

## Networking / ports

Expose and forward:

-   `80/tcp` and `443/tcp` for nginx
-   `7880/tcp` (LiveKit websocket)
-   `7881/tcp` (LiveKit TCP fallback)
-   `50100-50200/udp` (LiveKit WebRTC media)

## Notes

-   `matrix-org/synapse` was archived on April 26, 2024; this stack tracks the active upstream image namespace `element-hq/synapse` via pinned semver tags.
-   `nginx` templates resolve domain variables from `.env` at container startup.
-   `.well-known/matrix/client` includes both `org.matrix.msc4143.rtc_foci` and `rtc_foci` for compatibility.
-   `certbot` container performs automated renewals every 12h.
-   Draupnir requires a valid appservice/bot access token and management room ID.

## Migration: local auth → MAS delegated auth (safe cutover)

Use this sequence to minimize login disruption:

1. **Prepare MAS config and secrets while still in local mode**
    - Fill all `MAS_*` and `SYNAPSE_MSC3861_*` variables.
    - Register the ecosystem relying parties (W2): generate real ULID client
      ids + secrets for `MAS_FBM_CLIENT_*` and `MAS_BLACKOUT_API_CLIENT_*`,
      set their exact redirect URIs, and hand the pairs to the two backends
      (FBM `MAS_OIDC_*`, Blackout API `BLACKOUT_OIDC_*`) — see
      `docs/contracts/mas-identity.md`.
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
    - `/.well-known/matrix/client` now carries
      `org.matrix.msc2965.authentication` with the MAS issuer (Mode B renders
      `well-known/matrix/client.mas`).
    - Account-number logins keep working: `syn2mas` moved the password hashes
      into MAS, and `/_matrix/client/*/login` is served by the MAS compat
      layer — the Blackout client's Matrix-login → `/v1/auth/matrix/exchange`
      flow is unchanged (see `docs/contracts/mas-identity.md#migration`).
    - Exercise the relying parties: FBM `POST /auth/customer/mas` round-trip
      and Blackout `POST /v1/auth/oidc/begin` → MAS → `/continue`.
    - Verify FBM's embedded-chat behavior: `matrix-service.ts` auto-login
      (`mintLoginToken`) uses the Synapse admin impersonation endpoint, which
      is expected NOT to work under delegated auth — check and record the
      outcome (known W2 risk item).
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

-   `integrations/hookshot/config.yml`
-   `integrations/hookshot/registration.yml`

Mautrix Discord renders these files on startup:

-   `integrations/mautrix-discord/config.yaml`
-   `integrations/mautrix-discord/registration.yaml`

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

-   **Rate limits:** keep Synapse registration/message limits enabled for appservices and constrain ingress/webhook sources at your reverse proxy/WAF.
-   **Bot permissions:** scope Hookshot bot power levels to the minimum required rooms; avoid global admin for bridge bots.
-   **Secret management:** move `HOOKSHOT_AS_TOKEN`, `HOOKSHOT_HS_TOKEN`, and DB credentials into Docker secrets/secret manager, then rotate on incident or personnel change.
-   **Database durability:** back up `hookshot-db` (`hookshot_db_data`) with Synapse backups to preserve bridge state and delivery checkpoints.
