# Production Operations Baseline

This baseline defines minimum production operations controls for Docker-based Blackout deployments.

## 1) Cron / workflow jobs

### Host cron schedule (UTC)
Use `deploy/docker/production/cron/production-ops.cron` as the baseline schedule for:

- database backups + offsite replication
- restore verification drills
- media backups
- config/env encrypted backup handling
- uptime probes + alert routing
- dashboard evidence exports (CPU/memory/disk/logs)
- release gate checks

### GitHub workflows

- `dr-backup-verification.yml`: daily PITR checklist artifact.
- `production-ops-evidence.yml`: weekly/monthly/quarterly evidence packet generation.
- `deploy-compose-prod.yml`: deployment with post-deploy health check and backup verification trigger.

## 2) Database backups with restore verification

### Backup policy

- Frequency: nightly logical dump (minimum).
- Retention: 7 daily / 4 weekly / 6 monthly (or stricter).
- Location: local durable volume + offsite immutable copy.
- Integrity: checksum artifacts generated with every dump.

### Restore verification

- Run `scripts/restore-verify.sh` daily.
- The script restores the latest dump into an ephemeral verification DB, runs schema integrity checks, and writes evidence to `ops/evidence/restore-verify-<timestamp>.txt`.
- Release promotion is blocked if no restore evidence exists from the last 7 days.

## 3) Media backup policy

- Scope: uploaded media objects, attachments, avatars, and ephemeral-to-durable media transitions.
- Strategy: incremental every 6 hours, full backup weekly.
- Retention: 30 days hot, 180 days warm/archive (immutable where possible).
- Verification: weekly random sample restore (at least 25 objects across critical media classes).
- Encryption: enforce encryption in transit and at rest (KMS-managed keys).

## 4) Config/env backup handling

- Store env and secrets using secure secret stores first; never rely only on local `.env` files.
- Create encrypted escrow snapshot hourly (or on each secret rotation).
- Include:
  - deploy env overlays
  - secret references and key metadata
  - TLS/certificate metadata
- Exclude plaintext secrets from ticket comments and artifacts.
- Verify decryption and replay in staging monthly.

## 5) Uptime checks and alert routing

- Run uptime probes every 5 minutes (`network-uptime-probe.sh`).
- SLO target: 99.9% for public `/healthz` endpoint.
- Alert routing:
  - P1 (hard down): page primary on-call immediately.
  - P2 (degraded): page on-call if 10+ min, slack immediately.
  - P3 (non-critical): ticket + next-business-day review.
- Execute synthetic pager test weekly.

## 6) CPU/memory/disk/log dashboards

Maintain dashboard panels per environment for:

- CPU saturation (host + container)
- Memory pressure / OOM events
- Disk usage + inode exhaustion + write latency
- Log error rate, auth failures, and deploy-time exceptions

Evidence exports:

- Weekly snapshots attached to operations evidence packet.
- Monthly trend review with action items.
- Quarterly capacity re-baseline.

## 7) Release gate checks

Use `scripts/release-gate-checks.sh` as a mandatory pre-release gate:

- backup freshness <= 24 hours
- restore evidence freshness <= 7 days
- service health endpoint returns 200

Recommended additional gate inputs:

- migration dry run success
- error budget burn-rate check
- critical alert silence check

## 8) Restore drill procedure

1. Confirm incident scope and decide target restore timestamp (UTC).
2. Isolate target environment (avoid writes during replay).
3. Pull latest verified backup set + checksum validation.
4. Rehydrate DB into staging/isolated prod-restore node.
5. Run WAL/PITR replay to target point-in-time if required.
6. Execute validation suite:
   - schema/table counts
   - critical query integrity checks
   - auth/session and message flow smoke tests
7. Document RPO/RTO achieved and deviations.
8. Obtain incident commander approval before cutover.
9. Perform controlled cutover and post-restore smoke checks.
10. Publish evidence and postmortem actions.

## 9) On-call handoff checklist

- Current incident state + severity and owner.
- Active alerts, acknowledgements, and suppression windows.
- Backup status (last success time and restore-verification age).
- Any degraded subsystem: DB/cache/media/ingress.
- Open mitigations and rollback commands.
- Customer impact summary and comms status.
- Next check-in time and escalation trigger.

## 10) Evidence cadence

### Weekly

- Backup success summary (daily success/fail counts)
- Restore verification evidence file
- Uptime SLO report + pager test result
- Dashboard exports (CPU/memory/disk/log)

### Monthly

- Restore drill in non-production with timed RTO/RPO
- Config/env decrypt-and-replay test
- Media sample restore report
- Alert routing audit (paging paths and overrides)

### Quarterly

- Full DR scenario rehearsal (people + systems)
- Capacity and cost review for DB/media/log retention
- Access review for backup and secret-management roles
- Release gate policy review and threshold recalibration
