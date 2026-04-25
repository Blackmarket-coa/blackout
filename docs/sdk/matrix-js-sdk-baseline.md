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
