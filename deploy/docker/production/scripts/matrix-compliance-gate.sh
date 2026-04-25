#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARTIFACT_DIR="${MATRIX_COMPLIANCE_ARTIFACT_DIR:-$SCRIPT_DIR/../ops/evidence/matrix-compliance}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$ARTIFACT_DIR/$TIMESTAMP"
RESULT_JSON="$RUN_DIR/result.json"
RESULT_ENV="$RUN_DIR/result.env"

SMOKE_CMD="${MATRIX_COMPLEMENT_SMOKE_CMD:-}"
SMOKE_PROFILE="${MATRIX_COMPLEMENT_SMOKE_PROFILE:-synapse-deployed-smoke}"
ENABLE_CRYPTO="${ENABLE_MATRIX_COMPLEMENT_CRYPTO:-0}"
CRYPTO_CMD="${MATRIX_COMPLEMENT_CRYPTO_CMD:-}"
CRYPTO_PROFILE="${MATRIX_COMPLEMENT_CRYPTO_PROFILE:-synapse-deployed-crypto}"

mkdir -p "$RUN_DIR"

if [ -z "$SMOKE_CMD" ]; then
  echo "[matrix-gate] FAIL: MATRIX_COMPLEMENT_SMOKE_CMD is required" >&2
  exit 1
fi

run_suite() {
  local suite_name="$1"
  local enabled="$2"
  local cmd="$3"
  local profile="$4"
  local log_path="$5"

  if [ "$enabled" != "1" ]; then
    echo "[matrix-gate] skip ${suite_name} suite" >&2
    printf '%s|%s|%s|%s|%s\n' "${suite_name}" "skipped" "0" "" "$log_path"
    return 0
  fi

  if [ -z "$cmd" ]; then
    echo "[matrix-gate] FAIL: ${suite_name} suite enabled but no command was configured" >&2
    printf '%s|%s|%s|%s|%s\n' "${suite_name}" "failed" "127" "" "$log_path"
    return 0
  fi

  {
    echo "[matrix-gate] suite=${suite_name} profile=${profile}"
    echo "[matrix-gate] cmd=${cmd}"
  } >"$log_path"

  set +e
  bash -lc "$cmd" >>"$log_path" 2>&1
  local exit_code=$?
  set -e

  local status="passed"
  if [ "$exit_code" -ne 0 ]; then
    status="failed"
  fi

  printf '%s|%s|%s|%s|%s\n' "${suite_name}" "$status" "$exit_code" "$cmd" "$log_path"
}

SMOKE_LOG="$RUN_DIR/smoke.log"
CRYPTO_LOG="$RUN_DIR/crypto.log"

smoke_result="$(run_suite "smoke" "1" "$SMOKE_CMD" "$SMOKE_PROFILE" "$SMOKE_LOG")"
crypto_result="$(run_suite "crypto" "$ENABLE_CRYPTO" "$CRYPTO_CMD" "$CRYPTO_PROFILE" "$CRYPTO_LOG")"

IFS='|' read -r smoke_suite smoke_status smoke_code smoke_cmd smoke_log <<<"$smoke_result"
IFS='|' read -r crypto_suite crypto_status crypto_code crypto_cmd crypto_log <<<"$crypto_result"

overall_status="passed"
if [ "$smoke_status" != "passed" ] || [ "$crypto_status" = "failed" ]; then
  overall_status="failed"
fi

export TIMESTAMP overall_status RUN_DIR RESULT_JSON RESULT_ENV smoke_log crypto_log SMOKE_PROFILE smoke_status smoke_code smoke_cmd CRYPTO_PROFILE crypto_status crypto_code crypto_cmd ENABLE_CRYPTO
python3 - <<'PY_JSON'
import json
import os
from pathlib import Path

result = {
    "gate": "matrix-compliance",
    "timestamp_utc": os.environ["TIMESTAMP"],
    "overall_status": os.environ["overall_status"],
    "artifacts": {
        "run_dir": os.environ["RUN_DIR"],
        "result_json": os.environ["RESULT_JSON"],
        "result_env": os.environ["RESULT_ENV"],
        "smoke_log": os.environ["smoke_log"],
        "crypto_log": os.environ["crypto_log"],
    },
    "suites": {
        "smoke": {
            "profile": os.environ["SMOKE_PROFILE"],
            "status": os.environ["smoke_status"],
            "exit_code": int(os.environ["smoke_code"]),
            "command": os.environ["smoke_cmd"],
        },
        "crypto": {
            "profile": os.environ["CRYPTO_PROFILE"],
            "status": os.environ["crypto_status"],
            "exit_code": int(os.environ["crypto_code"]),
            "command": os.environ["crypto_cmd"],
            "enabled": int(os.environ["ENABLE_CRYPTO"]),
        },
    },
}

Path(os.environ["RESULT_JSON"]).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
PY_JSON

cat >"$RESULT_ENV" <<EOF_ENV
MATRIX_COMPLIANCE_GATE_STATUS=$overall_status
MATRIX_COMPLIANCE_GATE_RESULT_JSON=$RESULT_JSON
MATRIX_COMPLIANCE_GATE_RESULT_ENV=$RESULT_ENV
MATRIX_COMPLIANCE_GATE_RUN_DIR=$RUN_DIR
MATRIX_COMPLIANCE_GATE_SMOKE_LOG=$smoke_log
MATRIX_COMPLIANCE_GATE_CRYPTO_LOG=$crypto_log
EOF_ENV

echo "[matrix-gate] status=$overall_status"
echo "[matrix-gate] result_json=$RESULT_JSON"
echo "[matrix-gate] result_env=$RESULT_ENV"

if [ "$overall_status" != "passed" ]; then
  exit 1
fi
