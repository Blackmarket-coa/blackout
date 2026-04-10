#!/usr/bin/env bash
set -euo pipefail


resolve_pg_binary() {
  local tool="$1"

  if command -v "${tool}" >/dev/null 2>&1; then
    command -v "${tool}"
    return 0
  fi

  local candidate
  while IFS= read -r candidate; do
    if [[ -x "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done < <(find /usr/lib/postgresql -maxdepth 3 -type f -name "${tool}" 2>/dev/null | sort -r)

  echo "Required PostgreSQL utility not found: ${tool}" >&2
  return 1
}

# Restore-drill script for quarterly disaster-recovery validation.
# Restores the latest base backup to a temporary PGDATA and runs
# a startup smoke check with pg_controldata.

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/postgres}"
DRILL_ROOT="${DRILL_ROOT:-/var/tmp/postgres-restore-drill}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LATEST_BACKUP="$(find "${BACKUP_ROOT}/base" -mindepth 1 -maxdepth 1 -type d | sort | tail -n1)"
RESTORE_DIR="${DRILL_ROOT}/${STAMP}"
REPORT="${DRILL_ROOT}/restore-drill-${STAMP}.txt"

mkdir -p "${RESTORE_DIR}" "${DRILL_ROOT}"

if [[ -z "${LATEST_BACKUP}" ]]; then
  echo "No base backup directories found under ${BACKUP_ROOT}/base" | tee "${REPORT}"
  exit 1
fi

cp -a "${LATEST_BACKUP}/data" "${RESTORE_DIR}/data"

"$(resolve_pg_binary pg_controldata)" "${RESTORE_DIR}/data" 2>&1 | tee "${REPORT}"

echo "Restore drill PASSED from ${LATEST_BACKUP}" | tee -a "${REPORT}"
