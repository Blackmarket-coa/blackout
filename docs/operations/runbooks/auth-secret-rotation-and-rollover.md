# Auth Secret Rotation + Dual-Key Rollover Runbook

## Goal
Rotate JWT signing secrets without forcing user-visible auth outages.

## Runtime model
- `JWT_SECRET_PRIMARY`: current signing key (required, strong).
- `JWT_SECRET_ROLLOVER`: comma-separated previous keys still accepted for verification.
- Tokens are signed with `JWT_SECRET_PRIMARY` and verified against both primary + rollover list.

## Preconditions
1. Generate a new strong secret (>= 32 chars, mixed upper/lower/number/symbol).
2. Confirm current primary key value from secret manager.
3. Confirm service health and auth baseline before change.

## Rotation steps (zero-downtime)
1. Add current key to rollover list, set new key as primary:
   - `JWT_SECRET_PRIMARY=<new>`
   - `JWT_SECRET_ROLLOVER=<old>[,<older-if-needed>]`
2. Deploy config to all API instances.
3. Verify login + authenticated API calls still work.
4. Wait for maximum JWT TTL window to pass.
5. Remove old key from rollover list.
6. Redeploy and verify again.

## Validation checks
- `pnpm --filter @blackout/server test:integration`
- `pnpm guard:auth-secrets`
- `GET /health` should include security preflight metadata and stay healthy.

## Cookie/token policy guardrails
- If `AUTH_TOKEN_TRANSPORT` is `cookie` or `both`:
  - `AUTH_COOKIE_NAME` must be set.
  - In production, `AUTH_COOKIE_SECURE=true` is mandatory.
  - `AUTH_COOKIE_SAMESITE=none` requires `AUTH_COOKIE_SECURE=true`.

## Rollback
- Revert to previous `JWT_SECRET_PRIMARY` and keep newer key in `JWT_SECRET_ROLLOVER`.
- Redeploy and re-verify.
