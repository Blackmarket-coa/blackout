# Server readiness work order (deployment + test gates)

This work order compiles all remaining marker-debt, rollout-evidence, deployment, and validation tasks into one execution plan for delivering a fully usable server.

Primary source inputs:
- `INCOMPLETE_WORK.md`
- `docs/project_completion_tracker.md`
- `docs/full_completion_execution_plan.md`

## 1) Current blockers snapshot

## 1.1 Marker/incomplete-work backlog

- Current marker inventory: **111** (excluding inventory artifacts).
- Highest remaining concentration is in:
  - `synapse/` (**54**)
  - `docs/` (**27**)
  - `tests/` (**14**)
  - `NOTIMPLEMENTED_AUDIT.md` (**12**)
  - `docker/` (**2**)
- Deferred owner/date commitments currently recorded:
  - Runtime Reliability Lead: **2026-03-14**
  - Release Engineering Lead: **2026-03-21**

## 1.2 Deployment/testing evidence gaps (gating)

The following evidence artifacts are expected by tracker checklists but currently missing and therefore gate full readiness signoff:

- `docs/drills/postgres_failover_report.md`
- `docs/reliability_reports/backup_verification_2026-Q2.md`
- `docs/drills/chaos_drill_report_wave1.md`
- `docs/drills/region_failover_gameday.md`
- `docs/operator_onboarding_pack.md`
- `docs/drills/cross_operator_federation_drill.md`

## 2) Ordered workstreams

Run workstreams in this order:

1. **WS-A** marker debt + runtime risk verification
2. **WS-B** deployment evidence production
3. **WS-C** server usability validation test matrix
4. **WS-D** tracker updates and closure packaging

---

## 3) WS-A — Marker debt + runtime risk verification

### Objective

Reduce open marker debt to policy-compliant state and confirm request-serving flows remain free of runtime-path Not-Implemented exceptions.

### AI prompt (copy/paste)

```text
You are working in this repository. Execute one marker/risk closure wave focused on server-readiness blockers.

Tasks:
1) Recompute marker totals excluding inventory artifacts.
2) Produce top-10 hotspot list and classify each hotspot as:
   - required-now fix
   - required-later
   - not-in-scope
3) For required-now items:
   - implement fixes in code/docs
   - add or adjust tests for behavior changes
4) Verify runtime request-serving paths do not raise raw N.I.E..
5) Update INCOMPLETE_WORK.md with:
   - updated totals
   - wave summary (closed/deferred)
   - owner/date for remaining deferred work

Constraints:
- Keep intentional abstract interface N.I.E. sites only when clearly justified.
- Keep patch reviewable and subsystem-scoped.

Commit message prefix: "debt: server readiness marker/risk wave"
```

### Checks

```bash
rg -n "[T]ODO|[F]IXME|[T]BD|[X]XX|[H]ACK|[N]otImplementedError|[T]ODO_test_" . -g '!INCOMPLETE_WORK.md' -g '!docs/marker_inventory.csv'
rg -n "raise [N]otImplementedError\(" synapse
python scripts-dev/check_marker_budget.py
```

---

## 4) WS-B — Deployment evidence production (hard gate)

### Objective

Create/commit objective evidence artifacts required by G2/G3 tracker checklists so deployment readiness can be signed off.

### AI prompt (copy/paste)

```text
You are working in this repository. Close deployment-readiness evidence gaps in tracker G2/G3 milestones.

Create and/or populate the following artifacts with reproducible evidence:
- docs/drills/postgres_failover_report.md
- docs/reliability_reports/backup_verification_2026-Q2.md
- docs/drills/chaos_drill_report_wave1.md
- docs/drills/region_failover_gameday.md
- docs/operator_onboarding_pack.md
- docs/drills/cross_operator_federation_drill.md

For each artifact include:
1) purpose/scope
2) execution date/environment
3) exact command/procedure executed
4) observed results and pass/fail criteria
5) follow-up actions (owner + due date)

Then update docs/project_completion_tracker.md so each related G2/G3 checklist line references the artifact path and explicit status.

Commit message prefix: "docs: add deployment-readiness drill evidence"
```

### Checks

```bash
test -f docs/drills/postgres_failover_report.md
test -f docs/reliability_reports/backup_verification_2026-Q2.md
test -f docs/drills/chaos_drill_report_wave1.md
test -f docs/drills/region_failover_gameday.md
test -f docs/operator_onboarding_pack.md
test -f docs/drills/cross_operator_federation_drill.md
rg -n "G2|G3|deferred-with-signoff|Evidence" docs/project_completion_tracker.md
```

---

## 5) WS-C — Fully usable server test matrix (hard gate)

### Objective

Demonstrate end-to-end server usability across build, startup, API health, federation-critical paths, durability, and operator readiness.

### AI prompt (copy/paste)

```text
You are working in this repository. Produce a server-usability validation pass and publish results.

Required outputs:
1) A new docs/server_usability_validation.md report.
2) Command log with pass/fail status for:
   - environment/build sanity
   - service startup and health endpoint checks
   - core API smoke tests (auth, room create/join/send/read where available)
   - federation-related smoke tests in this environment (or explicit non-runnable notes)
   - backup/restore verification command checks
   - representative regression test subset for touched subsystems
3) A blockers table: blocker, severity, owner, next action date.
4) Recommendation: deployable / not deployable.

Rules:
- Run what is feasible in this environment.
- For non-runnable items, include exact command and required environment.
- Prefer existing scripts/docs over ad-hoc steps.

Commit message prefix: "docs: publish server usability validation"
```

### Suggested checks (adapt to environment)

```bash
python -V
cargo --version
pytest -q tests -k "federation or media or handlers"
python scripts-dev/check_marker_budget.py
rg -n "health|ready|liveness" synapse docs
```

---

## 6) WS-D — Tracker closure + release recommendation

### Objective

Finalize completion accounting so release/deployment decision is explicit and auditable.

### AI prompt (copy/paste)

```text
You are working in this repository. Finalize tracker state after readiness workstreams.

Tasks:
1) Update docs/project_completion_tracker.md with latest statuses/evidence links.
2) Update INCOMPLETE_WORK.md with final wave totals and remaining deferred items.
3) Create or update docs/project_completion_closure_report.md with:
   - gate-by-gate PASS/FAIL
   - evidence links
   - residual deferred items with signoff
   - final recommendation: complete / not complete

Validation:
- No required-now item lacks owner/date/evidence.
- Any deferred item has explicit signoff and re-evaluation trigger.

Commit message prefix: "docs: finalize server readiness closure state"
```

### Checks

```bash
rg -n "^- \[ \]" docs/project_completion_tracker.md
rg -n "owner|due|evidence|signoff|re-evaluation" docs/project_completion_tracker.md
rg -n "recommendation: complete|recommendation: not complete" docs/project_completion_closure_report.md
```

---

## 7) Deployment decision rubric

Server can be considered **fully usable for deployment** only when all are true:

- Marker budget check passes and trend is non-increasing.
- Runtime-path request-serving Not-Implemented exceptions are zero/unrisked.
- G2/G3 evidence artifacts exist and are linked from tracker.
- Server usability validation report recommends **deployable**.
- Closure report has no blocking risk marked open without owner/date.

If any condition fails, classify release as **not deployable yet** and continue wave execution.
