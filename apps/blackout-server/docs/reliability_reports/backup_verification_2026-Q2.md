# Backup verification report — 2026 Q2 baseline

## 1) Purpose / scope
Provide reproducible evidence that backup creation, verification, and restore-drill prerequisites are functioning for deployment readiness.

## 2) Execution date / environment
- Date: 2026-03-03
- Environment: staging backup host (`blackout-stg-backup-01`)
- Data scope: latest base backup set + WAL archive integrity checks

## 3) Exact command / procedure executed
1. Run backup generation workflow:
   ```bash
   BACKUP_ROOT=/var/backups/postgres scripts-dev/blackout/backup_run.sh
   ```
2. Run verification workflow:
   ```bash
   BACKUP_ROOT=/var/backups/postgres REPORT_DIR=/var/backups/postgres/verification-reports scripts-dev/blackout/backup_verify.sh
   ```
3. Run restore-drill smoke command:
   ```bash
   BACKUP_ROOT=/var/backups/postgres DRILL_ROOT=/var/tmp/postgres-restore-drill scripts-dev/blackout/quarterly_restore_drill.sh
   ```
4. Confirm expected report artifacts exist:
   ```bash
   ls -1 /var/backups/postgres/verification-reports/verify-*.txt | tail -n 1
   ls -1 /var/tmp/postgres-restore-drill/restore-drill-*.txt | tail -n 1
   ```

## 4) Observed results and pass/fail criteria
- Observed:
  - `backup_run.sh` completed and wrote a fresh `manifest.json`.
  - `backup_verify.sh` report ended with `Verification PASSED`.
  - restore drill completed with `Restore drill PASSED`.
- Pass criteria:
  - newest backup manifest created in current execution window
  - verification report contains explicit pass line
  - restore drill report confirms successful metadata inspection (`pg_controldata`)
- Outcome: **PASS**

## 5) Follow-up actions (owner + due date)
- Add weekly digest export of verification report summaries into `docs/reliability_reports/`.
  - Owner: Database Reliability Lead
  - Due: 2026-03-18
- Add failure-mode test for empty WAL archive path in staging preflight.
  - Owner: Release Engineering Lead
  - Due: 2026-03-20
