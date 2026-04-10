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

# Verify the most recent base backup and validate WAL replay prerequisites.

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/postgres}"
REPORT_DIR="${REPORT_DIR:-${BACKUP_ROOT}/verification-reports}"
LATEST_BACKUP="$(find "${BACKUP_ROOT}/base" -mindepth 1 -maxdepth 1 -type d | sort | tail -n1)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="${REPORT_DIR}/verify-${STAMP}.txt"

mkdir -p "${REPORT_DIR}"

if [[ -z "${LATEST_BACKUP}" ]]; then
  echo "No base backup directories found under ${BACKUP_ROOT}/base" | tee "${REPORT}"
  exit 1
fi

echo "Verifying backup at ${LATEST_BACKUP}" | tee "${REPORT}"
"$(resolve_pg_binary pg_verifybackup)" -m "${LATEST_BACKUP}/data" 2>&1 | tee -a "${REPORT}"

MANIFEST="${LATEST_BACKUP}/manifest.json"
if [[ ! -f "${MANIFEST}" ]]; then
  echo "manifest.json missing: ${MANIFEST}" | tee -a "${REPORT}"
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  WAL_PATH="$(jq -r '.wal_archive_path' "${MANIFEST}")"
else
  WAL_PATH="$(python3 - <<'PY' "${MANIFEST}"
import json,sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    print(json.load(f)["wal_archive_path"])
PY
)"
fi

if [[ ! -d "${WAL_PATH}" ]]; then
  echo "WAL archive path does not exist: ${WAL_PATH}" | tee -a "${REPORT}"
  exit 1
fi

if [[ -z "$(find "${WAL_PATH}" -type f -print -quit)" ]]; then
  echo "WAL archive path has no files: ${WAL_PATH}" | tee -a "${REPORT}"
  exit 1
fi

echo "Verification PASSED" | tee -a "${REPORT}"
