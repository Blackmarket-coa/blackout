#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INPUT_ICON="src-tauri/icons/blackout.svg"
OUTPUT_DIR="src-tauri/icons"

echo "Generating Tauri icon set from $INPUT_ICON"
npx -y @tauri-apps/cli@2.1.0 icon "$INPUT_ICON" --output "$OUTPUT_DIR"
echo "Generated icon files in $OUTPUT_DIR"
