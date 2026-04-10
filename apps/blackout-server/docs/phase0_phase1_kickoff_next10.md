# Blackout Server Phase 0/1 Kickoff — Next 10 Actions

Date: 2026-03-16
Owner: Blackout server team
Source alignment: `docs/blackout_server_build_plan.md`, `docs/bmc_server_execution_plan.md`, `docs/tracker_todo_fixme_report.md`

This document converts the agreed "next 10 things" into execution-ready actions with owners, deadlines, and objective evidence targets.

## Action queue (execution order)

1. **Kick off BO-101 + BO-201 immediately**
   - Scope: cell template spec + dead-drop preset/retention baseline.
   - Owner: Policy Lead + Backend Lead
   - Due: 2026-03-20
   - Evidence target:
     - `docs/policy/blackout_cell_space_template.md`
     - `blackout_runtime/server_semantics.py` + tests for dead-drop preset behavior.

2. **Stand up 3-node staging federation topology (`hs-alpha`, `hs-beta`, `hs-chaos`) with shared observability**
   - Owner: SRE/Operations Lead
   - Due: 2026-03-22
   - Evidence target:
     - `docs/ops/staging_federation_topology.md`
     - metrics dashboard export or runbook links.

3. **Close Phase 0 deliverables/sign-off under frozen scope**
   - Scope: policy schemas, feature flags/config toggles, CI policy validation scaffold.
   - Owner: Security Lead + Technical Program Owner
   - Due: 2026-03-24
   - Evidence target:
     - sign-off note in `docs/blackout_server_build_plan.md` update section
     - CI policy-check job link/path.

4. **Implement room template enforcement in `blackout_runtime`**
   - Scope: `on_create_room` constraints for voice/forum/governance/dispute semantics.
   - Owner: Backend Lead
   - Due: 2026-03-25
   - Evidence target:
     - `blackout_runtime/server_semantics.py`
     - `blackout_runtime_tests/test_server_semantics.py` coverage for canonical templates.

5. **Implement custom event schema validation with hard rejects for malformed events**
   - Scope: governance proposal/vote, reputation update, channel type events.
   - Owner: Backend Lead
   - Due: 2026-03-25
   - Evidence target:
     - validation logic in `blackout_runtime/server_semantics.py`
     - rejection-path tests in `blackout_runtime_tests/test_module_integration.py`.

6. **Add/finish extended presence API endpoint**
   - Scope: `/_synapse/client/blackout/presence` with BMC-specific states.
   - Owner: Backend Lead
   - Due: 2026-03-26
   - Evidence target:
     - `blackout_runtime/module.py` endpoint registration/handler
     - endpoint tests in `blackout_runtime_tests/test_module_integration.py`.

7. **Run Phase 1 validation scenarios and collect exit-criteria metrics**
   - Scope: policy leakage checks, purge SLA verification, federation success baseline, runbook drill execution.
   - Owner: SRE/Operations Lead + Federation Lead
   - Due: 2026-03-28
   - Evidence target:
     - `docs/reports/phase1_validation_report.md`
     - drill logs and metric snapshots.

8. **Execute formal go/no-go gate before enabling Phase 2 experiments**
   - Scope: explicit decision record for timing-jitter pilot eligibility.
   - Owner: Security Lead + SRE/Operations Lead
   - Due: 2026-03-29
   - Evidence target:
     - `docs/reports/phase2_go_no_go_decision.md`.

9. **Operationalize upstream sync discipline**
   - Scope: upstream remote verification, monthly + advisory merge cadence, patch boundary hygiene in `PATCHES.md`, post-merge runtime test requirement.
   - Owner: Core Server Maintainers
   - Due: 2026-03-30
   - Evidence target:
     - updated `PATCHES.md`
     - `docs/ops/upstream_sync_runbook.md`
     - merge/replay checklist execution logs.

10. **Burn down backend tracker unchecked backlog with owner/date enforcement**
    - Scope: process `docs/development/blackout_backend_plan_tracker.md` open items in prioritized waves with explicit owner + due date + exit criteria + evidence path for each active item.
    - Owner: Program Manager
    - Due: 2026-04-02
    - Evidence target:
      - updated `docs/development/blackout_backend_plan_tracker.md`
      - weekly status in `docs/reports/weekly_completion_report_YYYY-MM-DD.md`.

## Control rules for this queue

- No Phase 2 timing-jitter rollout without written go/no-go approval artifact.
- Any scope expansion during Phase 0 requires written Security + Technical Program approval.
- Items 4–6 must remain covered by runtime tests before claiming completion.

## Weekly cadence checkpoint

- Re-run tracker/marker report generator (`scripts-dev/check_trackers_and_markers.py`) at weekly close.
- Publish deltas and blocker table in weekly report artifact.
