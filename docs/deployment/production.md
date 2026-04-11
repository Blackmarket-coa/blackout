# Production deployment guide

## Required production environment variables

### Server

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `NODE_ENV=production`

### Client

- `VITE_API_BASE_URL`
- `VITE_MATRIX_HOMESERVER_URL`
- `VITE_FEATURE_GOVERNANCE`
- `VITE_FEATURE_FORUM`
- `VITE_FEATURE_DEADDROP`
- `VITE_FEATURE_MODERATION`

## Cloudflare setup

1. Configure DNS records for `app` and `api` subdomains.
2. Create and run the production Cloudflare Tunnel.
3. Route public hostnames to internal app origins.
4. Enforce HTTPS/TLS and origin access controls.

See `infra/cloudflare/README.md` for canonical tunnel/domain notes.

## Railway or Docker flow

### Railway

- Deploy `blackout-server` from `apps/blackout-server`.
- Provision Postgres + Redis services.
- Set environment variables and health checks.

### Docker

- Build server image from `apps/blackout-server/Dockerfile`.
- Use compose files under `infra/docker` for environment parity.
- Deploy with pinned image tags per environment.

## Health checks

- API liveness: `GET /health`
- API readiness: `GET /ready` (if implemented)
- Optional synthetic route check for auth/session bootstrap

## Rollback basics

- Keep the previous known-good image/artifact.
- Roll back application version first, then config if needed.
- Verify health checks and critical user flows after rollback.
