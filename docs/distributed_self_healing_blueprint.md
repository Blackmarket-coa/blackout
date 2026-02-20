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

## Acceptance checklist

- [ ] No single point of failure in app, DB, cache, or ingress.
- [ ] All critical alerts mapped to runbooks.
- [ ] Restore drill completed in the last quarter.
- [ ] Failover drill completed in the last quarter.
- [ ] Federation backlog recovery validated after induced outage.
- [ ] Blackout-mode rejection/acceptance telemetry reviewed after each release.
