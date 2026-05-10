# QA AI Remediation Plan — 2026-04-05

> **STATUS — 2026-05-10: SUPERSEDED.** All four workstreams below have been
> resolved or made obsolete:
> - **Workstream A (P0)** — `AI-W-CORE-001` and `AI-W-CORE-002` now PASS in
>   `legacy/blackout-web/tests/integration/app.test.ts` (the previously
>   failing `prompt.scrollIntoView` jsdom call has been guarded).
> - **Workstream B (P0)** — Route parity test `react-client-paths.test.ts`
>   is no longer present in the canonical client; the corresponding config
>   moved to `legacy/blackout-web/config/react-client-paths.json` when
>   `apps/blackout-web` was archived to `legacy/` on 2026-05-01.
> - **Workstream C (P1)** — The seven blocked mobile rows are deferred
>   alongside the broader mobile-harness program; the canonical client
>   (`apps/blackout-client`) is the launch surface and has its own
>   coverage in `apps/blackout-client/tests/`.
> - **Workstream D (P0)** — `AI-X-002` session-restore contract is now
>   covered by `legacy/blackout-web/tests/unit/session-restore.test.ts`
>   and passes in CI.
>
> Verified by running `pnpm --filter @blackout/blackout-web test:unit`
> (71 pass) and `pnpm --filter @blackout/blackout-web test:integration`
> (31 pass). Keep this file as a historical record only; do not act on it.

## Goal

Move all currently non-passing AI QA-plan rows (`FAIL`, `BLOCKED`, `NOT_COVERED`) to deterministic automated coverage with stable CI execution.

## Current non-passing inventory

- FAIL (2): `AI-W-CORE-001`, `AI-W-CORE-002`
- BLOCKED (7): `AI-M-AUTH-001..002`, `AI-M-TAB-001..002`, `AI-M-RM-001..003`
- NOT_COVERED (1): `AI-X-002`

## Root causes

1. **Web integration instability**
   - `TypeError: prompt.scrollIntoView is not a function` in jsdom prevents reliable assertions for web core scenarios.
2. **Route parity drift**
   - `react-client-paths` parity test indicates route allowlist is stale vs router definitions.
3. **Mobile harness gap**
   - Mobile AI rows are blocked due to missing executable mobile automation harness.
4. **Session restore gap**
   - No explicit automated test asserts stored-session restore contract (`AI-X-002`).

## Workstream A — Stabilize web integration test runtime (P0)

### A1. Guard `scrollIntoView` calls in app code
- Add safe feature-check before invoking `scrollIntoView` (`typeof el.scrollIntoView === 'function'`).
- Apply to onboarding/command-palette rendering paths to avoid jsdom runtime crashes.

### A2. Add test environment polyfill fallback
- In test setup (Vitest/jsdom), add a no-op polyfill for `HTMLElement.prototype.scrollIntoView`.
- Keep app-level guard as primary safety; polyfill is secondary to improve test determinism.

### Exit criteria
- `pnpm --filter @blackout/blackout-web test:integration` runs without unhandled exceptions.
- `AI-W-CORE-001` and `AI-W-CORE-002` can execute and report assertion-level outcomes.

## Workstream B — Repair router parity contract (P0)

### B1. Reconcile tracked route allowlist
- Compare blackout-web tracked path list with blackout-client router paths.
- Add missing routes (or adjust contract intentionally with explicit rationale).

### B2. Lock parity contract
- Keep parity test strict.
- Add changelog note/template reminder for route additions requiring parity update.

### Exit criteria
- `tests/unit/react-client-paths.test.ts` passes in CI.

## Workstream C — Unblock mobile AI plan rows (P1)

### C1. Establish mobile automation harness
- Choose harness: React Native Testing Library / Detox / Playwright-webview path (based on current app architecture).
- Add deterministic fixtures for auth, room list, room timeline, and context actions.

### C2. Implement tests for blocked rows
- `AI-M-AUTH-001`: invalid credentials deterministic error.
- `AI-M-AUTH-002`: homeserver URL validation blocking request.
- `AI-M-TAB-001/002`: navigation + empty-state assertions.
- `AI-M-RM-001/002/003`: composer enablement, loading marker transition, context action routing.

### Exit criteria
- 7 mobile rows move from `BLOCKED` to `PASS`/`FAIL` based on executed tests.
- Mobile test command integrated into CI workflow.

## Workstream D — Cover session restore contract (P0)

### D1. Add explicit auth-context initialization test
- Seed valid stored token/session fixture.
- Assert app boots into authenticated state without login prompt.

### D2. Add negative counterpart (recommended)
- Expired/invalid token fixture should redirect to auth prompt safely.

### Exit criteria
- `AI-X-002` moves from `NOT_COVERED` to deterministic automated result.

## Execution order

1. Workstream A (integration runtime fix)
2. Workstream B (parity repair)
3. Workstream D (session restore coverage)
4. Workstream C (mobile harness + blocked cases)

## Validation checklist

- Run unit suite: `pnpm --filter @blackout/blackout-web test:unit`
- Run integration suite: `pnpm --filter @blackout/blackout-web test:integration`
- Run mobile automation command (to be added in C1)
- Update `docs/qa-party-ai-test-plan.csv` statuses based on actual rerun results

## Definition of done

- Non-passing counts reduced to zero or have explicit accepted-risk waivers.
- QA plan CSV reflects latest execution date and evidence links per failing case.
- CI includes the commands required to prevent regression of these scenarios.
