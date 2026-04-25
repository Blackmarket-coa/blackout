#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_COMPOSE_FILE="${BRIDGE_COMPOSE_FILE:-$SCRIPT_DIR/../../blackout-backend/docker-compose.yml}"
BRIDGE_SERVICE="${BRIDGE_SERVICE:-matrix-hookshot}"
SYNAPSE_SERVICE="${SYNAPSE_SERVICE:-synapse}"
SYNAPSE_CONFIG_PATH="${SYNAPSE_CONFIG_PATH:-/data/homeserver.yaml}"
REGISTRATION_FILE="${REGISTRATION_FILE:-$SCRIPT_DIR/../../blackout-backend/integrations/hookshot/registration.yml}"
REGISTRATION_IN_CONTAINER="${REGISTRATION_IN_CONTAINER:-/integrations/hookshot/registration.yml}"
APPSERVICE_ID="${APPSERVICE_ID:-hookshot}"
SYNAPSE_ADMIN_URL="${SYNAPSE_ADMIN_URL:-}"
SYNAPSE_ADMIN_TOKEN="${SYNAPSE_ADMIN_TOKEN:-}"
BRIDGE_MESSAGE_FLOW_CMD="${BRIDGE_MESSAGE_FLOW_CMD:-}"
BRIDGE_SYNTHETIC_WHOAMI_URL="${BRIDGE_SYNTHETIC_WHOAMI_URL:-http://synapse:8008/_matrix/client/v3/account/whoami}"
ALLOW_MISSING_BRIDGE_HEALTHCHECK="${ALLOW_MISSING_BRIDGE_HEALTHCHECK:-0}"

compose() {
  docker compose -f "$BRIDGE_COMPOSE_FILE" "$@"
}

pass() {
  echo "[bridge-smoke] PASS: $*"
}

fail() {
  echo "[bridge-smoke] FAIL: $*" >&2
  exit 1
}

[ -f "$BRIDGE_COMPOSE_FILE" ] || fail "compose file not found: $BRIDGE_COMPOSE_FILE"
[ -s "$REGISTRATION_FILE" ] || fail "registration file missing or empty: $REGISTRATION_FILE"

synapse_container_id="$(compose ps -q "$SYNAPSE_SERVICE")"
[ -n "$synapse_container_id" ] || fail "synapse service container not found: $SYNAPSE_SERVICE"

bridge_container_id="$(compose ps -q "$BRIDGE_SERVICE")"
[ -n "$bridge_container_id" ] || fail "bridge service container not found: $BRIDGE_SERVICE"

# 1) Appservice registration loaded check.
compose exec -T "$SYNAPSE_SERVICE" test -s "$REGISTRATION_IN_CONTAINER" || fail "registration file not available in synapse container: $REGISTRATION_IN_CONTAINER"
compose exec -T "$SYNAPSE_SERVICE" sh -lc "grep -Fq '$REGISTRATION_IN_CONTAINER' '$SYNAPSE_CONFIG_PATH'" || fail "synapse config does not reference registration file: $REGISTRATION_IN_CONTAINER"
pass "synapse appservice registration file is mounted and referenced"

if [ -n "$SYNAPSE_ADMIN_URL" ] && [ -n "$SYNAPSE_ADMIN_TOKEN" ]; then
  admin_code="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SYNAPSE_ADMIN_TOKEN" "$SYNAPSE_ADMIN_URL/_synapse/admin/v1/appservice/$APPSERVICE_ID" || true)"
  [ "$admin_code" = "200" ] || fail "synapse admin API appservice lookup failed for id=$APPSERVICE_ID status=$admin_code"
  pass "synapse admin API confirms appservice id=$APPSERVICE_ID"
else
  echo "[bridge-smoke] INFO: synapse admin API check skipped (set SYNAPSE_ADMIN_URL and SYNAPSE_ADMIN_TOKEN to enable)"
fi

# 2) Bridge container health check.
bridge_state="$(docker inspect -f '{{.State.Status}}' "$bridge_container_id")"
[ "$bridge_state" = "running" ] || fail "bridge container state is $bridge_state"

bridge_health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$bridge_container_id")"
if [ "$bridge_health" = "none" ]; then
  if [ "$ALLOW_MISSING_BRIDGE_HEALTHCHECK" = "1" ]; then
    echo "[bridge-smoke] WARN: bridge container has no healthcheck configured"
  else
    fail "bridge container has no healthcheck configured"
  fi
elif [ "$bridge_health" != "healthy" ]; then
  fail "bridge container health is $bridge_health"
else
  pass "bridge container is healthy"
fi

# 3) Deterministic synthetic probe for token/API path.
if [ -n "$BRIDGE_MESSAGE_FLOW_CMD" ]; then
  bash -lc "$BRIDGE_MESSAGE_FLOW_CMD"
  pass "bridge message flow probe command succeeded"
else
  as_token="$(awk -F': *' '$1=="as_token" {gsub(/"/, "", $2); print $2; exit}' "$REGISTRATION_FILE")"
  [ -n "$as_token" ] || fail "unable to extract as_token from $REGISTRATION_FILE"

  whoami_response="$(compose exec -T "$BRIDGE_SERVICE" sh -lc "wget -q -O- --header='Authorization: Bearer $as_token' '$BRIDGE_SYNTHETIC_WHOAMI_URL'")" || fail "synthetic whoami probe failed"
  echo "$whoami_response" | grep -q '"user_id"' || fail "synthetic whoami probe did not return user_id"
  pass "synthetic whoami probe succeeded"
fi

echo "[bridge-smoke] PASS: bridge health smoke checks passed"
