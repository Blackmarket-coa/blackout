#!/usr/bin/env bash
#
# Verify blackout-frontend + blackout-api (plus postgres/redis) after a deploy.
# Run from the server shell, no arguments needed. Overridable via env:
#   COMPOSE_DIR   default /opt/blackout-infra
#   REPO_DIR      default ~/blackout-new
#   FRONTEND      default blackout-frontend
#   API           default blackout-api
#   POSTGRES      default blackout-postgres
#   REDIS         default blackout-redis
#
# Exit status: 0 = all critical checks passed, 1 = at least one failed.

set -u
set -o pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/blackout-infra}"
REPO_DIR="${REPO_DIR:-$HOME/blackout-new}"
FRONTEND="${FRONTEND:-blackout-frontend}"
API="${API:-blackout-api}"
POSTGRES="${POSTGRES:-blackout-postgres}"
REDIS="${REDIS:-blackout-redis}"

PASS=0
FAIL=0
WARN=0
FAILURES=()

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m' "$*"; }
red()   { printf '\033[31m%s\033[0m' "$*"; }
yellow(){ printf '\033[33m%s\033[0m' "$*"; }

section() { echo; bold "=== $* ==="; }

ok()    { echo "  $(green "PASS") $*"; PASS=$((PASS+1)); }
bad()   { echo "  $(red   "FAIL") $*"; FAIL=$((FAIL+1)); FAILURES+=("$*"); }
warn()  { echo "  $(yellow "WARN") $*"; WARN=$((WARN+1)); }
info()  { echo "       $*"; }

need() {
  command -v "$1" >/dev/null 2>&1 || { bad "$1 not installed"; return 1; }
}

# ---------------------------------------------------------------------------
section "Preconditions"
# ---------------------------------------------------------------------------

need docker || exit 1
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
  ok "docker compose plugin available"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
  ok "legacy docker-compose available"
else
  bad "neither docker compose nor docker-compose found"
  exit 1
fi

if [ -d "$COMPOSE_DIR" ]; then
  ok "compose dir exists: $COMPOSE_DIR"
else
  bad "compose dir missing: $COMPOSE_DIR"
  exit 1
fi

# ---------------------------------------------------------------------------
section "1. Container state + health"
# ---------------------------------------------------------------------------

( cd "$COMPOSE_DIR" && $COMPOSE ps ) || warn "compose ps failed"

for c in "$FRONTEND" "$API" "$POSTGRES" "$REDIS"; do
  if ! docker inspect "$c" >/dev/null 2>&1; then
    bad "$c: container not found"
    continue
  fi
  state=$(docker inspect --format '{{.State.Status}}' "$c")
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$c")
  restarts=$(docker inspect --format '{{.RestartCount}}' "$c")
  line="$c state=$state health=$health restarts=$restarts"
  if [ "$state" != "running" ]; then
    bad "$line"
  elif [ "$health" = "unhealthy" ]; then
    bad "$line"
  elif [ "$health" = "starting" ]; then
    warn "$line (still in start_period, re-check in ~30s)"
  elif [ "$restarts" -gt 0 ] 2>/dev/null; then
    warn "$line (container has restarted)"
  else
    ok "$line"
  fi
done

# ---------------------------------------------------------------------------
section "2. Recent logs (last 40 lines each)"
# ---------------------------------------------------------------------------

for c in "$FRONTEND" "$API"; do
  echo "--- $c ---"
  docker logs --tail=40 "$c" 2>&1 | sed 's/^/    /' || bad "could not read logs for $c"
done

# ---------------------------------------------------------------------------
section "3. Probe /healthz from inside each container"
# ---------------------------------------------------------------------------

# Frontend (nginx:alpine has wget built-in).
if out=$(docker exec "$FRONTEND" wget -qO- --timeout=3 http://127.0.0.1:8080/healthz 2>&1); then
  if [ "$out" = "ok" ]; then
    ok "frontend /healthz -> ok"
  else
    bad "frontend /healthz returned unexpected body: $out"
  fi
else
  bad "frontend /healthz probe failed: $out"
fi

# API (python:3.12-slim has python, no curl/wget).
api_probe=$(cat <<'PY'
import sys, urllib.request
try:
    with urllib.request.urlopen("http://127.0.0.1:9000/healthz", timeout=3) as r:
        sys.stdout.write(f"{r.status} {r.read().decode()}")
except Exception as e:
    sys.stdout.write(f"ERR {type(e).__name__}: {e}")
    sys.exit(1)
PY
)
if out=$(docker exec "$API" python -c "$api_probe" 2>&1); then
  case "$out" in
    "200 "*'"status"'*'"ok"'*) ok "api /healthz -> $out" ;;
    *) bad "api /healthz unexpected: $out" ;;
  esac
else
  bad "api /healthz probe failed: $out"
fi

# ---------------------------------------------------------------------------
section "4. Cross-container reachability"
# ---------------------------------------------------------------------------

if out=$(docker exec "$FRONTEND" wget -qO- --timeout=3 "http://${API}:9000/healthz" 2>&1); then
  [ -n "$out" ] && ok "frontend -> $API:9000 reachable" || warn "frontend -> $API:9000 empty response"
else
  bad "frontend -> $API:9000 failed: $out"
fi

tcp_probe=$(cat <<'PY'
import sys, socket
host, port = sys.argv[1], int(sys.argv[2])
try:
    s = socket.create_connection((host, port), timeout=3)
    s.close()
    print(f"{host}:{port} ok")
except Exception as e:
    print(f"{host}:{port} ERR {type(e).__name__}: {e}")
    sys.exit(1)
PY
)
if out=$(docker exec "$API" python -c "$tcp_probe" "$POSTGRES" 5432 2>&1); then
  ok "api -> $POSTGRES:5432 reachable ($out)"
else
  bad "api -> $POSTGRES:5432 failed: $out"
fi
if out=$(docker exec "$API" python -c "$tcp_probe" "$REDIS" 6379 2>&1); then
  ok "api -> $REDIS:6379 reachable ($out)"
else
  bad "api -> $REDIS:6379 failed: $out"
fi

# ---------------------------------------------------------------------------
section "5. Published ports / reverse proxy"
# ---------------------------------------------------------------------------

for svc_port in "frontend 8080" "api 9000"; do
  set -- $svc_port
  svc=$1; port=$2
  if mapped=$( ( cd "$COMPOSE_DIR" && $COMPOSE port "$svc" "$port" ) 2>/dev/null ) && [ -n "$mapped" ]; then
    info "$svc:$port published as $mapped"
    host_port=${mapped##*:}
    if out=$(docker run --rm --network host alpine:3 sh -c "wget -qO- --timeout=3 http://127.0.0.1:${host_port}/healthz" 2>&1); then
      [ "$svc" = "frontend" ] && [ "$out" = "ok" ] && ok "host -> $svc /healthz = ok"
      [ "$svc" = "api" ] && echo "$out" | grep -q '"status"' && ok "host -> $svc /healthz returned status json"
    else
      warn "host probe to $svc:$host_port failed: $out"
    fi
  else
    info "$svc port $port not published on host (internal-only, fine if a proxy fronts it)"
  fi
done

proxy=$( ( cd "$COMPOSE_DIR" && $COMPOSE config --services ) 2>/dev/null | grep -E '^(reverse-proxy|nginx|caddy|traefik)$' || true )
if [ -n "$proxy" ]; then
  info "proxy service detected: $proxy"
else
  info "no reverse-proxy service in compose (skipping end-to-end via proxy)"
fi

# ---------------------------------------------------------------------------
section "6. Running images match :stable tags"
# ---------------------------------------------------------------------------

for pair in "$FRONTEND blackout-frontend:stable" "$API blackout-api:stable"; do
  set -- $pair
  container=$1; tag=$2
  if ! docker inspect "$container" >/dev/null 2>&1; then
    continue
  fi
  running_id=$(docker inspect --format '{{.Image}}' "$container")
  tag_id=$(docker image inspect --format '{{.Id}}' "$tag" 2>/dev/null || echo "MISSING")
  if [ "$tag_id" = "MISSING" ]; then
    warn "$tag is not present locally"
  elif [ "$running_id" = "$tag_id" ]; then
    ok "$container is running $tag"
  else
    bad "$container image $running_id != $tag $tag_id (rebuild didn't take effect)"
  fi
done

# ---------------------------------------------------------------------------
section "7. Healthcheck URL sanity (api)"
# ---------------------------------------------------------------------------

if docker inspect "$API" >/dev/null 2>&1; then
  hc=$(docker inspect --format '{{json .Config.Healthcheck}}' "$API")
  if [ "$hc" = "null" ]; then
    warn "$API has no healthcheck configured in compose (container will never report healthy)"
  else
    if echo "$hc" | grep -qE '/healthz\b'; then
      ok "api healthcheck targets /healthz"
    elif echo "$hc" | grep -qE '/health\b'; then
      bad "api healthcheck targets /health but app serves /healthz — fix compose"
    else
      info "api healthcheck: $hc"
    fi
  fi
fi

# ---------------------------------------------------------------------------
section "8. Repo / stash status (read-only)"
# ---------------------------------------------------------------------------

if [ -d "$REPO_DIR/.git" ]; then
  ( cd "$REPO_DIR" \
      && echo "    branch: $(git rev-parse --abbrev-ref HEAD)" \
      && echo "    head:   $(git log -1 --oneline)" \
      && echo "    stash:" \
      && ( git stash list | sed 's/^/      /' || true ) \
      && echo "    status:" \
      && ( git status --short | sed 's/^/      /' || true ) )
else
  warn "$REPO_DIR is not a git repo (skipping stash check)"
fi

# ---------------------------------------------------------------------------
section "Summary"
# ---------------------------------------------------------------------------

echo "  pass: $PASS    warn: $WARN    fail: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo
  echo "  Failures:"
  for f in "${FAILURES[@]}"; do echo "    - $f"; done
  exit 1
fi
exit 0
