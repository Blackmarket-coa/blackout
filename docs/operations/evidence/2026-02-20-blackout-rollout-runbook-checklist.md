# Blackout rollout runbook checklist execution evidence

Date: 2026-02-20
Source checklist: `docs/blackout-rollout-runbook.md` (rollout checklist)

## 1) Deliberation clustering + governance service tests

```bash
yarn -s test test/services/governance
```

Result: **pass**
- Suites: 7 passed / 7 total
- Tests: 20 passed / 20 total

## 2) Storage/IPFS tests including room-event/state payload parsing

```bash
yarn -s test test/services/storage/ipfsService-test.ts test/services/storage/ipfsRoomEvents-test.ts
```

Result: **pass**
- Suites: 2 passed / 2 total
- Tests: 9 passed / 9 total

## 3) Cross-module E2E suite (education + mutual-aid + IPFS references)

```bash
yarn -s test test/services/blackout/CrossModuleIntegration-e2e-test.ts
```

Result: **pass**
- Suites: 1 passed / 1 total
- Tests: 1 passed / 1 total

## 4) Dashboard telemetry verification

- Verified dashboard JSON includes module adoption panels for governance, education, and mutual-aid.
- Dashboard artifact: `docs/operations/dashboards/blackout_module_adoption_dashboard.json`.

## 5) Internal support note for degraded states

- Published note: `docs/operations/blackout_degraded_state_support_note.md`.
- Note covers IPFS unavailable, feature-flag disabled, and stale room-state reference cases.
