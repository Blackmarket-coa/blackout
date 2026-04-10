# Scope alignment evidence log

_Date: 2026-02-20_

This page captures objective evidence produced while executing the actions in
`docs/project_scope_alignment_report.md`. It is intended to be updated as each
workstream advances, and linked from `docs/project_completion_tracker.md`.

## 1) Ownership assignments (report action 8)

The tracker required all placeholder ownership slots to be replaced with explicit
accountable owners. The assignments below are now the active defaults.

| Domain | Accountable owner | Backup owner | Notes |
|---|---|---|---|
| Code debt (A) | Core Server Maintainers | Release Manager | Owns marker triage and budget gate. |
| Runtime correctness (B) | Runtime Reliability Lead | Core Server Maintainers | Owns `NotImplementedError` runtime-path audit policy. |
| SRE/HA (C,D) | SRE Lead | Platform Operations Lead | Owns SLOs, alerts, and HA drill execution. |
| Data durability/DR (E) | Database Reliability Lead | SRE Lead | Owns backup verification + restore drill pass rate. |
| Incident/process (F) | Incident Commander Lead | On-call Manager | Owns runbook set and postmortem policy compliance. |
| Federation refactor (H) | Federation Architecture Lead | Core Server Maintainers | Owns H4-H11 technical closure sequencing. |
| Crypto/security (H6,H10) | Security Engineering Lead | Federation Architecture Lead | Owns encrypted-flow review + security checklist integration. |
| Migration/cutover (H11) | Release Engineering Lead | Platform Operations Lead | Owns dual-write/shadow-read/canary/cutover/rollback plan. |

## 2) Governance cadence with accountable roles

| Cadence | Meeting purpose | Accountable owner | Required outputs |
|---|---|---|---|
| Weekly | Update tracker status and metrics trend | Core Server Maintainers | Tracker status edits + metric deltas posted. |
| Bi-weekly | Marker backlog triage + budget decisions | Release Manager | Classified queue (`intentional/defer/must-fix`) and scope changes. |
| Monthly | SLO review and reliability risk ranking | SRE Lead | SLO attainment report and error-budget decision record. |
| Quarterly | Restore/failover drill and checklist recertification | Database Reliability Lead | Drill evidence pack + acceptance checklist refresh. |

## 3) Reliability SLO definitions finalized (report action 2 / tracker C1)

The following SLO set is now the canonical baseline for C1:

1. **Availability SLO**
   - Objective: monthly API availability >= 99.95%.
   - SLI: successful authenticated client API requests / total authenticated client API requests.
   - Burn policy: freeze non-critical releases if monthly error-budget consumption exceeds 50%.

2. **Federation recovery SLO**
   - Objective: backlog returns to normal within 15 minutes after induced or real incident.
   - SLI: `% incidents where federation backlog <= baseline threshold by T+15m`.
   - Breach budget: <= 4 missed recovery windows per calendar month.

3. **Data durability / DR SLOs**
   - Objective: RPO <= 1 minute.
   - Objective: RTO <= 5 minutes for primary database failover.
   - SLI sources: WAL shipping lag, replica catch-up lag, failover completion timestamps.

These values are consistent with the reliability targets in
`docs/distributed_self_healing_blueprint.md` and are now referenced by the
completion tracker as the accepted C1 definition.

## 4) 30/60/90 rollout ownership evidence (report action 6)

The rollout milestones remain open (`G1-G3`), but owner assignment is now
explicit so execution can proceed without governance ambiguity.

| Milestone | Target window | Accountable owner | Evidence artifacts required |
|---|---|---|---|
| G1 | Day 0-30 | Platform Operations Lead | worker+Redis rollout record, health-check policy proof, initial SLO dashboards |
| G2 | Day 31-60 | SRE Lead | PostgreSQL failover drill report, backup verification pipeline run logs, first chaos drill report |
| G3 | Day 61-90 | Incident Commander Lead | region-failover game-day report, operator onboarding publication, cross-operator federation drill report |

## 5) Immediate next execution steps

1. Maintain A-workstream marker hygiene: continue weekly inventory publication,
   bi-weekly triage refresh, and marker-budget enforcement checks.
2. Close rollout workstream milestones G1-G3 by attaching the listed evidence
   artifacts (owner-assigned in section 4) and updating
   `docs/project_completion_tracker.md` statuses.
3. Append concrete drill evidence artifacts for D3/D6/F3 and cross-link them
   from this document and the completion tracker closure notes.
4. Continue monthly C4 reporting by adding the next report artifact under
   `docs/reliability_reports/` and recording error-budget actions.


## 6) Data durability execution evidence (E1-E4)

- E1: Daily full backup + WAL archival workflow implemented and documented:
  `scripts-dev/blackout/backup_run.sh` + `docs/backup_and_dr_operations.md`.
- E2: Backup verification pipeline implemented:
  `scripts-dev/blackout/backup_verify.sh` (scheduled daily, report output preserved).
- E3: Quarterly restore drill implemented:
  `scripts-dev/blackout/quarterly_restore_drill.sh` with pass criterion based on
  successful control-data inspection of restored PGDATA.
- E4: Replication/lag/capacity alerting implemented:
  `contrib/prometheus/blackout-dr.rules` and Prometheus wiring guidance in
  `contrib/prometheus/README.md`.
