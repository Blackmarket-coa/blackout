# Evidence — Deploy-critical smoke validation refresh

Date: 2026-03-15
Branch: `work`
Commit under test: `298aa314c72f045d8cc9e14b6a5385d41e34128e`
Verifier: Codex (GPT-5.2-Codex)

## Scope

Focused smoke validation for deploy-critical behavior areas:
- login/auth bootstrap,
- room/timeline rendering,
- media send/render path,
- steganography send/receive path.

## Commands and outcomes

1. `pnpm test`
   - Exit code: `0`
   - Result summary:
     - Workspace test pipeline passed (`Tasks: 10 successful, 10 total`).
     - Current monorepo `test` scripts execute TypeScript no-emit checks for `@blackout/{config,core,design,desktop,mobile,ui,web}`.

2. `pnpm exec jest --config _port/jest.config.ts _port/test/unit-tests/components/structures/auth/Login-test.tsx _port/test/unit-tests/components/structures/TimelinePanel-test.tsx _port/test/unit-tests/customisations/Media-test.ts _port/test/unit-tests/steganography/CarrierTransport-test.ts --runInBand`
   - Exit code: `254`
   - Result summary: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command "jest" not found`.

3. `yarn test test/unit-tests/components/structures/auth/Login-test.tsx test/unit-tests/components/structures/TimelinePanel-test.tsx test/unit-tests/customisations/Media-test.ts test/unit-tests/steganography/CarrierTransport-test.ts --runInBand`
   - Exit code: `1`
   - Result summary:
     - Yarn workspace lockfile mismatch in this monorepo context (`This package doesn't seem to be present in your lockfile`).

4. `rg -n "Login-test\\.tsx|TimelinePanel-test\\.tsx|Media-test\\.ts|CarrierTransport-test\\.ts" _port/test docs/rollout-readiness-status.md`
   - Exit code: `0`
   - Result summary:
     - Smoke-aligned test files exist under `_port/test/...`.
     - Historical smoke command remains documented in `docs/rollout-readiness-status.md`.

## Smoke status by critical behavior

- Login/auth bootstrap: **Harness gap** (targeted suite exists but not executable in current pnpm workspace).
- Room/timeline rendering: **Harness gap** (same runner mismatch).
- Media send/render: **Harness gap** (same runner mismatch).
- Steganography send/receive: **Partially covered** by workspace typecheck pass; targeted Jest smoke remains blocked by runner mismatch.

## Residual risks (bounded)

1. **Risk:** Legacy `_port` smoke-aligned Jest suites are not directly runnable from the current pnpm monorepo root.
   - Owner: QA/Automation + Release Engineering
   - Mitigation: Add/restore a supported smoke runner entrypoint for `_port` suites (or migrate smoke cases into current workspace test runners).
   - Next review date: 2026-03-21

2. **Risk:** Deploy-critical functional smoke remains inferred from historical evidence + current compile checks instead of current head functional test execution.
   - Owner: QA/Automation
   - Mitigation: Execute smoke suites in canonical CI environment with compatible runner and attach run URL/artifacts.
   - Next review date: 2026-03-21

## Conclusion

Current head passes available monorepo test gates, but deploy-critical functional smoke suites are currently blocked by test-runner/workspace mismatch and are tracked as explicit residual risks with owners and review dates.
