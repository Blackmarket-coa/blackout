#!/bin/bash
set -e

# Single-server baseline deploy script.
#
# Pulls develop into the local checkout, rebuilds the frontend / api / synapse
# images, and recreates the stack via `docker compose` against the runtime
# config in $INFRA_DIR.
#
# REPO_DIR defaults to the repo this script lives in (two levels up).
# INFRA_DIR defaults to /opt/blackout-infra. Override either via env if your
# host layout differs:
#   REPO_DIR=/srv/blackout INFRA_DIR=/etc/blackout-infra ./deploy.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
INFRA_DIR="${INFRA_DIR:-/opt/blackout-infra}"

echo "==> Syncing $REPO_DIR to origin/develop..."
cd "$REPO_DIR" && git fetch origin develop && git reset --hard origin/develop

echo "==> Building images..."
cd "$REPO_DIR" && docker build -f apps/blackout-client/Dockerfile -t blackout-frontend:stable .
cd "$REPO_DIR" && docker build -f apps/blackout-server/services/blackout-api/Dockerfile -t blackout-api:stable apps/blackout-server/
cd "$SCRIPT_DIR" && docker build -f Dockerfile.blackout-api-pg -t blackout-api:stable-pg .
cd "$REPO_DIR" && docker build -f infra/single-server-baseline/Dockerfile.blackout-api-hono -t blackout-api:hono .
cd "$REPO_DIR/apps/blackout-server" && DOCKER_BUILDKIT=1 docker build -f docker/Dockerfile -t blackout-synapse:stable .

echo "==> Redeploying from $INFRA_DIR..."
cd "$INFRA_DIR" && docker compose up -d --force-recreate frontend api synapse reverse-proxy

echo "==> Done!"
docker compose ps
