#!/usr/bin/env bash
#
# Mint a Synapse registration token and print the token string to stdout.
# Wraps `POST /_synapse/admin/v1/registration_tokens/new` so issuing an
# invite doesn't require remembering the curl. Full runbook:
# infra/single-server-baseline/synapse/ENABLE_REGISTRATION.md
#
# Usage:
#   ADMIN_ACCESS_TOKEN=syt_... ./mint-invite-token.sh [--uses N] [--expires-in DURATION] [--length N]
#
#   --uses N           How many accounts the token can create. Default: 1.
#                      Pass 0 for unlimited.
#   --expires-in DUR   Lifetime as a duration ('30m', '24h', '7d').
#                      Default: never expires.
#   --length N         Length of the generated token. Default: server default.
#   --host URL         Override homeserver. Default: https://matrix.theblackout.app
#
# Env:
#   ADMIN_ACCESS_TOKEN  Required. A Matrix access token for an admin user.
#                       Get it from any logged-in client (settings → help &
#                       about → access token), or bootstrap an admin with
#                       `register_new_matrix_user -a` (see runbook §5).

set -euo pipefail

uses=1
expires_in=""
length=""
host="${BLACKOUT_HOMESERVER:-https://matrix.theblackout.app}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uses) uses="$2"; shift 2 ;;
    --expires-in) expires_in="$2"; shift 2 ;;
    --length) length="$2"; shift 2 ;;
    --host) host="$2"; shift 2 ;;
    -h|--help)
      sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${ADMIN_ACCESS_TOKEN:-}" ]]; then
  echo "ADMIN_ACCESS_TOKEN is required" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 2
fi

# Build the JSON body. uses_allowed=0 → null (unlimited per Synapse).
uses_allowed_json=$([[ "$uses" -eq 0 ]] && echo "null" || echo "$uses")
expiry_json="null"
if [[ -n "$expires_in" ]]; then
  num="${expires_in%[smhd]}"
  unit="${expires_in: -1}"
  case "$unit" in
    s) secs="$num" ;;
    m) secs="$((num * 60))" ;;
    h) secs="$((num * 3600))" ;;
    d) secs="$((num * 86400))" ;;
    *) echo "bad --expires-in: $expires_in (use Ns, Nm, Nh, Nd)" >&2; exit 2 ;;
  esac
  now_ms="$(date +%s%3N)"
  expiry_json="$((now_ms + secs * 1000))"
fi

length_field=""
if [[ -n "$length" ]]; then
  length_field=", \"length\": $length"
fi

body="{\"uses_allowed\": ${uses_allowed_json}, \"expiry_time\": ${expiry_json}${length_field}}"

resp="$(curl -sS -X POST "${host}/_synapse/admin/v1/registration_tokens/new" \
  -H "Authorization: Bearer ${ADMIN_ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "$body")"

if ! echo "$resp" | jq -e '.token' >/dev/null 2>&1; then
  echo "failed to mint token:" >&2
  echo "$resp" >&2
  exit 1
fi

echo "$resp" | jq -r '.token'
