# Railway deployment notes

This folder documents Blackout service deployment on Railway.

## Services deployed to Railway

- `blackout-client` (optional on Railway; commonly deployed to Cloudflare Pages)
- `blackout-server` (primary API service)
- `postgres` (managed Railway database)
- `redis` (managed Railway cache/queue)

## Service roots and commands

### `blackout-client`

- Root directory: `apps/blackout-client`
- Build command: `pnpm --filter @blackout/client build`
- Start command: `pnpm --filter @blackout/client dev` (preview/staging only)

### `blackout-server`

- Root directory: `apps/blackout-server`
- Build command: `pnpm --filter @blackout/server build`
- Start command: `pnpm --filter @blackout/server start`

## Required environment variables

### Client

- `VITE_API_BASE_URL`
- `VITE_MATRIX_HOMESERVER_URL`
- Feature flags (`VITE_FEATURE_*`) as needed

### Server

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET_PRIMARY` — HS256 signing key for auth tokens.
- `CORS_ALLOWED_ORIGINS` — comma-separated list of browser origins permitted to call the API.
- `PUBLIC_APP_URL` — externally-reachable HTTPS origin used to build invite URLs.
- `MATRIX_HOMESERVER` — Synapse base URL.
- `MATRIX_HOMESERVER_DOMAIN` — MXID server-name suffix; must equal Synapse's `server_name`.
- `MATRIX_BOT_TOKEN` — Synapse admin access token.
- `INTERNAL_METRICS_TOKEN` — bearer required for the `/metrics` scrape.
- `NODE_ENV`

## Operational notes

- Use Railway environments for `staging` and `production`.
- Promote from staging to production only after smoke tests pass.
- Keep secrets in Railway variable management, not checked into git.
