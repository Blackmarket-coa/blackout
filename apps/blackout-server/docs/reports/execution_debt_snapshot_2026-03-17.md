# Execution Debt Snapshot (2026-03-17)

Source tracker: `docs/development/blackout_backend_plan_tracker.md`

## Current load snapshot

```text
# Execution Debt Snapshot
- Source: `docs/development/blackout_backend_plan_tracker.md`

## Checklist status
- open: 114

## Scope labels
- deferred-with-signoff: 114

## Top owners by open load
- Program Manager: 53
- Backend Lead: 20
- Protocol Engineer: 14
- Infra Lead: 9
- Data Lifecycle Engineer: 9
- Security Architect: 5
- Core Server Maintainers: 4

## Upcoming due dates
- 2026-03-22: 20
- 2026-03-24: 14
- 2026-03-25: 9
- 2026-03-26: 9
- 2026-03-27: 4
- 2026-03-30: 5
- 2026-06-30: 34
- 2026-09-30: 19
```

## Execution debt assessment

- The debt profile is not code-marker heavy; it is **execution-heavy** with 114 deferred tasks.
- The most critical concentration is the **2026-03-22 through 2026-03-30** due window.
- Owner concentration indicates immediate coordination focus should be on **Program Manager + Backend Lead + Protocol Engineer** workstreams.

## Activation plan (next 25 execution steps)

1. Freeze a Wave-1 scope list to the 20 items due `2026-03-22`.
2. Convert those 20 items from deferred-only status to explicit sprint tickets.
3. Assign a single DRI for each of the 20 near-due tasks.
4. Require implementation PR links on every activated ticket.
5. Define daily burn-down target for the 20-item bucket.
6. Lock acceptance tests for storage/persistence policy tasks.
7. Publish canonical persisted/non-persisted data matrix.
8. Add policy-engine tests for persisted account/key/membership surfaces.
9. Add policy-engine tests for non-persisted message/encrypted/media surfaces.
10. Draft migration-safe rollout note for persistence policy toggles.
11. Activate the 14-item `2026-03-24` protocol bucket.
12. Finalize `m.blackout.signal` schema constraints and examples.
13. Implement validator error-code mapping for blocked event types.
14. Add conformance tests for accepted/rejected signal payloads.
15. Document client fallback behavior for blocked timelines.
16. Activate the 9-item `2026-03-25` infra/TURN bucket.
17. Publish secure coturn baseline and dependency health checks.
18. Add metrics for setup success / candidate failure / relay fallback.
19. Define abuse-control defaults for signaling storms.
20. Activate the 9-item `2026-03-26` retention bucket.
21. Implement TTL+purge config path and bounded purge loop tests.
22. Verify purge irretrievability via API-level tests.
23. Prove purge safety for auth-critical state with regression tests.
24. Run staging smoke for startup+federation+workers after each bucket closure.
25. Update deployment go/no-go with per-bucket evidence links.

## Repro command

```bash
python3 scripts-dev/reporting/execution_debt_snapshot.py
```
