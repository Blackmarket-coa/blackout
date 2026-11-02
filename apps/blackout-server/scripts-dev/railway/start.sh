#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${SYNAPSE_DATA_DIR:-/data}"
CONFIG_PATH="${SYNAPSE_CONFIG_PATH:-${DATA_DIR}/homeserver.yaml}"
LOG_CONFIG_PATH="${SYNAPSE_LOG_CONFIG_PATH:-${DATA_DIR}/log.config}"
SERVER_NAME="${SYNAPSE_SERVER_NAME:-localhost}"
REPORT_STATS="${SYNAPSE_REPORT_STATS:-no}"
PORT="${PORT:-8008}"

mkdir -p "${DATA_DIR}"

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "[railway] generating initial homeserver config at ${CONFIG_PATH}"
  python -m synapse.app.homeserver \
    --generate-config \
    -H "${SERVER_NAME}" \
    -c "${CONFIG_PATH}" \
    --report-stats="${REPORT_STATS}"
fi

python - <<'PY' "${CONFIG_PATH}" "${PORT}" "${LOG_CONFIG_PATH}" "${SYNAPSE_PUBLIC_BASEURL:-}"
import sys
from pathlib import Path

import yaml

config_path = Path(sys.argv[1])
port = int(sys.argv[2])
log_config = sys.argv[3]
public_baseurl = sys.argv[4]

with config_path.open("r", encoding="utf-8") as f:
    config = yaml.safe_load(f)

listeners = config.setdefault("listeners", [])
if listeners:
    listener = listeners[0]
else:
    listener = {
        "port": port,
        "tls": False,
        "type": "http",
        "x_forwarded": True,
        "resources": [{"names": ["client", "federation"], "compress": False}],
    }
    listeners.append(listener)

listener["port"] = port
listener["bind_addresses"] = ["0.0.0.0"]
listener["tls"] = False
listener["type"] = "http"
listener["x_forwarded"] = True
listener.setdefault("resources", [{"names": ["client", "federation"], "compress": False}])

config["enable_media_repo"] = config.get("enable_media_repo", False)
config["log_config"] = log_config

# Railway routes stderr logs as errors. Synapse emits an informational admin warning
# about using matrix.org as a trusted key server unless this flag is explicitly set.
# We default it to true for generated Railway configs to avoid noisy false-positive
# startup errors while keeping normal behaviour for hand-managed configs.
config.setdefault("suppress_key_server_warning", True)

if public_baseurl:
    config["public_baseurl"] = public_baseurl

with config_path.open("w", encoding="utf-8") as f:
    yaml.safe_dump(config, f, sort_keys=False)
PY

echo "[railway] starting homeserver on ${PORT} using ${CONFIG_PATH}"
exec python -m synapse.app.homeserver -c "${CONFIG_PATH}"
