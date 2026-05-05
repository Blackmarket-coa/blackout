# matrix-js-sdk baseline policy

## Approved baseline version

- **Baseline:** `^40.0.0`
- **Guard:** `tools/ci/check-matrix-sdk-version-alignment.mjs`
- **CI script:** `pnpm guard:matrix-sdk-baseline`

All in-scope runtime manifests that directly declare `matrix-js-sdk` MUST use the same baseline version string.

## In-scope packages

The guard enforces alignment for runtime manifests that declare `matrix-js-sdk` and are either:

1. Explicitly in scope:
   - `apps/blackout-client/package.json`
   - `blackout/packages/core/package.json`
   - `blackout/apps/mobile/package.json`
2. Auto-discovered in runtime app roots:
   - `apps/**/package.json`
   - `blackout/apps/**/package.json`

If a runtime client starts depending on `matrix-js-sdk`, it becomes in-scope automatically when added under the runtime app roots above.

## Internal import debt guard

The `_port/**` parked source has been decommissioned (2026-05). The
internal-import debt guard, baseline, and debt register that scoped
`matrix-js-sdk/src/*` debt to `_port/**` were retired with it. New
runtime code should consume `matrix-js-sdk` via its public entrypoints
only; if a public equivalent is missing, prefer a local adapter module in
the relevant `packages/*` SDK package rather than reaching into
`matrix-js-sdk/src/*`.

## Approved migration path: internal imports → public entrypoints

When touching code that depends on `matrix-js-sdk/src/*`, migrate
incrementally via this path:

1. **Prefer top-level package exports first**
   - Replace `matrix-js-sdk/src/matrix`, `src/types`, and similar with `matrix-js-sdk` exports whenever equivalents exist.
2. **Introduce local wrappers for missing public APIs**
   - If no direct public equivalent exists, add a local adapter module under the relevant `packages/*` SDK package and centralize the internal import there.
   - Migrate call-sites to the wrapper first, then swap wrapper internals once a public SDK export becomes available.
3. **Constrain specialized internals by domain**
   - WebRTC (`src/webrtc/*`), crypto (`src/crypto-api*`), and OIDC (`src/oidc/*`) should move to their stable public SDK entrypoints as they are released.

## Update and exception process

1. **Propose a baseline bump** in a PR that updates:
   - `BASELINE_MATRIX_JS_SDK_VERSION` in `tools/ci/check-matrix-sdk-version-alignment.mjs`
   - every in-scope runtime manifest declaring `matrix-js-sdk`
   - this policy document (if scope or process changes)
2. **Run guard checks locally** (`pnpm guard:matrix-sdk-baseline` and `pnpm qa:monorepo`).
3. **Merge only when green** so runtime clients stay aligned.

### Temporary exceptions

Exceptions are discouraged. If unavoidable, open a time-boxed follow-up issue and include:

- owning team
- rationale and impact
- target removal date

Then update all runtimes to the approved baseline as soon as the blocking constraint is resolved.
