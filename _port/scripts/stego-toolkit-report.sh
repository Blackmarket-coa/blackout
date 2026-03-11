#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${STEGO_TOOLKIT_IMAGE:-dominicbreuker/stego-toolkit:latest}"

usage() {
    cat <<'USAGE'
Run stego-toolkit's quick file checks in Docker.

Usage:
  scripts/stego-toolkit-report.sh <path-to-file>

Environment variables:
  STEGO_TOOLKIT_IMAGE   Override Docker image (default: dominicbreuker/stego-toolkit:latest)

Examples:
  scripts/stego-toolkit-report.sh ./samples/suspicious.png
  STEGO_TOOLKIT_IMAGE=dominicbreuker/stego-toolkit:latest scripts/stego-toolkit-report.sh ./samples/hidden.jpg
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

if [[ $# -ne 1 ]]; then
    usage
    exit 1
fi

INPUT_PATH="$1"
if [[ ! -f "$INPUT_PATH" ]]; then
    echo "error: file not found: $INPUT_PATH" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "error: docker is required but was not found in PATH" >&2
    exit 1
fi

ABS_PATH="$(cd "$(dirname "$INPUT_PATH")" && pwd)/$(basename "$INPUT_PATH")"
WORK_DIR="$(dirname "$ABS_PATH")"
FILE_NAME="$(basename "$ABS_PATH")"
EXT="${FILE_NAME##*.}"
EXT_LOWER="$(printf '%s' "$EXT" | tr '[:upper:]' '[:lower:]')"

case "$EXT_LOWER" in
    jpg|jpeg)
        TOOLKIT_SCRIPT="check_jpg.sh"
        ;;
    png)
        TOOLKIT_SCRIPT="check_png.sh"
        ;;
    *)
        echo "error: unsupported file extension '.$EXT_LOWER' (supported: jpg, jpeg, png)" >&2
        exit 1
        ;;
esac

echo "[stego-toolkit] using image: $IMAGE_NAME"
echo "[stego-toolkit] running $TOOLKIT_SCRIPT on $FILE_NAME"

docker run --rm \
    -v "$WORK_DIR:/data" \
    "$IMAGE_NAME" \
    /bin/bash -lc "cd /data && $TOOLKIT_SCRIPT '$FILE_NAME'"

echo "[stego-toolkit] done. Reports (if generated) are available in: $WORK_DIR"
