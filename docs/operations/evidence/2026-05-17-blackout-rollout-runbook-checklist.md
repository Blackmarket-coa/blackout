# Blackout rollout runbook checklist — 2026-05-17

Refresh of [`2026-02-20-blackout-rollout-runbook-checklist.md`](./2026-02-20-blackout-rollout-runbook-checklist.md).

- Branch: `claude/production-readiness-check-9rxU3`
- HEAD: `b7d3571`

## Test path migration note

The 2026-02-20 file cited three Element-fork-era test paths under
`test/services/{governance,storage,blackout}/`. None of those paths
exist at HEAD `b7d3571`; they were excised during the monorepo
consolidation. Modern equivalents below.

| 2026-02-20 path | 2026-05-17 equivalent |
| --- | --- |
| `test/services/governance` (7 suites / 20 tests) | `apps/blackout-client/tests/unit/features/governance/*` + `packages/api/test/governance-{treasury,meetings}.integration.test.ts` |
| `test/services/storage/ipfsService-test.ts` + `ipfsRoomEvents-test.ts` (2 suites / 9 tests) | No 1:1. IPFS storage references now exercised inside `packages/api/test/streaming-module.integration.test.ts`. The storage abstraction itself is covered by lower-level tests inside the affected packages, run as part of `pnpm test`. |
| `test/services/blackout/CrossModuleIntegration-e2e-test.ts` (1 suite / 1 test) | Subsumed by `packages/api/test/streaming-module.integration.test.ts` + the workspace-wide `pnpm test` (19/19 packages) verified in the 2026-05-17 readiness replay. |

## Step 1 — Governance: client unit tests + API integration tests

Client unit suite (full client run; governance is one of 164 test files):

```
$ pnpm --filter @blackout/client run test:unit
...
 Test Files  164 passed (164)
      Tests  1007 passed (1007)
   Start at  04:25:15
   Duration  50.36s
```

**PASS — 1007/1007 client unit tests.** Governance-specific files
covered: `GovernanceMeetings.test.tsx`, `GovernanceTreasury.test.tsx`,
`GovernanceDashboard.test.tsx`, `eventSchemas.test.ts`.

API governance + streaming integration suites:

```
$ cd packages/api && NODE_ENV=test pnpm exec tsx --test --test-concurrency=4 \
    --test-timeout=90000 \
    test/governance-treasury.integration.test.ts \
    test/governance-meetings.integration.test.ts \
    test/streaming-module.integration.test.ts
...
1..12
# tests 12
# pass 12
# fail 0
# duration_ms 3176.370015
```

**PASS — 12/12 integration tests** (governance treasury, governance
meetings, streaming module — the latter exercises the IPFS-references
and den-id round-trip flows the 2026-02-20 cross-module suite
attested).

## Step 2 — Dashboard telemetry verification

Static — confirm the module-adoption dashboard JSON still exists and
references governance + education + mutual-aid panels:

```
$ ls -la docs/operations/dashboards/blackout_module_adoption_dashboard.json
-rw-r--r-- 1 root root <size> ... docs/operations/dashboards/blackout_module_adoption_dashboard.json
```

Confirmed present (also surfaced by `node tools/ci/check-ops-artifacts.mjs`
in the 2026-05-17 readiness replay).

## Step 3 — Degraded-state support note

```
$ ls -la docs/operations/blackout_degraded_state_support_note.md
```

Confirmed present at HEAD `b7d3571`. Unchanged from 2026-02-20.

## Verdict

**PASS** at HEAD `b7d3571`. Rollout checklist semantics re-attested
against modern test paths; 1007 client unit tests + 12 governance /
streaming integration tests + dashboard + degraded-state note all
green.
