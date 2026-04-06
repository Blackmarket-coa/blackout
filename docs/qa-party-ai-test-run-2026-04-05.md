# QA Party AI Test Run — 2026-04-05

## Commands executed

- `pnpm --filter @blackout/blackout-web test:unit`
  - Result: **failed** (1 failing file: `tests/unit/react-client-paths.test.ts` parity mismatch).
- `pnpm --filter @blackout/blackout-web test:integration`
  - Result: **failed** (`TypeError: prompt.scrollIntoView is not a function` in jsdom across app integration tests).

## Outcome mapping

Execution outcomes are recorded directly in `docs/qa-party-ai-test-plan.csv` under `status`, `defect_link`, and `notes`.

Summary counts:

- PASS: 5
- FAIL: 2
- BLOCKED: 7
- NOT_COVERED: 1

## Primary defects observed

1. **React client route parity drift**
   - `tests/unit/react-client-paths.test.ts` expects tracked paths to include routes that are currently missing in the allowlist.
2. **Integration runtime error in jsdom**
   - Unhandled `TypeError: prompt.scrollIntoView is not a function` from `src/app.ts`, causing broad integration instability.
