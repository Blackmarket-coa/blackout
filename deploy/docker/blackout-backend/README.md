# Blackout backend (Docker Compose) with MatrixRTC voice/video

This stack provisions a full backend for Blackout with Matrix + LiveKit calling support.

## Services included

1. `synapse` (`matrixdotorg/synapse`) – Matrix homeserver
2. `postgres` (`postgres`) – Synapse DB
3. `redis` (`redis`) – cache/session store
4. `livekit` (`livekit/livekit-server`) – SFU for voice/video
5. `lk-jwt-service` (`ghcr.io/element-hq/lk-jwt-service`) – MatrixRTC auth bridge
6. `draupnir` (`the-draupnir-project/draupnir`) – moderation bot
7. `nginx` (`nginx`) – reverse proxy + `.well-known`
8. `certbot` (`certbot/certbot`) – Let's Encrypt renewal

## Files

- `docker-compose.yml`
- `nginx/nginx.conf`
- `synapse/homeserver.yaml.template`
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

## 2) Prepare Synapse config and keys

Generate initial config and signing key once:

```bash
docker run --rm -it \
  -v "$(pwd)/synapse:/templates" \
  -v synapse_data:/data \
  -e SYNAPSE_SERVER_NAME="${MATRIX_SERVER_NAME}" \
  -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate
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

- `nginx` templates resolve domain variables from `.env` at container startup.
- `.well-known/matrix/client` includes both `org.matrix.msc4143.rtc_foci` and `rtc_foci` for compatibility.
- `certbot` container performs automated renewals every 12h.
- Draupnir requires a valid appservice/bot access token and management room ID.
