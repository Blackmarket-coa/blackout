# Blackout Feature Audit Update (repository-verified reconciliation)

**Date:** 2026-04-05
**Repository checked:** `/workspace/blackout`

## Why this update exists

This update re-checks the repository against the previously shared audit summary and corrects one major omission:

- `packages/api` is **not empty**.
- It contains a functional Hono backend surface with multiple route groups and supporting modules.

## Repository-verified findings

### 1) There are three active implementation centers

1. `apps/blackout-web` (UI + web client APIs)
2. `blackout-client` (Matrix/crypto-heavy client path)
3. `packages/api` (Hono service layer)

This is a **three-way divergence risk**, not just a web-vs-client split.

### 2) `packages/api` is implemented and non-trivial

Repository check confirms:

- `packages/api/src/index.ts` wires route groups for auth, messages, governance, federation, and channels.
- Storage is currently in-memory (`Map`-backed store).
- SQL schema and migration files exist under `packages/api/src/db/`.
- Stripe and email integrations are present as stubs/mocks.

### 3) Backend capabilities currently present

From route and service inspection, `packages/api` already has:

- auth register/login (password hashing + JWT signing)
- message send/list endpoints
- governance voting create/cast/results endpoints
- federation link create/list endpoints
- channel create/list endpoints

### 4) Critical backend limitations currently present

- **In-memory persistence default** (data reset on process restart).
- **No route tests found under `packages/api`** at the time of inspection.
- **External integrations are placeholder-grade**:
  - Stripe checkout returns a stub URL.
  - Email verification response is mocked.
- **Contract mismatch risk with web app**:
  - `packages/api` mounts endpoints under `/api/...`
  - `apps/blackout-web` API client targets `/v1/...`
  - default web mode enables mock API unless `VITE_USE_MOCK_API="false"`

## About the 67-feature status table

The following numbers are retained from the provided audit input and treated as **audit-source totals**:

- Total audited features: 67
- Fully implemented: 12 (18%)
- Partially implemented: 27 (40%)
- Not implemented: 28 (42%)

This document does **not** claim those counts were recomputed directly from repo automation in this pass.


## Targeted status corrections (Proposal / Voting / Delegation)

For the proposal/voting/delegation rows in the upstream 67-feature tracker, status should be treated as **Partial** (not **Not started**) based on repository evidence in `packages/api/src/routes/governance.ts` and `packages/core/src/governance/index.ts`.

| Entry | Updated status | Notes |
| --- | --- | --- |
| Proposal | Partial | **Scaffold endpoints/utilities present:** governance route scaffold exists for vote creation and retrieval (`POST /votes`, `GET /votes/:voteId`) and uses shared tally utility import path. **Persistence/security/compliance readiness incomplete:** current backing store is in-memory and does not indicate production-grade authZ/audit/compliance controls. **UI integration status:** proposal workflows remain fragmented across app surfaces with incomplete end-to-end integration to durable backend state. |
| Voting | Partial | **Scaffold endpoints/utilities present:** vote casting endpoint (`POST /votes/:voteId/cast`) and `tallyVotes` utility are implemented and wired. **Persistence/security/compliance readiness incomplete:** in-memory persistence and baseline validation only; hardened anti-abuse, compliance evidence paths, and durable controls are not complete. **UI integration status:** baseline voting controls exist in governance shells, but full contract parity and live-data integration are still pending in tracker docs. |
| Delegation | Partial | **Scaffold endpoints/utilities present:** governance utility scaffolding exists in core package, but no dedicated delegation routes are exposed in current API scaffold. **Persistence/security/compliance readiness incomplete:** delegation persistence and policy enforcement are not production-ready in the `packages/api` path. **UI integration status:** delegation is represented as in-progress UI/ops surface, pending full backend integration and authoritative state flow. |

## Corrected critical finding

The system currently has three partially overlapping delivery tracks with inconsistent integration boundaries:

- `apps/blackout-web` provides broad UX surface and feature flags but can run primarily in mock mode.
- `blackout-client` contains deeper protocol/crypto implementations.
- `packages/api` provides real route scaffolding and domain logic, but durability and contract alignment are incomplete.

## Recommended next actions (order)

1. **Align API contracts first**
   - choose `/api` vs `/v1` and enforce one canonical route namespace
   - generate shared typed client bindings

2. **Make persistence durable**
   - replace in-memory default path with PostgreSQL-backed runtime baseline
   - validate migration path in CI

3. **Unify crypto responsibilities**
   - remove placeholder/XOR behavior from shared pathways
   - standardize on audited crypto implementation paths

4. **Create parity matrix in CI**
   - for each feature: UI surface, API availability, persistence, platform parity, and test coverage
