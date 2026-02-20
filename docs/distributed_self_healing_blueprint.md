# Distributed self-healing blueprint (community-operated)

This guide translates the goal "hard to take down" into practical reliability engineering for Blackout Server deployments. It is written as an operator-facing blueprint you can execute in phases, measure, and continuously improve.

## Reality check: "impossible to take down"

No system is literally impossible to disrupt. Design for:

- no single points of failure,
- fast automatic recovery,
- graceful degradation,
- and rapid operator intervention.

Use measurable targets (SLOs) instead of absolutes, and review them at least monthly.

## Target outcomes (SLO examples)

- API availability: 99.95% monthly.
- Federation send backlog recovers to normal within 15 minutes after a regional incident.
- Data durability: no permanent loss from single-node failure.
- Recovery objectives:
  - RPO <= 1 minute (WAL shipping / synchronous replication based on latency budget).
  - RTO <= 5 minutes for primary database failover.

SLO process recommendations:

- Track SLOs with a monthly burn-rate report.
- Define explicit error budget policy (for example: freeze non-critical deploys when >50% monthly budget is consumed).
- Keep one owner per SLO with clear escalation contact.

## Architecture layers

## 1) Community distribution model (users as resilience)

Use multiple independently-operated homeservers (different operators, networks, and regions). This prevents a single organization, data center, or ISP from taking out the whole community.

Operational implications:

- Keep federation enabled and healthy.
- Publish bootstrap/runbook docs so new operators can join quickly.
- Encourage at least 3 independent operators before calling a network "resilient".
- Maintain a public operator status channel with outage and maintenance notices.
- Rotate cross-operator incident commander duty so no single team becomes a bottleneck.

## 2) Per-homeserver high availability

For each homeserver deployment:

- **Synapse workers** split request handling by role.
- **Redis** for replication/pub-sub and cache coherence.
- **PostgreSQL HA** (primary + replicas + automated failover).
- **Reverse proxy / load balancer** routing to healthy workers.

### Recommended worker baseline

Start conservative, then scale by metrics:

- 2x generic workers for client API paths.
- 1x federation sender.
- 1x background worker.
- 1x event persister.
- Main process for coordination.

Scale out with additional workers per bottleneck domain (`/sync`, federation, media, pushers).

Sizing and placement notes:

- Place at least one generic worker in each availability zone.
- Keep event persister close to the database (low-latency path).
- Reserve CPU for burst handling (target <65% sustained CPU at p95).

## 3) Control plane and self-healing

Use one orchestrator style consistently:

- **Systemd** for VM/bare-metal deployments.
- **Kubernetes** for container-first environments.

Self-healing controls:

- Liveness/readiness checks on every worker.
- Auto-restart on process crash.
- Anti-affinity for critical replicas.
- Automatic database failover.
- Automated rollback for bad deploys.

Deployment safety gates:

- Canary 5-10% of traffic first, then roll to 50%, then 100%.
- Abort rollout automatically on p95 latency regression >20% or error rate +1% absolute.
- Keep schema migrations backward-compatible for at least one deploy cycle.

## 4) Data safety and consistency

- Daily full backups + frequent incremental/WAL backups.
- Quarterly restore drills to a clean environment.
- Connection keepalives tuned to reduce long DB stalls during path failure.
- Capacity alerts on DB growth, purge lag, and replication lag.
- Backup immutability or retention lock where possible.
- Encrypt backups at rest and in transit; test key recovery separately.

## 5) Observability and auto-remediation

Use dashboards + alerting for:

- Worker process health.
- DB replication lag and failover state.
- Redis availability and latency.
- Federation retry/failure trends.
- Event rejection rates (especially in blackout mode).

Automations to add:

- If federation destination repeatedly fails, auto-create incident annotation.
- If queue lag exceeds threshold, scale related worker pool.
- If rejection rate spikes after deploy, trigger rollback or config canary halt.

Alerting policy recommendations:

- Use multi-window burn-rate alerts for availability SLOs.
- Route paging alerts to humans only for actionable incidents.
- Auto-close alerts when recovery criteria hold for a cooldown period.

## Threat model to design against

Plan for at least these events:

- Single server loss.
- Zone/region outage.
- DNS outage.
- Certificate expiration.
- Upstream dependency outage.
- Malicious traffic spikes.
- Operator mistakes (bad config, bad rollout).
- Partial network partition and asymmetric latency.
- Long-tail storage latency spikes.

Each threat should have:

1. Detection signal.
2. Automated first response.
3. Manual fallback runbook.
4. Postmortem checklist.

Add explicit runbook metadata:

- Owner and backup owner.
- Last review date.
- Time-to-mitigate target.
- Links to dashboards and logs.

## Reference topology (practical)

Small resilient cluster (single region, production-capable):

- 3x app nodes (Synapse workers + main distributed across nodes).
- 3x PostgreSQL nodes (1 primary, 2 replicas).
- 3x Redis Sentinel/Cluster-compatible nodes.
- 2x reverse proxies (active/active).
- Offsite backup target in second region.

Multi-region evolution:

- Active/active app tier in 2 regions.
- Regional read replicas.
- Clearly-defined write strategy (single-writer or carefully scoped multi-writer).
- Global DNS with health-based routing.

## Reliability acceptance checklist

A deployment should not be labeled "self-healing" until all are true:

- [ ] Automatic app process restart and health-gated traffic routing are enabled.
- [ ] DB primary failover succeeds in testing within RTO target.
- [ ] Backup restore drill completed in the last 90 days.
- [ ] TLS certificate expiry alerting and auto-renewal are tested.
- [ ] On-call escalation and incident roles are documented.
- [ ] At least one chaos exercise completed in the last quarter.

## Incident operating model

Minimal roles during incidents:

- Incident Commander (decision owner).
- Operations Driver (executes technical actions).
- Communications Lead (status updates internally and to operators).
- Scribe (timeline and action tracking).

Golden rules:

- Prioritize mitigation over root-cause debate.
- Keep changes reversible during active incidents.
- Publish an initial status update within 10 minutes.

## 30/60/90 day rollout plan

### Day 0-30

- Migrate all production homeservers to PostgreSQL (if any are not already).
- Introduce workers + Redis in staging, then production.
- Add health checks and restart policies.
- Set initial SLOs and alert thresholds.
- Define incident roles and escalation trees.

### Day 31-60

- Deploy Postgres automated failover.
- Implement backup verification pipeline.
- Add federation health dashboard and incident playbook.
- Run first chaos exercise (kill worker, kill app node, fail DB primary).
- Introduce canary deploy + automated rollback gates.

### Day 61-90

- Add second region DR footprint.
- Automate scale-out triggers for top bottlenecks.
- Run game day for full-region failover simulation.
- Publish operator onboarding pack for community-run nodes.
- Add monthly reliability review cadence.

## What not to do

- Do not claim absolute uptime/impossibility.
- Do not keep SQLite in any deployment requiring worker-based scaling.
- Do not run without tested restore drills.
- Do not expose replication listener interfaces publicly.
- Do not perform irreversible schema changes without rollback strategy.

## Project completion tracker

The operational completion tracker is maintained in `docs/project_completion_tracker.md`.
