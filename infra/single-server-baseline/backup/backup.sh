#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/blackout}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/blackout}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "${TARGET_DIR}"

cd "${STACK_DIR}"

# 1) PostgreSQL logical dump.
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip -9 > "${TARGET_DIR}/postgres.sql.gz"

# 2) Synapse config + state + media snapshot.
docker run --rm \
  -v blackout-synapse-data:/from_data:ro \
  -v blackout-synapse-media:/from_media:ro \
  -v "${TARGET_DIR}":/to \
  alpine:3.20 sh -c "tar czf /to/synapse-data-media.tgz -C / from_data from_media"

cp -a "${STACK_DIR}/synapse/homeserver.yaml" "${TARGET_DIR}/homeserver.yaml"

# 3) Coturn config snapshot.
cp -a "${STACK_DIR}/coturn/turnserver.conf" "${TARGET_DIR}/turnserver.conf"

# 4) Compose and env snapshot.
cp -a "${STACK_DIR}/docker-compose.yml" "${TARGET_DIR}/docker-compose.yml"
cp -a "${STACK_DIR}/.env" "${TARGET_DIR}/.env"

# 5) checksum manifest.
(
  cd "${TARGET_DIR}"
  sha256sum * > SHA256SUMS
)

# 6) retention.
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${RETENTION_DAYS}" -exec rm -rf {} +

echo "Backup complete: ${TARGET_DIR}"
