#!/usr/bin/env bash
set -euo pipefail

if ! command -v rustup >/dev/null 2>&1; then
  echo "rustup is required. Install from https://rustup.rs"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install with: npm i -g pnpm"
  exit 1
fi

rustup target add x86_64-apple-darwin aarch64-apple-darwin x86_64-pc-windows-msvc x86_64-unknown-linux-gnu || true

cat <<'MSG'
Development prerequisites check complete.

OS package prerequisites for Tauri:
- Linux (Debian/Ubuntu):
  sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
- macOS:
  Xcode Command Line Tools + Apple signing certificates for release.
- Windows:
  Visual Studio Build Tools + WebView2 runtime + code-signing certificate for release.
MSG

pnpm install
./scripts/generate-icons.sh
