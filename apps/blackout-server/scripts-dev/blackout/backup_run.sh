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

# Run a daily full backup with WAL archiving metadata.
# Intended to be run from cron/systemd timer.

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/postgres}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
WEEKLY_RETENTION="${WEEKLY_RETENTION:-8}"
MONTHLY_RETENTION="${MONTHLY_RETENTION:-12}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_DIR="${BACKUP_ROOT}/base/${STAMP}"
MANIFEST="${TARGET_DIR}/manifest.json"

mkdir -p "${TARGET_DIR}" "${BACKUP_ROOT}/wal"

"$(resolve_pg_binary pg_basebackup)" \
  --pgdata="${TARGET_DIR}/data" \
  --format=plain \
  --checkpoint=fast \
  --wal-method=stream \
  --verbose

cat > "${MANIFEST}" <<MANIFEST
{
  "backup_id": "${STAMP}",
  "created_at_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pgdata": "${PGDATA}",
  "basebackup_path": "${TARGET_DIR}/data",
  "wal_archive_path": "${BACKUP_ROOT}/wal",
  "retention": {
    "daily": ${RETENTION_DAYS},
    "weekly": ${WEEKLY_RETENTION},
    "monthly": ${MONTHLY_RETENTION}
  }
}
MANIFEST

find "${BACKUP_ROOT}/base" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -print -exec rm -rf {} +

echo "Backup complete: ${TARGET_DIR}"
