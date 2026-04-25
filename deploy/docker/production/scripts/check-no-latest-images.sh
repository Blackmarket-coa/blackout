#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRODUCTION_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

mapfile -t compose_files < <(find "${PRODUCTION_DIR}" -maxdepth 1 -type f   \( -name 'docker-compose.yml' -o -name 'docker-compose.*.yml' \) | sort)

if [ "${#compose_files[@]}" -eq 0 ]; then
  echo "[check-no-latest-images] FAIL: no production compose files found in ${PRODUCTION_DIR}" >&2
  exit 1
fi

violations="$(rg --line-number --no-heading --color=never '^\s*image:\s*[^#[:space:]]+:latest(?:\s|$)' "${compose_files[@]}" || true)"

if [ -n "${violations}" ]; then
  echo "[check-no-latest-images] FAIL: found forbidden :latest image tag(s) in production compose files:" >&2
  echo "${violations}" >&2
  exit 1
fi

echo "[check-no-latest-images] PASS: no :latest image tags found in production compose files"
