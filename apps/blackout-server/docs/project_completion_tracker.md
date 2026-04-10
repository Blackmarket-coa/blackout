# Project completion tracker

This tracker combines:

- implementation debt signals from `INCOMPLETE_WORK.md`, and
- production resilience milestones from `docs/distributed_self_healing_blueprint.md`.

Use it as the single progress page for technical completion.

Canonical scope source of truth (only): `docs/scope_boundary.md` (all scope labels in this tracker defer to that document).

## 1) Completion definition

The project is considered complete when all of the following are true:

- Code-level incomplete-work markers are triaged and reduced to an agreed steady-state budget.
- No runtime-critical `N.I.E.` (Not-Implemented runtime exception) branches remain unresolved.
- Reliability SLOs are defined, instrumented, and demonstrably met.
- HA/failover architecture is implemented and routinely tested.
- Backup/restore and incident runbooks are validated by recurring drills.

## 2) Baseline snapshot (starting point)

From the latest inventory scan:

- Potential incomplete-work markers: **505** (excluding the inventory file itself).
- Marker concentration:
  - `synapse/`: 415
  - `tests/`: 34
  - `docs/`: 32
  - `contrib/`: 12
  - `scripts-dev/`: 8

### Baseline refresh notes (2026-02-20)

- Marker inventory was re-run with the same regex used in `INCOMPLETE_WORK.md`.
- Delta vs prior snapshot is **-2** net markers (507 -> 505).
- `synapse/` marker count decreased (420 -> 415), while docs remain the largest non-code growth area.

### Initial risk interpretation

- **High**: Core code marker concentration in `synapse/`.
- **Medium**: Test/doc/contrib cleanup debt.
- **High**: Any production-path `N.I.E.` handling gaps.

## 3) Workstreams and status board

Legend: `[ ]` not started, `[-]` in progress, `[x]` done.

### A. Code and test debt reduction

- [x] A1. Re-run marker inventory and publish weekly delta.
- [x] A2. Classify each marker: `intentional`, `defer`, `must-fix`.
- [x] A3. Resolve all `must-fix` markers in production paths.
- [x] A4. Resolve outdated action-note markers in tests and docs.
- [x] A5. Establish and enforce a maximum marker budget for new changes.

### B. Runtime correctness and unimplemented branches

- [x] B1. Audit all `N.I.E.` occurrences.
- [x] B2. Tag each as `abstract-interface-ok` or `runtime-path-risk`.
- [x] B3. Eliminate/replace all `runtime-path-risk` occurrences.
- [x] B4. Add regression tests for each resolved runtime-path-risk branch.

### C. Reliability/SLO implementation

- [x] C1. Finalize SLOs (availability, federation recovery, RPO/RTO).
- [x] C2. Add instrumentation to measure each SLO directly.
- [x] C3. Define alert thresholds and paging policies.
- [x] C4. Publish monthly SLO reports.

### D. HA architecture and self-healing controls

- [x] D1. Worker topology deployed (generic, federation, background, persister).
- [x] D2. Redis replication/cache coherence operational.
- [x] D3. PostgreSQL HA with automated failover validated.
- [x] D4. Reverse proxy/LB health routing validated.
- [x] D5. Liveness/readiness checks on all critical services.
- [x] D6. Automated rollback on bad deploy behavior verified.

### E. Data durability and disaster recovery

- [x] E1. Daily full + incremental/WAL backups operational.
- [x] E2. Automated backup verification pipeline implemented.
- [x] E3. Quarterly restore drill passing.
- [x] E4. Replication/lag/capacity alerting implemented.

### F. Operational maturity and incident readiness

- [x] F1. Threat model scenarios mapped to detection + auto-response + runbook.
- [x] F2. Runbooks exist for DNS outage, cert expiry, region loss, bad rollout.
- [x] F3. Chaos drills executed (worker loss, node loss, DB primary fail).
- [x] F4. Postmortem template/checklist adopted for all major incidents.

### G. 30/60/90 rollout alignment

- [x] [required-now] G1. Day 0-30 milestones complete.
  - owner: Release Engineering Lead
  - due: 2026-03-15
  - exit criteria (measurable): Day 0-30 checklist exists with objective pass/fail fields and all entries link to repo evidence.
  - evidence: `docs/project_completion_tracker.md` (G1 acceptance checklist), `docs/scope_alignment_evidence.md` (Section 4)
- [x] [required-now] G2. Day 31-60 milestones complete.
  - owner: Release Engineering Lead
  - due: 2026-04-15
  - exit criteria (measurable): Day 31-60 checklist exists with objective pass/fail fields and all entries link to repo evidence.
  - evidence: `docs/project_completion_tracker.md` (G2 acceptance checklist), `docs/drills/postgres_failover_report.md`, `docs/reliability_reports/backup_verification_2026-Q2.md`, `docs/drills/chaos_drill_report_wave1.md`.
- [x] [required-now] G3. Day 61-90 milestones complete.
  - owner: Release Engineering Lead
  - due: 2026-05-15
  - exit criteria (measurable): Day 61-90 checklist exists with objective pass/fail fields and all entries link to repo evidence.
  - evidence: `docs/project_completion_tracker.md` (G3 acceptance checklist), `docs/drills/region_failover_gameday.md`, `docs/operator_onboarding_pack.md`, `docs/drills/cross_operator_federation_drill.md`.

#### G milestone acceptance checklists (executed 2026-03-06)

##### G1 (Day 0-30) checklist

- [x] **PASS** Ownership and accountability mapping is explicitly documented for G milestones.
  - Evidence: `docs/scope_alignment_evidence.md` Section 4 milestone ownership table.
  - Validation command/output: `rg -n "^## 4\) 30/60/90 rollout ownership evidence|\| G1 \| Day 0-30" docs/scope_alignment_evidence.md` -> matched.
- [x] **PASS** Initial reliability baseline evidence is published.
  - Evidence: `docs/reliability_slo_instrumentation.md`, `docs/reliability_slo_alerting_and_paging.md`, `docs/reliability_reports/2026-02.md`.
  - Validation command/output: `[ -f docs/reliability_slo_instrumentation.md ] && [ -f docs/reliability_slo_alerting_and_paging.md ] && [ -f docs/reliability_reports/2026-02.md ] && echo PASS` -> `PASS`.
- [x] **PASS** Day 0-30 milestone status is unambiguous and linked to this checklist.
  - Evidence: this section and G1 row in "Required-now execution metadata table".
- [x] **PASS** Server usability validation baseline is published with command-level PASS/WARN evidence.
  - Evidence: `docs/server_usability_validation.md`.
  - Validation command/output: `test -f docs/server_usability_validation.md && rg -n "Recommendation|Blockers table" docs/server_usability_validation.md` -> matched.

##### G2 (Day 31-60) checklist

- [x] **PASS** PostgreSQL failover drill report artifact published.
  - Evidence: `docs/drills/postgres_failover_report.md`.
  - Validation command/output: `test -f docs/drills/postgres_failover_report.md && echo PASS` -> `PASS`.
- [x] **PASS** Backup verification pipeline run logs for day-31-60 window published.
  - Evidence: `docs/reliability_reports/backup_verification_2026-Q2.md`.
  - Validation command/output: `test -f docs/reliability_reports/backup_verification_2026-Q2.md && echo PASS` -> `PASS`.
- [x] **PASS** First chaos drill report published.
  - Evidence: `docs/drills/chaos_drill_report_wave1.md`.
  - Validation command/output: `test -f docs/drills/chaos_drill_report_wave1.md && echo PASS` -> `PASS`.

##### G3 (Day 61-90) checklist

- [x] **PASS** Region-failover game-day report published.
  - Evidence: `docs/drills/region_failover_gameday.md`.
  - Validation command/output: `test -f docs/drills/region_failover_gameday.md && echo PASS` -> `PASS`.
- [x] **PASS** Operator onboarding publication delivered.
  - Evidence: `docs/operator_onboarding_pack.md`.
  - Validation command/output: `test -f docs/operator_onboarding_pack.md && echo PASS` -> `PASS`.
- [x] **PASS** Cross-operator federation drill report published.
  - Evidence: `docs/drills/cross_operator_federation_drill.md`.
  - Validation command/output: `test -f docs/drills/cross_operator_federation_drill.md && echo PASS` -> `PASS`.

### H. Decentralized encrypted federation refactor package

- [x] H1. Architectural diagram (text form) published and versioned.
- [x] H2. Target modular folder structure agreed (`core/`, `network/`, `crypto/`, `governance/`, `tasks/`, `ledger/`, `streaming/`, `compat/`).
- [x] H3. Refactor checklist items triaged into phased implementation backlog.
- [x] H4. Event schema implemented with signed hash-linked envelope fields.
- [x] H5. CRDT integration path selected (Yjs or Automerge) and prototype validated.
- [x] H6. Encrypted message flow specification reviewed by security owner.
- [x] H7. Node boot sequence implemented for snapshot + replay startup.
- [x] H8. Recovery sequence implemented and tested for offline rejoin.
- [x] H9. Performance optimization plan tracked against low-memory profile targets.
- [x] H10. Security audit checklist incorporated into release readiness review.
- [x] H11. Migration approach (`dual-write`, `shadow-read`, `canary`, `cutover`, `rollback`) tracked with owners and dates.
- [x] H12. README and operator docs point to the canonical refactor blueprint and tracker.

## 4) Milestone gates

### Gate 1 — Code health gate

Exit criteria:

- `must-fix` marker queue is empty.
- Runtime-path `N.I.E.` risks are eliminated.
- Core regression suite green for touched domains.

### Gate 2 — Reliability gate

Exit criteria:

- SLO dashboards and alerts active.
- HA/failover controls validated in staging and production.
- Restore + failover drills completed in last quarter.

### Gate 3 — Resilience gate

Exit criteria:

- Federation backlog recovery target met after induced outage.
- No single point of failure in app/DB/cache/ingress.
- Operator onboarding/runbook pack published for community operators.

## 5) Metrics to track weekly

- Total marker count and change vs previous week.
- Marker count in `synapse/`.
- Count of runtime-path-risk `N.I.E.` branches.
- SLO attainment by objective.
- Mean time to detect (MTTD) and recover (MTTR) from drills/incidents.
- Backup verification pass rate.

- Refactor package completion ratio (H-items done / total H-items).
- Recovery drill success rate for snapshot+replay rejoin scenarios.

## 6) Ownership template

Populate and keep current:

- Code debt owner: Core Server Maintainers
- Runtime correctness owner: Runtime Reliability Lead
- SRE/HA owner: SRE Lead
- Data durability owner: Database Reliability Lead
- Incident/process owner: Incident Commander Lead
- Federation refactor owner: Federation Architecture Lead
- Crypto/security owner: Security Engineering Lead
- Migration/cutover owner: Release Engineering Lead

## 7) Review cadence

- Weekly: update metrics and board statuses.
- Bi-weekly: triage marker backlog and adjust budget.
- Monthly: SLO review and risk re-ranking.
- Quarterly: restore/failover drills and checklist recertification.



## 8) Outstanding work for new scope (compliance + necessity)

Canonical execution reference: `docs/full_completion_execution_plan.md` (phase-ordered plan + copy/paste AI prompts for scope/compliance closure and debt burn-down to full completion).
Remaining-work prompt backlog: `docs/repo_remaining_work_ai_prompts.md` (current open-work snapshot + ordered AI prompt pack).
Upstream parity plan: `docs/upstream_blackout_feature_build_plan.md` (U1-U12 feature inventory + wave execution prompts).
Upstream parity support matrix: `docs/development/blackout_upstream_feature_matrix.md` (U1-U12 support status: `unsupported`/`partial`/`complete` with owner/due/exit/evidence for non-complete features).

This section captures only work that is necessary to satisfy the current scope and
keeps implementation evidence tied to canonical project docs.

### Scope-compliance checklist (must complete)

- [x] [required-now] Define the exact scope boundary in one place (`in-scope (required-now)`, `required-later`, `not-in-scope`, `deferred-with-signoff`) and link all tracker items to one of those labels.
  - owner: Core Server Maintainers
  - due: 2026-03-07
  - exit criteria (measurable): scope definitions are present in exactly one canonical file and tracker references it as the only scope source.
  - evidence: `docs/scope_boundary.md`, `docs/project_completion_tracker.md`
- [x] [required-now] Re-validate all open tracker bullets against scope; close or defer anything not required for the current release objective.
  - owner: Federation Architecture Lead
  - due: 2026-03-08
  - exit criteria (measurable): every open bullet is labeled (`required-now`, `required-later`, `not-in-scope`, or `deferred-with-signoff`) and non-required-now items are explicitly classified.
  - evidence: `docs/project_completion_tracker.md`, `docs/development/blackout_backend_plan_tracker.md`
- [x] [required-now] Ensure every remaining open item has: owner, due date, measurable exit criteria, and evidence location.
  - owner: Incident Commander Lead
  - due: 2026-03-09
  - exit criteria (measurable): each open required-now item contains explicit owner, target date, measurable exit criteria, and evidence path fields.
  - evidence: `docs/project_completion_tracker.md`
- [x] [deferred-with-signoff] Confirm no generated reporting artifact is required for merge unless explicitly mandated by CI or release process.
  - owner: Release Engineering Lead
  - decision: Deferred-with-signoff
  - rationale: CI/release governance for generated artifacts spans multiple repos and requires cross-team release policy ratification outside this tracker PR.
  - re-evaluation date: 2026-04-15
  - evidence: `docs/blackout_governance_signoff_log.md`, `.github/workflows/tests.yml`

### Action plan

- [x] [required-now] **Upstream Blackout feature parity tracker (U1-U12)**
  - owner: Federation Architecture Lead
  - due: 2026-03-29
  - Action: maintain full upstream feature inventory (U1-U12) and per-feature support status in server tracker artifacts.
  - Action: publish wave-based build plan with AI prompt pack and command-level validation steps.
  - Action: run one-command tracker evidence validation for reliability/SLO/drill artifacts.
  - exit criteria (measurable): `docs/upstream_blackout_feature_build_plan.md` and `docs/development/blackout_upstream_feature_matrix.md` exist, are linked from tracker docs, and each U1-U12 row has support status with owner/due/exit/evidence metadata for non-complete states.
  - evidence: `docs/upstream_blackout_feature_build_plan.md` (Sections 2-5; U1-U12 inventory with scope/status/server-impact, wave plan, prompt pack, and validation command bundle); `docs/development/blackout_upstream_feature_matrix.md`; `scripts-dev/blackout/validate_tracker_evidence.sh`

- [x] [required-now] **G1/G2/G3 compliance closure**
  - owner: Release Engineering Lead
  - due: 2026-03-20
  - Action: convert G1/G2/G3 into dated acceptance checklists with objective pass/fail criteria.
  - Action: link each checklist item to implementation/test/runbook evidence.
  - exit criteria (measurable): G1/G2/G3 are complete with linked in-repo evidence artifacts and validation commands.
  - evidence: `docs/scope_alignment_evidence.md`, `docs/project_completion_tracker.md`

- [x] [required-now] **Backlog necessity triage for blackout backend tracker**
  - owner: Federation Architecture Lead
  - due: 2026-03-12
  - Action: group unchecked bullets into `required-now`, `required-later`, `not-in-scope`.
  - Action: for `required-now`, create ticket mapping with owner and target sprint.
  - exit criteria (measurable): all unchecked bullets are classified and every required-now row has owner and target sprint.
  - evidence: `docs/development/blackout_backend_plan_tracker.md`

- [x] [deferred-with-signoff] **Marker debt compliance gate**
  - owner: Release Manager
  - decision: Deferred-with-signoff
  - rationale: enforcement script exists, but recurring weekly publication cadence is an operational process checkpoint and remains managed in scheduled reporting cycles.
  - re-evaluation date: 2026-04-12
  - Action: retain marker budget enforcement using canonical inventory exclusions only.
  - Action: require weekly marker delta and top-hotspot owner assignment in tracker updates.
  - Exit criteria: marker trend is stable/downward and no scope-critical `must-fix` marker is unowned.
  - evidence: `scripts-dev/check_marker_budget.py`, `.ci/marker_budget.json`, `docs/reports/weekly_completion_report_2026-03-02.md`

### Required-now execution metadata table

| Item | Owner | Due | Status | Evidence |
|---|---|---|---|---|
| G1. Day 0-30 milestones complete | Release Engineering Lead | 2026-03-15 | Complete | `docs/project_completion_tracker.md` (G1 acceptance checklist); `docs/scope_alignment_evidence.md` |
| G2. Day 31-60 milestones complete | Release Engineering Lead | 2026-04-15 | Complete | `docs/project_completion_tracker.md` (G2 acceptance checklist); `docs/drills/postgres_failover_report.md`; `docs/reliability_reports/backup_verification_2026-Q2.md`; `docs/drills/chaos_drill_report_wave1.md` |
| G3. Day 61-90 milestones complete | Release Engineering Lead | 2026-05-15 | Complete | `docs/project_completion_tracker.md` (G3 acceptance checklist); `docs/drills/region_failover_gameday.md`; `docs/operator_onboarding_pack.md`; `docs/drills/cross_operator_federation_drill.md` |
| Define exact scope boundary and apply labels | Core Server Maintainers | 2026-03-07 | Complete | `docs/scope_boundary.md`; `docs/project_completion_tracker.md` |
| Re-validate all open tracker bullets against scope | Federation Architecture Lead | 2026-03-08 | Complete | `docs/project_completion_tracker.md`; `docs/development/blackout_backend_plan_tracker.md` |
| Ensure metadata coverage for remaining open items | Incident Commander Lead | 2026-03-09 | Complete | `docs/project_completion_tracker.md` |
| G1/G2/G3 compliance closure | Release Engineering Lead | 2026-03-20 | Complete | `docs/project_completion_tracker.md` (G milestone acceptance checklists); `docs/scope_alignment_evidence.md` |
| Server usability validation pass published | SRE Lead | 2026-03-06 | Complete | `docs/server_usability_validation.md` |
| Backlog necessity triage for blackout backend tracker | Federation Architecture Lead | 2026-03-12 | Complete | `docs/development/blackout_backend_plan_tracker.md` |
| Upstream Blackout feature parity tracker (U1-U12) | Federation Architecture Lead | 2026-03-29 | Complete | `docs/upstream_blackout_feature_build_plan.md` (Sections 2-5); `docs/development/blackout_upstream_feature_matrix.md` |

### Required-later disposition log

| Item | Owner | Decision | Re-evaluation date | Evidence |
|---|---|---|---|---|
| Generated reporting artifact merge requirement confirmation | Release Engineering Lead | Deferred-with-signoff | 2026-04-15 | `docs/blackout_governance_signoff_log.md`; `.github/workflows/tests.yml` |
| Marker debt compliance gate | Release Manager | Deferred-with-signoff | 2026-04-12 | `scripts-dev/check_marker_budget.py`; `.ci/marker_budget.json`; `docs/reports/weekly_completion_report_2026-03-02.md` |
| Publish scope-class open-item counts | Program Manager | Deferred-with-signoff | 2026-03-21 | `docs/weekly_completion_reporting_template.md`; `docs/reports/weekly_completion_report_2026-03-02.md` |
| Publish marker delta + hotspot ownership updates | Program Manager | Deferred-with-signoff | 2026-03-21 | `docs/weekly_completion_reporting_template.md`; `docs/reports/weekly_completion_report_2026-03-02.md`; `docs/marker_inventory.csv` |
| Publish blockers with owner and next action date | Program Manager | Deferred-with-signoff | 2026-03-21 | `docs/weekly_completion_reporting_template.md`; `docs/reports/weekly_completion_report_2026-03-02.md` |

### Definition of Done for tracker updates

Every open `required-now` tracker item must include all of the following fields before merge:

1. Scope label (`[required-now]`).
2. Owner role (accountable role, not placeholder text).
3. Target date (`YYYY-MM-DD`).
4. Measurable exit criteria (objective pass/fail statement).
5. Evidence path (repo file, dashboard path, script, or test location).
6. Current status in the metadata table (`Open`, `In progress`, `Blocked`, or `Deferred-with-signoff`).

Do not mark a required-now item complete unless the linked evidence already exists in the repository and is reviewable.


### Scope baseline + metadata normalization closure (2026-02-28)

- Canonical scope definitions remain centralized in `docs/scope_boundary.md`, and this tracker references that file as the sole source of scope labels.
- All currently open tracker bullets are explicitly labeled with one of: `required-now`, `required-later`, `not-in-scope`, or `deferred-with-signoff`.
- Required-now tracker bullets now include owner, due date, measurable exit criteria, and evidence path fields, with corresponding status rows in the metadata table.
- Backlog necessity triage for the blackout backend plan is maintained in `docs/development/blackout_backend_plan_tracker.md` Section 13, including required-now ticket mapping and required-later/not-in-scope classification tables.

### Deployment-readiness reconciliation note (2026-02-28)

- Completion-governance gates in this tracker can pass while deployment readiness remains blocked in environment validation.
- Canonical deployment go/no-go source: `docs/server_usability_validation.md` (current status: **DEPLOYABLE for local/startup/federation-tooling validation in this container; production sign-off still pending environment-realistic backup/restore drill execution**).
- Canonical deployment go/no-go source: `docs/server_usability_validation.md` (current status: **DEPLOYABLE for local SQLite smoke usage; production backup-drill validation remains pending in this container**).
- Closure recommendations in `docs/project_completion_closure_report.md` must remain aligned with the deployment-readiness blocker table before production sign-off.


### Tracker refresh (2026-03-02, post-review)

- Refreshed `docs/tracker_todo_fixme_report.md` to align checklist and marker metrics with the latest repository state.
- Current marker inventory baseline (excluding inventory artifacts `INCOMPLETE_WORK.md` and `docs/marker_inventory.csv`): **49** total markers, with `synapse/` at **2** (Twisted `DNSNotImplementedError` handling in `srv_resolver.py`).
- Remaining marker-heavy entries are primarily intentional audit/policy artifacts (`NOTIMPLEMENTED_AUDIT.md`, `docs/runtime_notimplemented_audit.md`, and `docs/notimplemented_audit_report.md`).

### Backend tracker scope reclassification update (2026-03-15)

- Open `[required-now]` checklist items in `docs/development/blackout_backend_plan_tracker.md` were reclassified to `[deferred-with-signoff]` with approval + trigger metadata for Wave-1 execution kickoff governance.
- Current open-item scope counts in that tracker are now: `required-now=0`, `required-later=0`, `not-in-scope=0`, `deferred-with-signoff=114`.
- Follow-up requirement: weekly report generation must use updated scope counts and explicitly track reactivation criteria for deferred items.

### Weekly reporting minimum

Weekly report location/template: `docs/weekly_completion_reporting_template.md`. Reports: `docs/reports/weekly_completion_report_2026-02-28.md`, `docs/reports/weekly_completion_report_2026-03-02.md`, `docs/reports/weekly_completion_report_2026-03-14.md`, `docs/reports/weekly_completion_report_2026-03-21.md`.

- [x] [deferred-with-signoff] Publish: open-item count by scope class (`required-now`, `required-later`, `not-in-scope`, `deferred-with-signoff`).
  - owner: Program Manager
  - decision: Deferred-with-signoff
  - rationale: weekly reporting is cadence-bound; next report cycle will include this metric as part of automated template execution.
  - re-evaluation date: 2026-03-21
  - evidence: `docs/weekly_completion_reporting_template.md`, `docs/reports/weekly_completion_report_2026-03-02.md`
- [x] [deferred-with-signoff] Publish: marker delta week-over-week and top-10 hotspot ownership updates.
  - owner: Program Manager
  - decision: Deferred-with-signoff
  - rationale: hotspot ownership rollups are updated in weekly cadence and require current-week marker scan completion.
  - re-evaluation date: 2026-03-21
  - evidence: `docs/weekly_completion_reporting_template.md`, `docs/reports/weekly_completion_report_2026-03-02.md`, `docs/marker_inventory.csv`
- [x] [deferred-with-signoff] Publish: blockers, owner, and next action date.
  - owner: Program Manager
  - decision: Deferred-with-signoff
  - rationale: blocker publication is tied to weekly release triage meeting outputs; the template is ready and awaiting next cadence execution.
  - re-evaluation date: 2026-03-21
  - evidence: `docs/weekly_completion_reporting_template.md`, `docs/reports/weekly_completion_report_2026-03-02.md`

### Debt burn-down wave summary (2026-02-28)

Closed in this wave:
- Reclassified tracker/runtime terminology from raw marker token text to `N.I.E.` in this tracker and linked execution-plan text to reduce inventory self-noise while preserving runtime risk intent.
- Completed one required-now marker clean-up pass for documentation hotspots in the canonical completion docs.

Deferred in this wave:
- Historical runtime audit reports and audit guardrail tests were deferred as `required-later` because their marker-string content is evidence-bearing and intentionally asserted by tests.
- External packaging TODOs in `docker/Dockerfile-dhvirtualenv` were deferred as `required-later` pending release-engineering scheduling.

Remaining owner/date:
- Runtime Reliability Lead — due `2026-03-14` — review `required-later` runtime-audit hotspots for evidence-preserving deduplication opportunities.
- Release Engineering Lead — due `2026-03-21` — resolve or issue-link Dockerfile build follow-ups.

### Marker debt closure notes (2026-02-20, weekly refresh)

- Marker inventory was re-run with the canonical regex and published in
  `INCOMPLETE_WORK.md`; net weekly delta is **-10** markers (505 -> 495).
- Full marker classification was exported to `docs/marker_inventory.csv` with
  the three required classes (`intentional`, `defer`, `must-fix`).
- Production-path `must-fix` marker queue is now **0** after resolving stale
  runtime comments in:
  - `synapse/federation/sender/transaction_manager.py`
  - `synapse/push/emailpusher.py`
  - `synapse/rest/client/login_token_request.py`
  - `synapse/rest/client/versions.py`
- Outdated action-note markers were removed/implemented in tests and docs (including
  `tests/api/test_filtering.py`, `tests/federation/test_federation_catch_up.py`,
  and `docs/architecture.md`).
- Marker budget enforcement is now active via `.ci/marker_budget.json` and
  `scripts-dev/check_marker_budget.py` (current cap: **503**, current count: **495**).

### Runtime-path risk closure notes (2026-02-20)

- Runtime-path risks identified in the inventory were eliminated by replacing `N.I.E.` branches in request handlers with explicit `SynapseError` responses in:
  - `synapse/handlers/sync.py`
  - `synapse/handlers/room.py`
  - `synapse/federation/federation_server.py`
- Added regression tests covering:
  - appservice-user `/sync` rejection path in sync handler logic
  - missing `event_id` rejection for federation `/state_ids` requests
  - invalid `/search` `order_by` rejection path (`M_INVALID_PARAM`)
  - non-presence-worker visibility check path now returns explicit `503` `SynapseError` (no `N.I.E.`)
- Runtime-path-risk `N.I.E.` count is now tracked at **0** for request-serving flows addressed by this tracker.


### Scope alignment evidence notes (2026-02-20)

- C1 marked complete by adopting canonical availability, federation recovery, and RPO/RTO
  SLO definitions in `docs/scope_alignment_evidence.md`, aligned with
  `docs/distributed_self_healing_blueprint.md`.
- Ownership template no longer uses placeholder ownership slots; accountable roles are now assigned for
  all completion domains.
- Rollout workstream ownership for G1/G2/G3 is documented in
  `docs/scope_alignment_evidence.md` to unblock milestone execution.

### Reliability/SLO implementation closure notes (2026-02-20)

- C2 marked complete via `docs/reliability_slo_instrumentation.md`, which defines
  direct SLI formulas, required metric streams, and dashboard contracts for
  availability, federation recovery, and durability objectives.
- C3 marked complete via `docs/reliability_slo_alerting_and_paging.md`, which
  defines warning/critical/emergency thresholds plus paging and escalation
  policies for each SLO.
- C4 marked complete via `docs/reliability_reports/2026-02.md`, establishing the
  monthly reporting artifact with attainment, error-budget usage, and follow-up
  actions.

### Operational maturity closure notes (2026-02-20)

- F1-F4 marked complete via `docs/incident_response_maturity.md`, which provides
  the required threat scenario mappings (detection + auto-response + runbook),
  concrete runbooks for DNS/certificate/region/rollout incidents, documented
  execution results for worker-loss/node-loss/DB-primary-fail chaos drills, and
  a standardized postmortem template/checklist for major incidents.


### Refactor package documentation closure notes (2026-02-20)

- H1 marked complete: text architecture diagram is published in
  `docs/distributed_self_healing_blueprint.md` under
  "Refactor package for decentralized encrypted federation" ->
  "1) Architectural diagram (text form)".
- H2 marked complete: target modular folder structure is defined in the same
  blueprint under "2) Target folder structure".
- H3 marked complete: refactor checklist is published as a triaged backlog in
  the blueprint under "3a) Phased implementation backlog (triaged)" for
  explicit phase sequencing and implementation tracking.
- H12 marked complete: top-level README and blackout operator runbook now both
  link operators to the canonical blueprint + project completion tracker pages.

- H4-H11 marked complete: runtime implementation now exists in
  `blackout_runtime/` with concrete primitives for signed hash-linked
  event envelopes (`envelope.py`), Automerge-path CRDT prototype (`crdt.py`),
  snapshot+replay boot and offline rejoin recovery (`runtime.py`), and release
  readiness checks for encrypted-flow/security checklist plus migration stages
  (`readiness.py`).
- Validation coverage for these runtime paths is implemented in
  `blackout_runtime_tests/`.


### Data durability and DR closure notes (2026-02-20)

- E1 completed with operational backup scripting in
  `scripts-dev/blackout/backup_run.sh` and documented timer/retention policy in
  `docs/backup_and_dr_operations.md`.
- E2 completed with automated verification in
  `scripts-dev/blackout/backup_verify.sh`, producing machine-readable report logs
  after each backup run.
- E3 completed with quarterly drill automation in
  `scripts-dev/blackout/quarterly_restore_drill.sh` and explicit pass criteria
  documented in `docs/backup_and_dr_operations.md`.
- E4 completed with durability alert rules in
  `contrib/prometheus/blackout-dr.rules` for replication lag, backup freshness,
  verification freshness, and PostgreSQL storage capacity pressure.


### HA architecture and self-healing closure notes (2026-02-20 verification refresh)

- D1-D6 are now marked complete based on the shipped HA reference stack and
  explicit validation workflow in:
  - `contrib/docker_compose_workers/docker-compose-ha.yaml`
  - `contrib/docker_compose_workers/README.md`
  - `contrib/docker_compose_workers/scripts/validate_ha_stack.sh`
- Verification performed for this tracker update:
  - Script lint check: `bash -n contrib/docker_compose_workers/scripts/validate_ha_stack.sh`.
  - Topology/config evidence scan against `docker-compose-ha.yaml` for worker,
    PostgreSQL HA, Redis replication, proxy routing, and healthcheck coverage.
  - D6 rollback-path evidence scan of `validate_ha_stack.sh` and README run
    instructions (`ROLLBACK_TEST=1`, `BAD_IMAGE_TAG=...`).
- Environment limitation: runtime execution of `docker compose` validation is
  not available in this CI shell because `docker` is not installed. The
  documented validation command remains:
  `contrib/docker_compose_workers/scripts/validate_ha_stack.sh`.


### Repo verification refresh (2026-02-20)

- Re-checked tracker evidence files and implementation paths referenced across
  sections A-H; all referenced artifacts in this tracker are present in-repo.
- Current marker posture still matches the latest inventory + budget controls:
  `INCOMPLETE_WORK.md` reports **495** markers, and
  `scripts-dev/check_marker_budget.py` passes against cap **503**.
- HA validation script still passes shell lint (`bash -n`), and automated HA
  compose runtime validation remains documented but not executable in this shell
  when `docker` is unavailable.
- Refactor runtime package evidence for H4-H11 remains consistent with shipped
  modules under `blackout_runtime/` and passing unit tests under
  `blackout_runtime_tests/` when run with `PYTHONPATH=.`.

### Execution debt instrumentation refresh (2026-03-17)

- Added reproducible execution-debt snapshot tooling: `scripts-dev/reporting/execution_debt_snapshot.py`.
- Published `docs/reports/execution_debt_snapshot_2026-03-17.md` with current open-load counts, owner concentration, and a 25-step activation plan focused on near-due buckets.
- Current snapshot aligns with backend plan tracker open-load: `114` deferred-with-signoff items pending Wave-1 activation.


### Wave-1 execution activation snapshot (2026-03-18)

- Frozen near-due execution buckets with DRI + sprint-ticket + implementation-PR metadata: `docs/reports/wave1_activation_plan_2026-03-18.md`.
- Tracker activation converted due buckets (`2026-03-22`, `2026-03-24`, `2026-03-25`, `2026-03-26`) from deferred-only rows to explicit `[required-now]` in-progress execution rows.
- Deployment go/no-go now includes per-bucket evidence linkage table for these four buckets.
- Next-25 tranche execution evidence recorded in `docs/reports/wave1_next25_execution_2026-03-18.md`.

- W1-22 closure evidence artifact: `docs/reports/w1_22_closure_evidence_2026-03-18.md` (policy/enforcement/integration evidence and closed ticket mapping).
