# Distributed Self-Healing Operations Runbook

This runbook is the implementation anchor for `docs/project_completion_tracker.md` high-severity reliability, recovery, and incident-operation gates.

## 1. Reliability baselines

- **No single point of failure:** deploy at least 3 `element` replicas with zone spread (`deploy/kubernetes/phase4/element-ha.yaml`).
- **Health checks:** `/health/live` and `/health/ready` on every app-serving process.
- **Automatic restart policy chaos test:**
  - `kubectl delete pod -n element-web -l app=element --force --grace-period=0`
  - `kubectl wait --for=condition=ready pod -n element-web -l app=element --timeout=180s`
- **One-command rollback:**
  - `kubectl rollout undo deployment/element -n element-web`

## 2. Data protection and recovery

- **PostgreSQL replication:** use managed PostgreSQL with synchronous replica and replication-lag alerting.
- **PITR backup pipeline:** nightly base backup + continuous WAL archiving to object storage.
- **Backup verification:** restore latest base backup and replay WAL to target timestamp in staging daily.
- **Automated failover staging validation:** run monthly controlled primary failure in staging and validate RPO/RTO.
- **Quarterly drills:**
  - Restore drill: PITR restore to isolated environment.
  - Failover drill: promote replica and redirect traffic.

## 3. Federation and observability

- Monitor federation sender backlog/retry saturation dashboards.
- Trigger alert when remote retry saturation exceeds threshold for 15 minutes.
- Validate backlog recovery by introducing 20-minute synthetic egress block and tracking backlog drain.
- Alert on DNS cert-chain issues and TLS certificate expiry with 30/14/7 day notifications.
- Map each critical alert to a runbook path in `deploy/kubernetes/phase6/federation-alerts.yaml` annotations.

## 4. Security and incident operations

- Apply WAF and endpoint rate limits for login, registration, media upload, and federation ingress.
- Use bot/abuse playbook for temporary degradation modes:
  - registration invite-only,
  - media upload throttling,
  - federation queue caps,
  - room join pacing.
- Execute secrets rotation every 90 days and maintain audited break-glass flow.
- Keep two independent operators in on-call escalation tree.
- Maintain SLO + error budget policy and enforce release gating when burn-rate policy is breached.

## 5. Evidence cadence

- Weekly: health probe/restart and federation retry panel checks.
- Monthly: rollback validation and automated failover scenario in staging.
- Quarterly: PITR restore + failover drills and game-day exercise with action items.
- Per release: blackout-mode rejection/acceptance telemetry review and link in release notes.
