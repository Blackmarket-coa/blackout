# Blackout API (abstraction layer)

FastAPI service that provides app-level server/channel/member abstractions on top of Matrix.

## Auth/session contract (Option B)

This service expects:

- `Authorization: Bearer <app-jwt>` for abstraction endpoints.
- `X-Matrix-Access-Token: <matrix_access_token>` as the client's Matrix token passthrough.

JWT validation enforces `exp`, `aud`, and `iss` claims.

## Local run

```bash
pip install -r services/blackout-api/requirements.txt
uvicorn blackout_api.main:app --reload --port 8080 --app-dir services/blackout-api
```

## Migrations

Run migrations as a one-shot before starting the API (e.g. an init container,
deploy hook, or local dev step):

```bash
cd services/blackout-api
alembic upgrade head
```

Inline migrations on app startup are off by default
(`BLACKOUT_API_RUN_MIGRATIONS=false`). They can be enabled for local dev by
setting it to `true`, but it's not recommended for production: a stuck
migration will block uvicorn's lifespan and wedge the healthcheck.

## Database

Use a dedicated PostgreSQL role and database for this service. **Do not** share
the Synapse database — both run their own Alembic migrations and will collide
on `alembic_version`.

`scripts/bootstrap-db.sql` provisions the role and database idempotently
against an existing PostgreSQL instance.

## Environment variables

- `BLACKOUT_API_DATABASE_URL` (default: `sqlite:///./blackout_api.db`)
- `BLACKOUT_API_JWT_SECRET` (required in production)
- `BLACKOUT_API_JWT_ALGORITHM` (default: `HS256`)
- `BLACKOUT_API_JWT_AUDIENCE` (default: `blackout-api`)
- `BLACKOUT_API_JWT_ISSUER` (default: `blackout-auth`)
- `BLACKOUT_API_RUN_MIGRATIONS` (default: `false`)

## Railway config / secret management

Use `services/blackout-api/railway.toml` for this service.

In Railway variables (do not commit plaintext production secrets):
- `BLACKOUT_API_DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `BLACKOUT_API_JWT_SECRET=<generated-secret>`
- `BLACKOUT_API_JWT_AUDIENCE=blackout-api`
- `BLACKOUT_API_JWT_ISSUER=blackout-auth`

Rotate `BLACKOUT_API_JWT_SECRET` through Railway variable updates and redeploy.
