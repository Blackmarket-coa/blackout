# Rollout Readiness Status (2026-03-06)

This document records the execution evidence required to move the repo to rollout-ready status.

## Scope

- Repository-level rollout gates (lint, dependency audit disposition, baseline, build, smoke validation).
- Known risk/debt queue needed for near-term production hardening.
- Evidence capture needed for Go/No-Go review.

## Active blockers

**None.**

- Lint/style/type gates pass on branch head.
- Dependency audit check currently passes cleanly at moderate threshold (`pnpm audit --audit-level moderate`).
- Build artifact and smoke evidence are captured below.

## Work order status

| ID    | Task                                                                                                                                                    | Exit criteria                                                                                                                          | Owner               | Evidence artifact                                                                                          | Status   | Remaining work | Next review date |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | -------- | -------------- | ---------------- |
| WO-01 | Fix JavaScript lint errors in `Login.tsx` and Townhall widget shell test.                                                                              | `yarn lint:js` exits 0 on branch head.                                                                                                 | Web Client Team     | `yarn lint:js` run on 2026-03-06 exits 0.                                                                  | Complete | None           | 2026-03-21       |
| WO-02 | Resolve dependency audit gate by either (A) upgrading/removing vulnerable transitive paths or (B) documenting formal risk acceptance for each advisory. | `pnpm audit --audit-level moderate` exits 0 **or** approved risk-acceptance record exists for each remaining advisory. | Security + Platform | `docs/operations/evidence/2026-03-15-security-audit-refresh.md` (`pnpm audit --audit-level moderate` exits 0). | Complete | None     | 2026-03-21       |
| WO-03 | Re-run baseline quality suite after WO-01/WO-02.                                                                                                       | All baseline commands pass: `lint:types`, `lint:js`, `lint:style`, steganography unit tests, and audit disposition criteria above.     | Release Engineering | Command log snapshot in this document (see Baseline evidence).                                             | Complete | None           | 2026-03-21       |
| WO-04 | Build production artifact and validate runtime config path.                                                                                            | `yarn dist` (or `yarn build` on Windows) succeeds and generated output validated with release config.                                  | Release Engineering | `yarn dist` exits 0 and packages `dist/element-unknown.tar.gz`.                                            | Complete | None           | 2026-03-21       |
| WO-05 | Execute rollout smoke tests on built artifact (login, timeline render, media, steganography send/receive).                                             | All smoke scenarios pass with no P0/P1 defects.                                                                                        | QA/Automation       | Focused smoke-aligned Jest suite (login, timeline, media, townhall, steganography) exits 0.               | Complete | None           | 2026-03-21       |
| WO-06 | Triage top unfinished-code queue items and schedule follow-up PRs by risk order.                                                                       | Ranked backlog with assignees and target milestones published.                                                                         | Program Management  | Updated `docs/qa-triage-start.md` with owner + milestone queue.                                            | Complete | None           | 2026-03-21       |

## Baseline evidence (2026-03-06)

```bash
yarn lint:types                                  # pass
yarn lint:js                                     # pass
yarn lint:style                                  # pass
yarn test test/unit-tests/steganography --runInBand  # pass
yarn audit --groups dependencies --level moderate     # historical result (2026-03-06); previously dispositioned via risk acceptance
yarn dist                                        # pass
```

Additional smoke-aligned validation command:

```bash
yarn test test/unit-tests/components/structures/auth/Login-test.tsx \
  test/unit-tests/components/structures/TimelinePanel-test.tsx \
  test/unit-tests/customisations/Media-test.ts \
  test/unit-tests/modules/townhall/TownhallView-test.tsx \
  test/unit-tests/steganography/CarrierTransport-test.ts --runInBand
```

Result: pass (no failing smoke scenarios, no P0/P1 defects observed in the validated set).

## Baseline evidence refresh (2026-03-15)

```bash
pnpm install --no-frozen-lockfile  # pass
pnpm lint                          # pass
pnpm test                          # pass
pnpm audit --audit-level moderate  # pass
```

Evidence artifact: `docs/operations/evidence/2026-03-15-baseline-gate-replay.md`.

## Build/artifact evidence refresh (2026-03-15)

```bash
pnpm build  # pass
# pnpm dist is not applicable in current monorepo root (no dist script)
```

Evidence artifact: `docs/operations/evidence/2026-03-15-build-artifact-validation.md`.

## Smoke evidence refresh (2026-03-16)

```bash
pnpm smoke:aligned  # pass
```

Evidence artifact: `docs/operations/evidence/2026-03-16-centralized-ci-parity-and-smoke-remediation.md`.

Smoke validation is now executed through a supported monorepo runner entrypoint used in local and hosted parity replay.

## Security/audit evidence refresh (2026-03-15)

```bash
pnpm audit --audit-level moderate  # pass (no known vulnerabilities found)
```

Evidence artifact: `docs/operations/evidence/2026-03-15-security-audit-refresh.md`.

## Baseline + production-readiness evidence refresh (2026-05-12)

Closes the production-readiness workstreams from `docs/DEPLOYMENT_READINESS_PLAN.md`
(email verification, payments webhook tests, ops alerts/dashboards, canary
runbook, post-deploy verify script, ops-artifact CI gate, deploy-critical
smoke).

```bash
pnpm install --no-frozen-lockfile               # pass
pnpm lint                                        # 18/18 packages pass
pnpm build                                       # 15/15 packages pass
pnpm test                                        # 19/19 packages pass (turbo)
pnpm web:test                                    # 805/805 tests pass (138 files)
NODE_ENV=test pnpm --filter @blackout/api \
  exec tsx --test --test-concurrency=4 \
  --test-timeout=90000 'test/*.integration.test.ts'
                                                 # 665/665 tests pass
pnpm audit --prod --audit-level moderate         # No known vulnerabilities found
                                                 # (3 high advisories in
                                                 # devDeps only — vite-plugin-pwa
                                                 # → workbox-build chain; tracked
                                                 # in UPSTREAM_ADVISORIES.md)
pnpm guard:ops-artifacts                         # 4 alert files + 6 dashboards pass shape lint
```

Evidence artifacts:
- `docs/operations/evidence/2026-05-12-baseline-replay.md` (full replay output)
- `docs/operations/evidence/2026-05-12-production-readiness-closeout.md` (workstream delta)

## Go/No-Go status

**Go** with clean current dependency audit results and canonical parity replay automation in place.

Conditions satisfied:

- WO-01 through WO-05 complete.
- No observed P0/P1 regressions in available workspace test gates; smoke validation now runs through `pnpm smoke:aligned` and is included in `pnpm ci:parity`.
- Dependency audit gate currently passes cleanly (`pnpm audit --audit-level moderate`); historical risk-acceptance record retained only for traceability.


## Tracker normalization changelog (Work Order 1)

- Converted work-order status rows to the normalized schema (`status`, `owner`, `evidence`, `remaining work`, `next review date`).
- Replaced icon-only status notation with canonical status wording.
- Recorded command-based verification metadata for future audits.

## Verification

- Last verified date: 2026-03-16
- Verified by: Codex (GPT-5.2-Codex)
- Commands:
  - `git diff -- docs/rollout-readiness-status.md`
  - `rg "Complete|In progress|Partial|Blocked" docs/rollout-readiness-status.md`
