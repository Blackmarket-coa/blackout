# No-SPOF Topology Review — 2026-02-20

## Application tier

- 3+ replicas and zone spread: `deploy/kubernetes/phase4/element-ha.yaml`.

## Ingress tier

- NGINX ingress expected as HA deployment with at least two controller replicas (platform baseline).
- Edge rate-limited/WAF ingress policy defined: `deploy/kubernetes/phase6/ingress-waf-rate-limit.yaml`.

## Cache tier

- Redis 3-replica HA baseline with PDB: `deploy/kubernetes/phase6/redis-ha.yaml`.

## Database tier

- PostgreSQL 3-instance HA baseline with replication monitoring: `deploy/kubernetes/phase6/postgres-dr-baseline.yaml`.

## Result

- No single point of failure baseline is defined across app, DB, cache, and ingress tiers.
