#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="/data/homeserver.yaml"
TEMPLATE_PATH="/templates/homeserver.yaml.template"
PORT="${PORT:-8008}"

# Prefer an explicit SERVER_NAME, then Railway-style SYNAPSE_SERVER_NAME, and
# finally a localhost default so container boot doesn't immediately crash-loop
# when only DB/redis secrets are wired.
SERVER_NAME="${SERVER_NAME:-${SYNAPSE_SERVER_NAME:-localhost}}"
export SERVER_NAME
PROFILE_INPUT="$(echo "${BLACKOUT_PROFILE:-}" | tr '[:upper:]' '[:lower:]')"
SELECTED_PROFILE=""
PROFILE_REASON=""

if [[ -n "$PROFILE_INPUT" ]]; then
  case "$PROFILE_INPUT" in
    managed|standalone|constrained)
      SELECTED_PROFILE="$PROFILE_INPUT"
      PROFILE_REASON="explicit BLACKOUT_PROFILE"
      ;;
    *)
      echo "[entrypoint] ERROR: invalid BLACKOUT_PROFILE='$PROFILE_INPUT'. Expected one of: managed, standalone, constrained."
      exit 1
      ;;
  esac
else
  missing=()
  for required_var in DATABASE_HOST DATABASE_PASSWORD REDIS_HOST REGISTRATION_SHARED_SECRET; do
    if [[ -z "${!required_var:-}" ]]; then
      missing+=("$required_var")
    fi
  done
  if [[ ${#missing[@]} -eq 0 ]]; then
    SELECTED_PROFILE="managed"
    PROFILE_REASON="auto detect (managed dependencies present)"
  else
    SELECTED_PROFILE="standalone"
    PROFILE_REASON="auto fallback (managed dependencies missing: ${missing[*]})"
  fi
fi

echo "[entrypoint] startup profile=${SELECTED_PROFILE} reason=${PROFILE_REASON} server_name=${SERVER_NAME} port=${PORT}"

mkdir -p /data

if [[ ! -f "$CONFIG_PATH" ]]; then
  if [[ "$SELECTED_PROFILE" == "managed" ]]; then
    missing=()
    for required_var in DATABASE_HOST DATABASE_PASSWORD REDIS_HOST REGISTRATION_SHARED_SECRET; do
      if [[ -z "${!required_var:-}" ]]; then
        missing+=("$required_var")
      fi
    done

    if [[ ${#missing[@]} -ne 0 ]]; then
      echo "[entrypoint] ERROR: BLACKOUT_PROFILE=managed requires env vars: DATABASE_HOST DATABASE_PASSWORD REDIS_HOST REGISTRATION_SHARED_SECRET"
      echo "[entrypoint] ERROR: missing vars: ${missing[*]}"
      echo "[entrypoint] ACTION: provide managed dependencies or set BLACKOUT_PROFILE=standalone|constrained for sqlite mode."
      exit 1
    fi

    # Managed-hosting operator controls:
    # - BLACKOUT_MANAGED_READINESS_CHECKS=true|false (default true)
    # - BLACKOUT_BACKUP_VERIFY_HOOK / BLACKOUT_RESTORE_VERIFY_HOOK
    # - BLACKOUT_BACKUP_HOOK_REQUIRED=true|false
    # - BLACKOUT_RESTORE_HOOK_REQUIRED=true|false
    python -m synapse.util.managed_hosting readiness
    python -m synapse.util.managed_hosting run-hooks

    envsubst < "$TEMPLATE_PATH" > "$CONFIG_PATH"
  else
    echo "[entrypoint] generating ${SELECTED_PROFILE} sqlite config"
    python -m synapse.app.homeserver \
      --generate-config \
      -H "$SERVER_NAME" \
      -c "$CONFIG_PATH" \
      --report-stats=no
    python -m synapse.util.blackout_profiles \
      --config-path "$CONFIG_PATH" \
      --profile "$SELECTED_PROFILE" \
      --port "$PORT" \
      --public-baseurl "${SYNAPSE_PUBLIC_BASEURL:-}"
  fi
fi

if [[ ! -f "/data/${SERVER_NAME}.signing.key" ]]; then
  python -m synapse.app.homeserver \
    --config-path "$CONFIG_PATH" \
    --generate-keys
fi

python -m synapse.app.homeserver --config-path "$CONFIG_PATH"
