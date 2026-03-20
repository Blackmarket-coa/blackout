#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required (npm i -g pnpm)."
  exit 1
fi

cd "$(dirname "$0")/.."
pnpm install
pnpm sync

if [ ! -d "ios/App" ]; then
  npx cap add ios
fi

if [ ! -d "android/app" ]; then
  npx cap add android
fi

echo "Blackout mobile scaffold is ready."
