# Rollout Readiness Work Order (2026-03-06)

This work order defines the remaining tasks required to move the repo to rollout-ready status.
It replaces the prior snapshot with owner-ready execution items, explicit completion criteria, and evidence targets.

## Scope

- Repository-level rollout gates (lint, dependency audit, baseline, build, smoke validation).
- Known risk/debt queue needed for near-term production hardening.
- Evidence capture needed for Go/No-Go review.

## Active blockers (must close before rollout)

1. **Lint gate failure (`yarn lint:js`)**
   - Open findings:
     - `src/components/structures/auth/Login.tsx` (`no-unsafe-finally`).
     - `test/unit-tests/modules/townhall/TownhallWidgetShell-test.tsx` (`@typescript-eslint/consistent-type-imports`).
2. **Dependency security gate failure (`yarn audit --groups dependencies --level moderate`)**
   - Open findings:
     - `counterpart` (via `@element-hq/web-shared-components`, no patch available).
     - `dompurify` (via `posthog-js`, no patch available).

## Work order tasks

| ID | Task | Owner | Priority | Exit criteria | Evidence artifact | Status |
|---|---|---|---|---|---|---|
| WO-01 | Fix JavaScript lint errors in `Login.tsx` and Townhall widget shell test. | Frontend Engineering | P0 | `yarn lint:js` exits 0 on branch head. | CI/log paste + commit SHA with lint fixes. | ☐ Open |
| WO-02 | Resolve dependency audit gate by either (A) upgrading/removing vulnerable transitive paths or (B) documenting formal risk acceptance for each advisory. | Security + Platform | P0 | `yarn audit --groups dependencies --level moderate` exits 0 **or** approved risk-acceptance record exists for each remaining advisory. | Audit output + security approval note. | ☐ Open |
| WO-03 | Re-run baseline quality suite after WO-01/WO-02. | Release Engineering | P0 | All baseline commands pass: `lint:types`, `lint:js`, `lint:style`, steganography unit tests, and audit disposition criteria above. | Consolidated baseline run log attached to release ticket. | ☐ Open |
| WO-04 | Build production artifact and validate runtime config path. | Release Engineering | P1 | `yarn dist` (or `yarn build` on Windows) succeeds and generated output validated with release config. | Build log + checksum/artifact location. | ☐ Open |
| WO-05 | Execute rollout smoke tests on built artifact (login, timeline render, media, steganography send/receive). | QA + On-call | P1 | All smoke scenarios pass with no P0/P1 defects. | Smoke test checklist + pass/fail report. | ☐ Open |
| WO-06 | Triage top unfinished-code queue items and schedule follow-up PRs by risk order. | Engineering Manager + Module Owners | P2 | Ranked backlog with assignees and target milestones published. | Updated `docs/qa-triage-start.md` or linked tracker issue set. | ☐ Open |

## Command baseline to attach as evidence

```bash
yarn lint:types
yarn lint:js
yarn lint:style
yarn test test/unit-tests/steganography --runInBand
yarn audit --groups dependencies --level moderate
yarn dist
```

## Suggested execution order

1. WO-01 (restore lint gate).
2. WO-02 (clear or formally accept audit findings).
3. WO-03 (full baseline rerun).
4. WO-04 and WO-05 (artifact + smoke validation).
5. WO-06 (post-gate debt management for sustained rollout safety).


## Latest execution snapshot (2026-03-06)

- `yarn lint:js` no longer reports the previously tracked ESLint errors in `Login.tsx` and `TownhallWidgetShell-test.tsx`.
- Lint gate remains blocked by repository-wide Prettier drift (33 files currently reported by `prettier --check .`).
- `yarn audit --groups dependencies --level moderate` still reports two moderate findings:
  - `dompurify` via `posthog-js` (patched in `>=3.3.2`, dependency path not yet upgraded here).
  - `counterpart` via `@element-hq/web-shared-components` (no patch available).

### Task status adjustments

- WO-01: **In progress** (targeted ESLint fixes landed; gate still blocked pending formatting baseline cleanup).
- WO-02: **Open** (same two advisories pending upgrade or risk acceptance record).

## Go/No-Go decision rule

Proceed to rollout only when:

- WO-01 through WO-05 are complete.
- No unresolved P0/P1 defects remain from smoke tests.
- Any residual dependency risk is explicitly accepted by Security with documented compensating controls.
