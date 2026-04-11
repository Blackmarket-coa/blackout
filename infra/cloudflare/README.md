# Cloudflare deployment notes

This folder documents how Blackout services are exposed through Cloudflare.

## Domains and subdomains

- `blackout.chat` (apex): marketing/docs landing (optional).
- `app.blackout.chat`: canonical frontend (`apps/blackout-client`).
- `api.blackout.chat`: canonical backend (`apps/blackout-server`).
- `ws.blackout.chat`: websocket upgrades for realtime features (if split from API).

## Tunnel names

Recommended tunnel naming:

- `blackout-prod`
- `blackout-staging`

Store each tunnel config/credentials outside git; use `tunnel.example.yml` as the template.

## Origin mappings

Suggested ingress mapping for production:

- `app.blackout.chat` -> `http://blackout-client:5173`
- `api.blackout.chat` -> `http://blackout-server:3001`
- `ws.blackout.chat` -> `http://blackout-server:3001` (websocket path passthrough)

## Required secrets

At minimum, configure these in your secret manager (not in this repo):

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_TUNNEL_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- Tunnel credentials JSON for each environment

## Frontend and backend exposure

- Frontend should be publicly exposed on `app.blackout.chat`.
- Backend should be exposed on `api.blackout.chat` behind Cloudflare TLS.
- CORS should allow only trusted frontend origins in production.
- Health endpoint should be reachable at `https://api.blackout.chat/health`.
