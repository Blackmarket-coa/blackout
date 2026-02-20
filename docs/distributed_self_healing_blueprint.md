# Distributed self-healing blueprint (community-operated)

This guide translates the goal "hard to take down" into practical reliability engineering for Blackout Server deployments.

## Reality check: "impossible to take down"

No system is literally impossible to disrupt. Design for:

- no single points of failure,
- fast automatic recovery,
- graceful degradation,
- and rapid operator intervention.

Use measurable targets (SLOs) instead of absolutes.

## Target outcomes (SLO examples)

- API availability: 99.95% monthly.
- Federation send backlog recovers to normal within 15 minutes after a regional incident.
- Data durability: no permanent loss from single-node failure.
- Recovery objectives:
    - RPO <= 1 minute (WAL shipping / synchronous replication choice based on latency budget)
    - RTO <= 5 minutes for primary database failover.

## Architecture layers

## 1) Community distribution model (users as resilience)

Use multiple independently-operated homeservers (different operators, networks, and regions).
This prevents a single organization, data center, or ISP from taking out the whole community.

Operational implications:

- Keep federation enabled and healthy.
- Publish bootstrap/runbook docs so new operators can join quickly.
- Encourage at least 3 independent operators before calling a network "resilient".

## 2) Per-homeserver high availability

For each homeserver deployment:

- **Synapse workers** split request handling by role.
- **Redis** for replication/pub-sub and cache coherence.
- **PostgreSQL HA** (primary + replicas + automated failover).
- **Reverse proxy / load balancer** routing to healthy workers.

### Recommended worker baseline

Start conservative, then scale by metrics:

- 2x generic workers for client API paths,
- 1x federation sender,
- 1x background worker,
- 1x event persister,
- main process for coordination.

Scale out with additional workers per bottleneck domain (`/sync`, federation, media, pushers).

## 3) Control plane and self-healing

Use one orchestrator style consistently:

- **Systemd** for VM/bare-metal deployments.
- **Kubernetes** for container-first environments.

Self-healing controls:

- liveness/readiness checks on every worker,
- auto-restart on process crash,
- anti-affinity for critical replicas,
- automatic database failover,
- automated rollback for bad deploys.

## 4) Data safety and consistency

- Daily full backups + frequent incremental/WAL backups.
- Quarterly restore drills to a clean environment.
- Connection keepalives tuned to reduce long DB stalls during path failure.
- Capacity alerts on DB growth, purge lag, and replication lag.

## 5) Observability and auto-remediation

Use dashboards + alerting for:

- worker process health,
- DB replication lag and failover state,
- Redis availability and latency,
- federation retry/failure trends,
- event rejection rates (especially in blackout mode).

Automations to add:

- if federation destination repeatedly fails, auto-create incident annotation,
- if queue lag exceeds threshold, scale related worker pool,
- if rejection rate spikes after deploy, trigger rollback or config canary halt.

## Threat model to design against

Plan for at least these events:

- single server loss,
- zone/region outage,
- DNS outage,
- certificate expiration,
- upstream dependency outage,
- malicious traffic spikes,
- operator mistakes (bad config, bad rollout).

Each threat should have:

1. detection signal,
2. automated first response,
3. manual fallback runbook,
4. postmortem checklist.

## Reference topology (practical)

Small resilient cluster (single region, production-capable):

- 3x app nodes (Synapse workers + main distributed across nodes),
- 3x PostgreSQL nodes (1 primary, 2 replicas),
- 3x Redis Sentinel/Cluster-compatible nodes,
- 2x reverse proxies (active/active),
- offsite backup target in second region.

Multi-region evolution:

- active/active app tier in 2 regions,
- regional read replicas,
- clearly-defined write strategy (single-writer or carefully scoped multi-writer),
- global DNS with health-based routing.

## 30/60/90 day rollout plan

### Day 0-30

- Migrate all production homeservers to PostgreSQL (if any are not already).
- Introduce workers + Redis in staging, then production.
- Add health checks and restart policies.
- Set initial SLOs and alert thresholds.

### Day 31-60

- Deploy Postgres automated failover.
- Implement backup verification pipeline.
- Add federation health dashboard and incident playbook.
- Run first chaos exercise (kill worker, kill app node, fail DB primary).

### Day 61-90

- Add second region DR footprint.
- Automate scale-out triggers for top bottlenecks.
- Run game day for full-region failover simulation.
- Publish operator onboarding pack for community-run nodes.

## What not to do

- Do not claim absolute uptime/impossibility.
- Do not keep SQLite in any deployment requiring worker-based scaling.
- Do not run without tested restore drills.
- Do not expose replication listener interfaces publicly.

## Project completion tracker

Use this consolidated tracker as the single source of truth for rollout progress.

Status legend:

- [ ] Not started
- [~] In progress
- [x] Complete

### A) Rollout timeline milestones (30/60/90)

| Phase | Completion | Deliverables |
| --- | --- | --- |
| Day 0-30 | [ ] | PostgreSQL migration complete; workers + Redis in production; health checks + restart policies enabled; initial SLOs/alerts defined. |
| Day 31-60 | [ ] | Automated Postgres failover deployed; backup verification pipeline active; federation dashboard + incident playbook live; first chaos exercise completed. |
| Day 61-90 | [ ] | Second-region DR footprint added; scale-out automations enabled; full-region game day completed; operator onboarding pack published. |

### B) Reliability and architecture gates

- [ ] No single point of failure in app, DB, cache, or ingress.
- [ ] At least 3 app nodes spread across failure domains (host/zone separation).
- [ ] Health checks (liveness/readiness) enabled on all Synapse processes.
- [ ] Automatic restart policy verified by chaos test (`kill -9` worker).
- [ ] One-command rollback path documented and tested.

### C) Data protection and recovery gates

- [ ] PostgreSQL replication configured and monitored.
- [ ] Automated failover runbook validated in staging.
- [ ] PITR-capable backup pipeline (base backup + WAL) enabled.
- [ ] Restore drill completed in the last quarter.
- [ ] Failover drill completed in the last quarter.

### D) Federation and observability gates

- [ ] Federation sender backlog and retry metrics visible on dashboards.
- [ ] Alert for sustained remote-server retry saturation.
- [ ] Federation backlog recovery validated after induced outage.
- [ ] DNS and TLS expiry alerts configured with sufficient lead time.
- [ ] All critical alerts mapped to runbooks.

### E) Security and incident operations gates

- [ ] WAF/rate-limiting profile for login, registration, media upload, and federation endpoints.
- [ ] Bot/abuse spike playbook includes temporary degradation modes.
- [ ] Secrets rotation and break-glass access policy documented.
- [ ] On-call escalation tree includes at least two independent operators.
- [ ] Service-level objectives and error-budget policy published.
- [ ] Incident template and postmortem template available in-repo.
- [ ] Last game-day exercise completed and tracked with action items.
- [ ] Blackout-mode rejection/acceptance telemetry reviewed after each release.

### Exit criterion

A deployment is considered **distributed self-healing ready** when:

1. All tracker items above are complete.
2. Two consecutive game-day exercises demonstrate:
   - successful automatic recovery from a worker/node failure,
   - successful database failover without data loss beyond stated RPO,
   - restoration of nominal federation throughput within the stated RTO/SLO envelope.
