# Local deployment flow

## Prerequisites

- Node.js 20+
- pnpm (via Corepack)

## Quickstart

```bash
pnpm install
pnpm build
pnpm dev
```

## Environment setup

1. Copy `apps/blackout-client/.env.example` to `apps/blackout-client/.env`.
2. Copy `apps/blackout-server/.env.example` to `apps/blackout-server/.env`.
3. Start local dependencies (Postgres/Redis/Matrix homeserver) if your feature set requires them.

## Verification

- Client expected at `http://localhost:5173`
- Server expected at `http://localhost:3001`
- Health check: `http://localhost:3001/health`
