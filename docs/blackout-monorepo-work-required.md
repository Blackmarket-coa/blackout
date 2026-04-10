# Blackout Monorepo: Detailed Work Required

Date: April 10, 2026
Scope: Detailed implementation plan to bring the repository from current state to the intended architecture in `docs/blackout-monorepo-qa-writeup.md`.

## 1) Naming and Workspace Canonicalization

## Objective
Align package and app names with the documented canonical targets so QA and CI commands are stable.

### Current state
- Canonical package names should be maintained at `@blackout/client`, `@blackout/server`, `@blackout/protocol`, and `@blackout/sdk`.

### Required work
1. Rename package identities:
   - `apps/blackout-client/package.json`: `name` -> `@blackout/client`.
   - `packages/blackout-protocol/package.json`: `name` -> `@blackout/protocol`.
   - `packages/blackout-sdk/package.json`: `name` -> `@blackout/sdk`.
2. Update all dependent imports and workspace references:
   - root scripts in `package.json`.
   - dependency declarations across `apps/*` and `packages/*`.
   - any CI guards/tools under `tools/ci` that assert package names.
3. Decide canonical server runtime target:
   - Option A: expose a new workspace package `apps/blackout-server-js` (or `apps/blackout-server`) with `name: @blackout/server`.
   - Option B: re-scope `packages/api` to be `@blackout/server` and document this explicitly.

### Deliverables
- All target names visible in `pnpm list -r --depth 0`:
  - `@blackout/client`
  - `@blackout/server`
  - `@blackout/core`
  - `@blackout/protocol`
  - `@blackout/sdk`

### Acceptance criteria
- `pnpm list -r --depth 0 | rg "@blackout/client|@blackout/server|@blackout/protocol|@blackout/sdk"` returns all required packages.
- No stale references remain to old package names.

---

## 2) Runtime Script Alignment

## Objective
Ensure documented startup commands actually work and represent real runtime paths.

### Current state
- `pnpm dev --filter @blackout/client` fails because package doesn’t exist yet under that name.
- `pnpm dev --filter @blackout/server` fails because no such package is defined.
- `pnpm --filter cinny start` fails in current environment with missing `@rollup/plugin-wasm`.
- `packages/api` has no `dev` script.

### Required work
1. Add/normalize scripts:
   - client package: include `dev` script (and optional `start` alias) for Turbo consistency.
   - canonical server package: include `dev`, `build`, `test`, `lint` scripts.
2. Ensure install graph is complete:
   - resolve missing client build dependency (`@rollup/plugin-wasm`) or remove stale import path.
3. Update root scripts:
   - root `dev` should reliably start client + server (+ optional supporting packages).
   - add dedicated shortcuts: `dev:client`, `dev:server`.
4. Validate Turbo filters in CI:
   - add a smoke check to ensure `pnpm dev --filter @blackout/client` and `pnpm dev --filter @blackout/server` resolve.

### Deliverables
- Functional startup commands matching QA docs.

### Acceptance criteria
- `timeout 30s pnpm dev --filter @blackout/client` launches without package resolution errors.
- `timeout 30s pnpm dev --filter @blackout/server` launches without package resolution errors.
- root `pnpm dev` starts the intended platform targets.

---

## 3) SDK Boundary Enforcement (Remove Direct Frontend fetch)

## Objective
Route frontend network traffic through `@blackout/sdk` instead of direct `fetch`, except approved low-level/system contexts.

### Current state
Direct `fetch` calls still exist in `apps/blackout-client/src`.

### Required work
1. Inventory direct fetch usage and classify by category:
   - application API calls (must move to SDK)
   - media retrieval/system internals (may remain if explicitly exempt)
   - service worker/runtime bootstrap calls (documented exemptions)
2. Implement or extend SDK methods for each API surface currently called directly.
3. Replace frontend call sites with SDK methods.
4. Add lint/guard rule:
   - block `fetch(` in app feature layers except allowlisted files.
5. Add regression tests around migrated call paths.

### Deliverables
- SDK coverage for client-facing backend APIs.
- Automated guard preventing future drift.

### Acceptance criteria
- `rg -n "\bfetch\(" apps/blackout-client/src/app/features apps/blackout-client/src/app/pages` returns zero non-allowlisted hits.
- feature tests pass with SDK-based networking.

---

## 4) Protocol Contract Consolidation

## Objective
Ensure shared payload/event types are sourced from `@blackout/protocol` and imported by both client and server.

### Current state
Protocol package exists but naming and adoption are incomplete.

### Required work
1. Define protocol surface ownership:
   - event names
   - payload schemas
   - versioning policy
2. Move duplicate feature payload types from app/server code into protocol package.
3. Update imports in client/server modules to protocol package.
4. Add contract compatibility tests:
   - compile-time checks for consumer imports.
   - optional schema validation tests.

### Deliverables
- Canonical protocol package consumed across runtime boundaries.

### Acceptance criteria
- No duplicated event payload types across client/server feature modules.
- Both client and canonical server import feature payload types from protocol package.

---

## 5) Server Module Parity with Frontend Features

## Objective
Mirror frontend feature plugin domains with backend module boundaries.

### Current state
Documented feature-module parity is aspirational; canonical JS/TS server module mapping is incomplete.

### Required work
1. Define canonical server module map:
   - governance
   - forum
   - deaddrop
   - moderation
2. Ensure each module has:
   - route registration
   - authz checks
   - persistence integration
   - emitted domain events
3. Add module registration test to verify server route bootstrap.
4. Document endpoints and SDK method bindings per module.

### Deliverables
- Coherent server modules matching frontend feature domains.

### Acceptance criteria
- Module bootstrap test passes and confirms route registration for each feature module.
- SDK method map covers registered server routes.

---

## 6) Legacy Code Isolation and Policy

## Objective
Prevent legacy Element code from polluting active runtime paths while preserving archival value.

### Current state
- Documentation expects `legacy/element`.
- Existing legacy material appears under `_port/element.io`.

### Required work
1. Choose one canonical legacy location:
   - preferred: `legacy/element`.
2. Migrate or alias existing `_port/element.io` content to canonical location.
3. Add guard to prevent runtime imports from legacy paths into active app packages.
4. Add README in legacy location:
   - purpose
   - support status
   - import restrictions

### Deliverables
- Single, explicit legacy namespace and import guard.

### Acceptance criteria
- `rg -n "from ['\"].*legacy|from ['\"].*_port" apps packages` returns no active-runtime imports.
- CI guard fails if new active imports from legacy paths are introduced.

---

## 7) Feature Registry Completion

## Objective
Ensure routes/navigation/settings are consistently derived from feature manifests.

### Current state
A registry exists, but broader adoption and hardcoded-route elimination require verification.

### Required work
1. Audit route declarations for hardcoded feature entries.
2. Move remaining route/nav/settings definitions into feature manifests.
3. Add test coverage:
   - registry outputs expected entries per feature-flag preset.
   - route/nav/settings generation snapshot tests.
4. Add governance for feature metadata contract.

### Deliverables
- Feature-manifest-driven composition across client shell surfaces.

### Acceptance criteria
- No hardcoded feature routes outside registry composition layer.
- registry tests pass across default and non-default feature flag presets.

---

## 8) CI/QA Automation

## Objective
Encode the QA checklist as automated, repeatable checks.

### Required work
1. Add a `qa:monorepo` script that runs:
   - workspace package assertion check
   - canonical dev filter resolution check
   - SDK boundary check
   - protocol import consistency check
   - legacy isolation check
2. Publish outputs as CI artifacts.
3. Gate PR merges on `qa:monorepo` pass once migration threshold is met.

### Deliverables
- One-command monorepo conformance check.

### Acceptance criteria
- `pnpm qa:monorepo` executes successfully in CI and local dev environment.

---

## 9) Documentation Updates Required

## Objective
Keep architecture docs synchronized with implementation reality.

### Required work
1. Update `docs/blackout-monorepo-qa-writeup.md` once naming/runtime changes land.
2. Add links from root `README.md` and migration tracker docs to this work plan.
3. Add a changelog section documenting completed migration milestones.

### Acceptance criteria
- No contradictory commands/package names across docs.
- QA docs reflect executable commands in the current repository.

---

## Suggested Execution Order (Phased)

1. **Phase A (Foundational alignment)**
   - Naming canonicalization
   - Runtime script alignment
2. **Phase B (Boundary enforcement)**
   - SDK migration
   - Protocol consolidation
3. **Phase C (Architecture parity)**
   - Server module parity
   - Feature registry completion
4. **Phase D (Governance & hardening)**
   - Legacy isolation
   - CI/QA automation
   - Documentation synchronization

## Definition of Done

This work is complete when:
- documented canonical package names exist and resolve in workspace,
- client and server startup commands run as documented,
- frontend API calls flow through SDK boundaries,
- protocol types are shared and canonical,
- legacy code is isolated with enforceable policy,
- QA checks are automated and green in CI,
- architecture documentation reflects actual, runnable repository behavior.
