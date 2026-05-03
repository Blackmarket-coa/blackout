#!/usr/bin/env bash
#
# Render synapse/homeserver.yaml from homeserver.yaml.template using the
# secrets in the deployment .env file.
#
# IMPORTANT: This script is idempotent by design. Re-rendering homeserver.yaml
# with a different SYNAPSE_MACAROON_SECRET_KEY invalidates every existing
# access token (M_UNKNOWN_TOKEN), forcing every user to log in again. Once
# rendered, the file must not be silently overwritten. Pass --force only when
# you intentionally accept that consequence.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE="${SCRIPT_DIR}/homeserver.yaml.template"
OUTPUT="${SCRIPT_DIR}/homeserver.yaml"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env}"

force=0
for arg in "$@"; do
  case "${arg}" in
    --force) force=1 ;;
    -h|--help)
      cat <<EOF
Usage: $0 [--force]

Renders ${TEMPLATE} -> ${OUTPUT} using ${ENV_FILE}.

Refuses to overwrite an existing ${OUTPUT} unless --force is given, because
re-rendering rotates SYNAPSE_MACAROON_SECRET_KEY and logs every user out.
EOF
      exit 0
      ;;
    *) echo "unknown argument: ${arg}" >&2; exit 2 ;;
  esac
done

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "template not found: ${TEMPLATE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "env file not found: ${ENV_FILE}" >&2
  echo "set ENV_FILE=/path/to/.env or copy .env.example to .env first" >&2
  exit 1
fi

if [[ -f "${OUTPUT}" && "${force}" -ne 1 ]]; then
  cat >&2 <<EOF
refusing to overwrite existing ${OUTPUT}

Re-rendering this file rotates SYNAPSE_MACAROON_SECRET_KEY (and other
secrets) and will invalidate every Matrix access token currently in use.
Every user, every device, every bot will be force-logged-out.

If that is genuinely what you want, run:
    $0 --force

Otherwise leave the existing file in place.
EOF
  exit 1
fi

if ! command -v envsubst >/dev/null 2>&1; then
  echo "envsubst not found (install gettext / gettext-base)" >&2
  exit 1
fi

# Load .env without exporting comments or blank lines, then run envsubst.
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT
envsubst < "${TEMPLATE}" > "${tmp}"

# Sanity check: refuse to write a file with unsubstituted ${...} placeholders.
if grep -qE '\$\{[A-Z_][A-Z0-9_]*\}' "${tmp}"; then
  echo "rendered output still contains unresolved \${VAR} placeholders:" >&2
  grep -nE '\$\{[A-Z_][A-Z0-9_]*\}' "${tmp}" >&2
  echo "fix ${ENV_FILE} and retry" >&2
  exit 1
fi

mv "${tmp}" "${OUTPUT}"
chmod 0640 "${OUTPUT}"
echo "wrote ${OUTPUT}"
