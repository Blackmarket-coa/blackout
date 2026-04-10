#!/usr/bin/env bash
set -euo pipefail

# Smoke script for managed-hosting controls:
# 1) startup readiness diagnostics (expected to fail with closed ports)
# 2) health endpoint check (operator-supplied URL)

HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:8008/health}"

echo "[smoke] running fail-fast readiness diagnostic demo (expected failure if no services are listening)"
set +e
BLACKOUT_MANAGED_READINESS_CHECKS=true \
DATABASE_HOST="${DATABASE_HOST:-127.0.0.1}" \
DATABASE_PORT="${DATABASE_PORT:-6543}" \
REDIS_HOST="${REDIS_HOST:-127.0.0.1}" \
REDIS_PORT="${REDIS_PORT:-6390}" \
BLACKOUT_READINESS_RETRIES=1 \
BLACKOUT_READINESS_TIMEOUT_SEC=0.5 \
BLACKOUT_READINESS_DELAY_SEC=0 \
python -m synapse.util.managed_hosting readiness
rc=$?
set -e
if [[ "$rc" -eq 0 ]]; then
  echo "[smoke] WARNING: readiness demo unexpectedly passed; ports may be open in this environment."
else
  echo "[smoke] readiness fail-fast diagnostic produced non-zero exit as expected."
fi

echo "[smoke] checking health endpoint: ${HEALTHCHECK_URL}"
python -m synapse.util.managed_hosting health --url "${HEALTHCHECK_URL}" --timeout 5
echo "[smoke] complete."
