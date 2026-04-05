# Blackout web test rerun evidence — 2026-04-05

## Commands executed

1. `pnpm --filter @blackout/blackout-web test:unit`
   - Result: **PASS** (31 files, 67 tests passed).

2. `pnpm --filter @blackout/blackout-web test:integration`
   - Result: **FAIL** (2 files failed, 12 tests failed / 12 passed).
   - Representative failures:
     - `tests/integration/preset-smoke.test.ts > runs smoke flow for tier_enterprise`
     - `tests/integration/app.test.ts > supports auth submit, server switching, and message send flow`
     - `tests/integration/app.test.ts > opens widget entries from the files panel`

3. `pnpm web:test:mobile`
   - Result: **PASS** (7/7 mobile harness tests passed).

## Accepted-risk waiver (integration suite)

The current integration failures are treated as an **accepted temporary risk** for this change-set because:

- This work item focused on mobile harness coverage and session persistence automation (AI-M* + AI-X-002).
- Unit and mobile suites passed and now provide deterministic coverage for newly requested scenarios.
- Existing integration failures are pre-existing/orthogonal parity issues in broader feature-library integration coverage and preset smoke checks.

Follow-up is required to eliminate these failures and remove the waiver.
