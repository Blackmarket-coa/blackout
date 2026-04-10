#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE=${COMPOSE_FILE:-contrib/docker_compose_workers/docker-compose-ha.yaml}
PROJECT_NAME=${PROJECT_NAME:-synapse-ha}
SYNAPSE_SERVICE=${SYNAPSE_SERVICE:-synapse}
ROLLBACK_TEST=${ROLLBACK_TEST:-0}
BAD_IMAGE_TAG=${BAD_IMAGE_TAG:-}
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-180}

run() {
  echo "\n>>> $*"
  "$@"
}

wait_for_healthy_service() {
  local service=$1
  local timeout=$2
  local elapsed=0

  while (( elapsed < timeout )); do
    local status
    status=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps --format json "$service" | python3 -c 'import json,sys; data=json.load(sys.stdin); print(data[0].get("Health","missing")) if data else print("missing")')

    if [[ "$status" == "healthy" ]]; then
      return 0
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  return 1
}

run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d

# D1: Worker topology
run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps synapse-generic-worker-1 synapse-federation-sender-1 synapse-background-worker-1 synapse-persister-1

# D2: Redis replication/cache coherence
run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" exec -T redis-replica redis-cli -a redispassword INFO replication

# D3: PostgreSQL HA failover
run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" exec -T postgres-proxy bash -lc "PGPASSWORD=postgres psql -h 127.0.0.1 -p 5432 -U synapse_user -d synapse -c 'select now()'"
run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" stop postgres-primary
sleep 10
run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" exec -T postgres-proxy bash -lc "PGPASSWORD=postgres psql -h 127.0.0.1 -p 5432 -U synapse_user -d synapse -c 'select now()'"

# D4 + D5: Reverse proxy/LB and readiness
run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" exec -T reverse-proxy sh -lc "wget -q -O- http://127.0.0.1:8008/health"
run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps

# D6: Automated rollback verification (opt-in)
CURRENT_IMAGE=$(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" images -q "$SYNAPSE_SERVICE")

echo "Current ${SYNAPSE_SERVICE} image digest: ${CURRENT_IMAGE}"

if [[ "$ROLLBACK_TEST" == "1" ]]; then
  if [[ -z "$BAD_IMAGE_TAG" ]]; then
    echo "ROLLBACK_TEST=1 requires BAD_IMAGE_TAG (e.g. matrixdotorg/synapse:nonexistent-tag)"
    exit 1
  fi

  echo "\n>>> D6 rollback test enabled"
  echo "Attempting deployment with known bad image: ${BAD_IMAGE_TAG}"

  run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" stop "$SYNAPSE_SERVICE"
  run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" rm -f "$SYNAPSE_SERVICE"

  # Override image for one-off deployment attempt.
  run env SYNAPSE_IMAGE_OVERRIDE="$BAD_IMAGE_TAG" docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d "$SYNAPSE_SERVICE" || true

  if wait_for_healthy_service "$SYNAPSE_SERVICE" "$HEALTH_TIMEOUT_SECONDS"; then
    echo "Unexpectedly healthy with BAD_IMAGE_TAG=${BAD_IMAGE_TAG}; rollback signal not triggered."
    exit 1
  fi

  echo "Bad deploy detected. Rolling back to image from compose defaults."
  run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" rm -f "$SYNAPSE_SERVICE" || true
  run docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d "$SYNAPSE_SERVICE"

  if wait_for_healthy_service "$SYNAPSE_SERVICE" "$HEALTH_TIMEOUT_SECONDS"; then
    echo "Rollback verification passed: ${SYNAPSE_SERVICE} healthy after rollback."
  else
    echo "Rollback verification failed: ${SYNAPSE_SERVICE} did not recover."
    exit 1
  fi
else
  echo "D6 rollback automation is available but not executed."
  echo "Run with ROLLBACK_TEST=1 and BAD_IMAGE_TAG=<known_bad_tag> to verify auto rollback behavior."
fi

echo "Validation flow completed."
