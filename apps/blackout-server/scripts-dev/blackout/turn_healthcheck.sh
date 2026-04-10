#!/usr/bin/env bash
set -euo pipefail

TURN_HOST="${TURN_HOST:-127.0.0.1}"
TURN_PORT="${TURN_PORT:-3478}"
TURN_PROTO="${TURN_PROTO:-udp}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-3}"

if command -v nc >/dev/null 2>&1; then
  if [[ "${TURN_PROTO}" == "tcp" ]]; then
    nc -z -w "${TIMEOUT_SECONDS}" "${TURN_HOST}" "${TURN_PORT}"
  else
    nc -z -u -w "${TIMEOUT_SECONDS}" "${TURN_HOST}" "${TURN_PORT}"
  fi
  echo "TURN healthcheck passed for ${TURN_HOST}:${TURN_PORT}/${TURN_PROTO}"
  exit 0
fi

echo "nc is required for turn_healthcheck.sh" >&2
exit 2
