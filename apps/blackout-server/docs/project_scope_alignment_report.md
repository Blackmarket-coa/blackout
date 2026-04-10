# Project scope alignment report (2026-02-20)

This report summarizes what remains to align implementation and operations with the stated project scope in:

- `docs/project_completion_tracker.md`
- `docs/distributed_self_healing_blueprint.md`
- `README.rst`

## Executive status

The project is **not yet aligned** with scope. The largest gaps are:

1. **Code/test debt closure workflow** is only partially underway (A1 in progress, A2-A5 not started).
2. **Reliability/SLO implementation** workstream (C1-C4) is not started.
3. **HA/self-healing deployment controls** (D1-D6) are not started.
4. **Backup/restore and DR readiness** (E1-E4) is not started.
5. **Operational maturity** (F1-F4) is not started.
6. **30/60/90 rollout milestones** (G1-G3) are not started.
7. **Ownership assignments** remain unassigned placeholders across all major domains.

## Required actions to reach scope completion

### 1) Close code and test debt gates

- Complete marker triage (`intentional`, `defer`, `must-fix`) and publish owner-backed queue.
- Burn down production-path `must-fix` markers to zero.
- Resolve stale backlog markers in tests/docs that no longer represent planned work.
- Enforce a marker budget policy in CI for new changes.

### 2) Stand up reliability/SLO practice

- Finalize explicit SLOs for availability, federation recovery, and RPO/RTO.
- Add direct instrumentation for each SLO and wire alert thresholds/paging.
- Start monthly SLO reporting cadence.

### 3) Implement and validate HA/self-healing controls

- Deploy the target worker topology + Redis coherence model.
- Validate PostgreSQL HA failover under drill conditions.
- Validate reverse proxy/LB health routing and service liveness/readiness checks.
- Exercise and prove automated rollback on bad deployments.

### 4) Establish data durability + DR operations

- Operate daily full backups + incremental/WAL backups.
- Add automated backup verification.
- Run and pass quarterly restore drills.
- Add alerting for replication lag and storage pressure.

### 5) Raise incident and runbook maturity

- Map threat scenarios to: detection, automated response, runbook.
- Complete runbooks for DNS, cert expiry, region loss, and bad rollout.
- Execute recurring chaos drills and adopt postmortem checklist usage.

### 6) Complete rollout and acceptance gates

- Deliver 30/60/90 milestones and mark G1-G3 complete with objective evidence.
- Meet Gate 1, Gate 2, and Gate 3 exit criteria in tracker.
- Satisfy blueprint acceptance checklist (no SPOFs, recent restore/failover drills, federation backlog recovery validation, telemetry review, error budget policy, runbook review).

### 7) Assign owners and governance now

- Replace all unassigned placeholder roles in tracker ownership template.
- Establish weekly/bi-weekly/monthly/quarterly governance cadence with named accountable owners.

## Suggested execution order (near-term)

1. **Week 1:** Assign owners, finish A2 classification, finalize SLO definitions (C1), and publish milestone owners for D/E/F/G/H.
2. **Weeks 2-4:** Deliver minimum viable instrumentation + alerting (C2/C3), and bootstrap backup verification + first restore drill prep (E2/E3).
3. **Month 2:** Validate HA/failover + rollback drills (D3/D6), complete mandatory runbooks (F2), and execute first chaos drill (F3).
4. **Month 3:** Close Gate 1 evidence and complete G1/G2/G3 evidence pack.

## Definition of “aligned with scope”

The repository can be considered aligned when:

- Tracker workstreams A-H meet their completion conditions,
- milestone gates 1-3 are evidenced,
- blueprint acceptance checklist is fully checked,
- and ownership/governance fields are populated and active.
