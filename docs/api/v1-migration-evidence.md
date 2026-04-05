# v1 Migration Guardrail Evidence

## Phase 0 checks

- Backend originally mounted only `/api/*` routes (`app.route('/api/...')`) before migration updates.
- Web API client now targets `/v1/*` via shared contract constants and base URL defaults to `.../v1`.
- Mock API policy is explicit: defaults enabled in local/test/development and defaults disabled elsewhere unless `VITE_USE_MOCK_API=true` is set.
- Contract typings source is centralized in `packages/contracts/src/api-contract.ts` and consumed by web + backend packages.

## Canonical decision

- Canonical namespace: `/v1/*`.
- Legacy compatibility alias: `/api/*`.
- `/api/*` target removal date: `2026-08-31`.

## Acceptance notes

- New client code should not introduce hardcoded `/api/*` paths.
- CI guard scripts:
  - `guard:api-v1`
  - `guard:v1-route-coverage`
  - `guard:db-migrations`
