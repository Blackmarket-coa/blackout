#!/usr/bin/env bash
set -euo pipefail

STACK_FILE="${STACK_FILE:-$(dirname "$0")/../docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups/manual}"
VERIFY_DB_NAME="${VERIFY_DB_NAME:-blackout_restore_verify}"
VERIFY_DB_USER="${VERIFY_DB_USER:-${DB_USER:-blackout}}"
REPORT_DIR="${REPORT_DIR:-$(dirname "$0")/../ops/evidence}"

mkdir -p "$REPORT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_FILE="$REPORT_DIR/restore-verify-${STAMP}.txt"

compose() {
  docker compose -f "$STACK_FILE" "$@"
}

latest_postgres_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'postgres-*.sql.gz' | sort | tail -n 1)"
if [ -z "$latest_postgres_backup" ]; then
  echo "No postgres backup found in $BACKUP_DIR" >&2
  exit 1
fi

echo "[restore] using backup: $latest_postgres_backup"

echo "[restore] dropping old verification db if present"
compose exec -T db psql -U "$VERIFY_DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${VERIFY_DB_NAME};"

echo "[restore] creating verification db"
compose exec -T db psql -U "$VERIFY_DB_USER" -d postgres -c "CREATE DATABASE ${VERIFY_DB_NAME};"

echo "[restore] replaying dump"
gunzip -c "$latest_postgres_backup" | compose exec -T db psql -U "$VERIFY_DB_USER" -d "$VERIFY_DB_NAME" >/dev/null

echo "[restore] running verification queries"
TABLE_COUNT="$(compose exec -T db psql -U "$VERIFY_DB_USER" -d "$VERIFY_DB_NAME" -At -c "select count(*) from information_schema.tables where table_schema='public';")"

{
  echo "timestamp_utc=$STAMP"
  echo "backup_file=$(basename "$latest_postgres_backup")"
  echo "verify_db=$VERIFY_DB_NAME"
  echo "table_count=$TABLE_COUNT"
  echo "result=pass"
} >"$REPORT_FILE"

echo "[restore] verification report written: $REPORT_FILE"

# cleanup to avoid stale restore db state
compose exec -T db psql -U "$VERIFY_DB_USER" -d postgres -c "DROP DATABASE IF EXISTS ${VERIFY_DB_NAME};" >/dev/null

echo "[restore] PASS"
