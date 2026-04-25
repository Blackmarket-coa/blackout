#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups/manual}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$(dirname "$0")/../ops/evidence}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/healthz}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-24}"
MAX_RESTORE_EVIDENCE_AGE_DAYS="${MAX_RESTORE_EVIDENCE_AGE_DAYS:-7}"
ENABLE_MATRIX_COMPLIANCE_GATE="${ENABLE_MATRIX_COMPLIANCE_GATE:-0}"
MATRIX_COMPLIANCE_GATE_SCRIPT="${MATRIX_COMPLIANCE_GATE_SCRIPT:-$(dirname "$0")/matrix-compliance-gate.sh}"
ENABLE_BRIDGE_HEALTH_GATE="${ENABLE_BRIDGE_HEALTH_GATE:-0}"
BRIDGE_HEALTH_GATE_SCRIPT="${BRIDGE_HEALTH_GATE_SCRIPT:-$(dirname "$0")/bridge-health-smoke.sh}"

latest_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'postgres-*.sql.gz' | sort | tail -n 1)"
[ -n "$latest_backup" ] || { echo "[gate] FAIL: no postgres backup found"; exit 1; }

latest_restore_evidence="$(find "$EVIDENCE_DIR" -maxdepth 1 -type f -name 'restore-verify-*.txt' | sort | tail -n 1)"
[ -n "$latest_restore_evidence" ] || { echo "[gate] FAIL: no restore verification evidence found"; exit 1; }

backup_age_hours="$(( ( $(date +%s) - $(stat -c %Y "$latest_backup") ) / 3600 ))"
restore_age_days="$(( ( $(date +%s) - $(stat -c %Y "$latest_restore_evidence") ) / 86400 ))"

echo "[gate] latest backup: $(basename "$latest_backup") age=${backup_age_hours}h"
echo "[gate] latest restore evidence: $(basename "$latest_restore_evidence") age=${restore_age_days}d"

if [ "$backup_age_hours" -gt "$MAX_BACKUP_AGE_HOURS" ]; then
  echo "[gate] FAIL: backup older than ${MAX_BACKUP_AGE_HOURS}h"
  exit 1
fi

if [ "$restore_age_days" -gt "$MAX_RESTORE_EVIDENCE_AGE_DAYS" ]; then
  echo "[gate] FAIL: restore evidence older than ${MAX_RESTORE_EVIDENCE_AGE_DAYS} days"
  exit 1
fi

http_code="$(curl -sS -o /dev/null -w '%{http_code}' "$HEALTH_URL" || true)"
if [ "$http_code" != "200" ]; then
  echo "[gate] FAIL: health endpoint returned $http_code"
  exit 1
fi


if [ "$ENABLE_MATRIX_COMPLIANCE_GATE" = "1" ]; then
  echo "[gate] matrix compliance gate enabled"
  "$MATRIX_COMPLIANCE_GATE_SCRIPT"
else
  echo "[gate] matrix compliance gate skipped (ENABLE_MATRIX_COMPLIANCE_GATE=${ENABLE_MATRIX_COMPLIANCE_GATE})"
fi

if [ "$ENABLE_BRIDGE_HEALTH_GATE" = "1" ]; then
  echo "[gate] bridge health gate enabled"
  "$BRIDGE_HEALTH_GATE_SCRIPT"
else
  echo "[gate] bridge health gate skipped (ENABLE_BRIDGE_HEALTH_GATE=${ENABLE_BRIDGE_HEALTH_GATE})"
fi

echo "[gate] PASS: release gate checks passed"
