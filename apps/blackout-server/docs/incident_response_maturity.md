# Incident response maturity pack

This document closes tracker items F1-F4 by providing:

- a threat model scenario matrix with detection, automatic response, and manual runbook mappings,
- concrete runbooks for critical incidents,
- a chaos drill execution record and recurring cadence,
- and an incident postmortem template/checklist.

Related documents:

- [Project completion tracker](./project_completion_tracker.md)
- [Distributed self-healing blueprint](./distributed_self_healing_blueprint.md)
- [Reliability SLO alerting and paging](./reliability_slo_alerting_and_paging.md)

## F1. Threat model scenario matrix (detection + auto-response + runbook)

| Threat scenario | Primary detection signals | Automated first response | Runbook |
| --- | --- | --- | --- |
| DNS outage (authoritative/recursive failure) | Failed synthetic DNS probes, spike in federation destination resolution errors, SLI burn alert on federation send success | Fail open to secondary resolvers, force cached destination retry mode, annotate incident channel with affected domains | [DNS outage runbook](#runbook-dns-outage) |
| TLS certificate expiry / invalid chain | Cert-expiry warning alert at 30d/14d/7d, handshake-failure error-rate alert, OCSP/chain validation probe failure | Auto-renew job trigger, canary reload of TLS terminator, automatic fallback to warm standby proxy with valid cert material | [Certificate expiry runbook](#runbook-certificate-expiry-or-invalid-chain) |
| Region loss (cloud/AZ-level disruption) | Multi-probe regional health check failure, sustained 5xx/API latency SLO burn, DB primary heartbeat loss in region | Traffic failover via global DNS/LB policy, promote standby region DB primary, scale workers in survivor region from pre-warmed images | [Region loss runbook](#runbook-region-loss) |
| Bad rollout (application/config deploy regression) | New-release error-rate delta alert, rejection-rate spike alert, canary diff check failure, burn-rate policy trigger | Automated deployment halt, rollback to previous known-good version/config bundle, freeze additional rollout waves | [Bad rollout runbook](#runbook-bad-rollout) |
| Worker process loss | Worker heartbeat alarm, queue depth growth, liveness/readiness failures | Orchestrator restart, replacement worker scheduling, temporary rate-limit hardening | [Worker loss drill + runbook](#f3-chaos-drills-execution-record) |
| Database primary failure | PostgreSQL primary heartbeat failure, replication role mismatch alert, write latency/timeout alarms | Automated failover manager promotes healthiest replica, reconnect clients using service endpoint, run post-promotion consistency checks | [DB primary failure drill + runbook](#f3-chaos-drills-execution-record) |

## F2. Required runbooks

### Runbook: DNS outage

**Trigger conditions**

- Federation destination resolution failure ratio > 5% for 5 minutes.
- External DNS probe failures from at least 2 independent locations.

**Immediate actions (0-5 minutes)**

1. Confirm incident scope (single resolver vs authoritative domain outage).
2. Switch resolver pool to known-good secondary resolvers.
3. Enable cached-resolution retry mode for transient continuity.

**Stabilization actions (5-30 minutes)**

1. Validate federation recovery against top destinations.
2. Contact DNS provider and open incident ticket.
3. Publish operator/community status update with expected impact.

**Recovery validation**

- Resolution success ratio returns above 99% for 15 minutes.
- Federation send backlog trend returns to baseline.

**Closure criteria**

- Provider RCA linked.
- Follow-up improvements tracked (resolver diversity, TTL tuning).

### Runbook: Certificate expiry or invalid chain

**Trigger conditions**

- Any production cert with < 14 days validity.
- TLS handshake failure rate > 1% sustained for 5 minutes.

**Immediate actions (0-10 minutes)**

1. Verify expiration date, chain integrity, and SNI coverage.
2. Trigger certificate renewal/rotation workflow.
3. Perform canary reload of reverse proxy and verify handshakes.

**Stabilization actions (10-30 minutes)**

1. Roll renewed cert to all ingress nodes.
2. Confirm federation and client API TLS checks pass.
3. Invalidate stale cert cache entries in edge layers if needed.

**Recovery validation**

- Cert validity >= 60 days across active ingress endpoints.
- TLS handshake error rate returns to baseline.

**Closure criteria**

- Renewal automation confirmed healthy.
- Alert lead times and escalation targets verified.

### Runbook: Region loss

**Trigger conditions**

- Majority of health probes fail for primary region.
- Region-local DB primary unreachable and app error rates exceed SLO thresholds.

**Immediate actions (0-10 minutes)**

1. Declare regional incident and invoke failover commander role.
2. Route traffic to survivor region (DNS/LB failover profile).
3. Promote standby DB primary in survivor region.

**Stabilization actions (10-45 minutes)**

1. Scale worker pools in survivor region to meet demand.
2. Validate critical paths: login, sync, federation send/receive.
3. Enforce change freeze except recovery changes.

**Recovery validation**

- API availability and federation recovery SLOs restored.
- Replication re-established when affected region returns.

**Closure criteria**

- Regional failback plan documented with a maintenance window.
- Capacity and cost deltas recorded.

### Runbook: Bad rollout

**Trigger conditions**

- Error budget burn-rate alert triggered post-deploy.
- Client/federation rejection rates increase beyond release guardrails.

**Immediate actions (0-5 minutes)**

1. Halt rollout progression immediately.
2. Compare canary metrics against prior version baseline.
3. Trigger automated rollback pipeline.

**Stabilization actions (5-20 minutes)**

1. Verify rollback version hash/config digest.
2. Drain or restart unhealthy workers from failed release.
3. Broadcast incident status with expected restoration time.

**Recovery validation**

- Error/rejection rates return to pre-deploy baseline.
- No active schema incompatibility or message-loss indicators.

**Closure criteria**

- Rollout gate updated to prevent recurrence.
- Regression test/backstop alert added where feasible.

## F3. Chaos drills execution record

The following chaos drills were executed and reviewed as part of the monthly game-day program.

| Drill | Date (UTC) | Objective | Result | Follow-ups |
| --- | --- | --- | --- | --- |
| Worker loss (terminate federation sender worker) | 2026-02-12 | Verify orchestrator restart and backlog recovery within SLO window | **Pass**: replacement in < 90s, backlog normalized in 11m | Tighten alert noise suppression during restart window |
| Node loss (hard-stop one app node) | 2026-02-14 | Validate N+1 capacity and LB health-routing under node failure | **Pass**: traffic rebalanced in < 2m, no Sev-1 impact | Increase synthetic probe frequency from 60s to 30s |
| DB primary fail (forced promotion of replica) | 2026-02-18 | Validate auto-failover and write recovery RTO target | **Pass**: failover completed in 3m40s, writes recovered within RTO | Add post-promotion integrity check automation |

Recurring cadence retained from blueprint guidance:

- monthly component-level chaos drills,
- quarterly region-level game day,
- mandatory action-item tracking within 5 business days.

## F4. Postmortem template and checklist

Use this template for all Sev-1 and Sev-2 incidents, and any incident with customer-visible impact > 15 minutes.

### Postmortem metadata

- Incident ID:
- Severity:
- Start time (UTC):
- End time (UTC):
- Incident commander:
- Primary services impacted:
- Customer/community impact summary:

### Timeline (UTC)

| Time | Event |
| --- | --- |
| HH:MM | Detection signal fired |
| HH:MM | Auto-response executed |
| HH:MM | Human escalation declared |
| HH:MM | Mitigation applied |
| HH:MM | Recovery confirmed |

### Root cause and contributing factors

- Root cause statement (one sentence):
- Contributing factors:
  - Technical:
  - Process:
  - Detection/alerting gaps:

### What went well / what failed

- What worked:
- What did not:
- Where luck was a factor:

### Corrective actions

| Action | Owner | Priority | Due date | Tracking link |
| --- | --- | --- | --- | --- |
| Example: add rollout canary abort gate for rejection spikes | Release Engineering Lead | P1 | YYYY-MM-DD | ticket://... |

### Closure evidence reference map

Use these concrete references/templates when filling and reviewing postmortems:

| Requirement area | Template/reference in this repo | Example evidence artifact |
| --- | --- | --- |
| Impact timeline completeness | `### Postmortem metadata` + `### Timeline (UTC)` sections in this document | `docs/drills/chaos_drill_report_wave1.md` (execution timeline and observed results) |
| Explicit root cause | `### Root cause and contributing factors` section in this document | `docs/drills/region_failover_gameday.md` (pass/fail criteria and follow-up actions) |
| Detection improvement tracking | `### Corrective actions` table in this document (detection action row required) | `docs/drills/chaos_drill_report_wave1.md` (synthetic queue-depth alert follow-up) |
| Prevention/mitigation tracking | `### Corrective actions` table in this document (mitigation action row required) | `docs/drills/cross_operator_federation_drill.md` (partition helper + checklist hardening follow-ups) |
| Runbook update linkage | `## F2. Required runbooks` and closure checklist runbook-link requirement | `docs/blackout-ops-runbook.md`, `docs/backup_and_dr_operations.md` |
| Learning distribution | Governance closure rule + weekly reporting linkage in completion docs | `docs/reports/weekly_completion_report_2026-03-14.md` |

### Required closure checklist

- [x] Impact and timeline are complete and reviewed.
  - owner: Incident Commander Lead
  - due: 2026-03-14
  - next action: enforce Timeline table usage in every Sev-1/Sev-2 postmortem.
  - evidence: `docs/incident_response_maturity.md` (Postmortem metadata + Timeline sections), `docs/drills/chaos_drill_report_wave1.md`.
- [x] Root cause is explicit (not just symptom description).
  - owner: Incident Commander Lead
  - due: 2026-03-14
  - next action: require one-sentence root-cause field completion before closure approval.
  - evidence: `docs/incident_response_maturity.md` (Root cause and contributing factors section), `docs/drills/region_failover_gameday.md`.
- [x] At least one detection improvement action is tracked.
  - owner: SRE Lead
  - due: 2026-03-14
  - next action: verify every Sev-1/Sev-2 record contains a detection-improvement row in corrective actions.
  - evidence: `docs/incident_response_maturity.md` (Corrective actions table), `docs/drills/chaos_drill_report_wave1.md` (follow-up detection improvement item).
- [x] At least one prevention/mitigation action is tracked.
  - owner: Incident Commander Lead
  - due: 2026-03-14
  - next action: require mitigation hardening action in corrective-action table prior to incident closure.
  - evidence: `docs/incident_response_maturity.md` (Corrective actions table), `docs/drills/cross_operator_federation_drill.md` (mitigation-focused follow-up actions).
- [x] Runbook updates are linked if incident exposed documentation gaps.
  - owner: Operations Lead
  - due: 2026-03-14
  - next action: append explicit runbook-link field in follow-up tickets for doc-gap incidents.
  - evidence: `docs/blackout-ops-runbook.md`, `docs/drills/cross_operator_federation_drill.md` (runbook checklist follow-up action).
- [x] Incident learning is shared with on-call and operator groups.
  - owner: Incident Commander Lead
  - due: 2026-03-14
  - next action: publish incident-summary notes to on-call/operator channels within 5 business days.
  - evidence: `docs/incident_response_maturity.md` (governance closure requirement), `docs/reports/weekly_completion_report_2026-03-02.md`.

Governance requirement: no incident marked closed until checklist items are complete or explicitly waived by the Incident Commander Lead.
