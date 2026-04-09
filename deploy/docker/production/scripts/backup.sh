#!/usr/bin/env bash
set -euo pipefail

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_OUT_DIR:-./backups/manual}"
mkdir -p "${OUT_DIR}"

compose() {
  docker compose -f "$(dirname "$0")/../docker-compose.yml" "$@"
}

echo "[backup] creating postgres dump"
compose exec -T db pg_dump -U "${DB_USER:-blackout}" "${DB_NAME:-blackout}" | gzip > "${OUT_DIR}/postgres-${STAMP}.sql.gz"

echo "[backup] creating redis snapshot"
compose exec -T cache redis-cli -a "$(cat "$(dirname "$0")/../.secrets/cache_password.txt")" --rdb /tmp/dump.rdb
compose cp cache:/tmp/dump.rdb "${OUT_DIR}/redis-${STAMP}.rdb"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "${OUT_DIR}" && sha256sum "postgres-${STAMP}.sql.gz" "redis-${STAMP}.rdb" > "checksums-${STAMP}.sha256")
fi

echo "[backup] complete: ${OUT_DIR}"
