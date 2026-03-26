#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Blackout Mobile Setup              ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
MISSING=0

if ! command -v pnpm >/dev/null 2>&1; then
  echo -e "${RED}✗ pnpm not found${NC} — install with: npm i -g pnpm"
  MISSING=1
fi

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}✗ node not found${NC} — install Node.js 22+"
  MISSING=1
else
  NODE_VERSION="$(node --version | tr -d 'v')"
  NODE_MAJOR="${NODE_VERSION%%.*}"
  if [ "${NODE_MAJOR}" -lt 22 ]; then
    echo -e "${RED}✗ node ${NODE_VERSION}${NC} — Node.js 22+ is required"
    MISSING=1
  else
    echo -e "${GREEN}✓ node v${NODE_VERSION}${NC}"
  fi
fi

if [ $MISSING -eq 1 ]; then
  echo ""
  echo -e "${RED}Missing prerequisites. Install them and re-run.${NC}"
  exit 1
fi

cd "$(dirname "$0")/.."

# Install dependencies
echo ""
echo -e "${BOLD}Installing dependencies...${NC}"
pnpm install

# Build the web app
echo ""
echo -e "${BOLD}Building blackout-web...${NC}"
pnpm build:web

# Add native platforms if not present
if [ ! -d "ios/App" ]; then
  echo ""
  echo -e "${BOLD}Adding iOS platform...${NC}"
  npx cap add ios 2>/dev/null || echo -e "${YELLOW}⚠ iOS requires a Mac with Xcode${NC}"
fi

if [ ! -d "android/app/src" ]; then
  echo ""
  echo -e "${BOLD}Adding Android platform...${NC}"
  if command -v android >/dev/null 2>&1 || [ -n "${ANDROID_HOME:-}" ]; then
    npx cap add android
  else
    echo -e "${YELLOW}⚠ Android SDK not found. Set ANDROID_HOME or install Android Studio.${NC}"
    echo -e "${YELLOW}  You can add it later with: npx cap add android${NC}"
  fi
fi

# Sync web build to native projects
echo ""
echo -e "${BOLD}Syncing web build to native projects...${NC}"
if [ -d "android/app/src" ]; then
  npx cap sync android || true
fi
if [ -d "ios/App" ]; then
  npx cap sync ios || true
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Setup complete!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  iOS:     npx cap open ios       (opens Xcode)"
echo "  Android: npx cap open android   (opens Android Studio)"
echo ""
echo "For live reload during development:"
echo "  1. Start the web dev server:  pnpm web:dev"
echo "  2. Edit capacitor.config.ts → uncomment server.url"
echo "  3. Set url to http://YOUR_IP:5173"
echo "  4. Run: npx cap run ios  OR  npx cap run android"
