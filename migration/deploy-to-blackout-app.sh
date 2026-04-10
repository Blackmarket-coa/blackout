#!/usr/bin/env bash
# deploy-to-blackout-app.sh
#
# Clones blackout_app, copies all staged migration files, and pushes.
# Run from the migration/ directory after prepare-migration.sh has been run.
#
# Usage: ./deploy-to-blackout-app.sh [branch-name]
#   Default branch: feature/blackout-migration

set -euo pipefail

BRANCH="${1:-feature/blackout-migration}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGING="$SCRIPT_DIR/blackout_app"
CLONE_DIR="$SCRIPT_DIR/_clone_blackout_app"

if [ ! -d "$STAGING/src" ]; then
    echo "ERROR: Staging directory not found. Run prepare-migration.sh first."
    exit 1
fi

echo "==> Cloning blackout_app..."
rm -rf "$CLONE_DIR"
git clone git@github.com:Blackmarket-coa/blackout_app.git "$CLONE_DIR"
cd "$CLONE_DIR"

echo "==> Checking out dev branch..."
git checkout dev

echo "==> Creating migration branch: $BRANCH"
git checkout -b "$BRANCH"

echo "==> Copying staged files..."
# Copy all staged files into the clone, preserving directory structure
cp -r "$STAGING/src/" "$CLONE_DIR/src/"

echo "==> Checking for additional dependencies..."
# Check if yjs and y-indexeddb are in package.json
if ! grep -q '"yjs"' package.json 2>/dev/null; then
    echo "    NOTE: You may need to add 'yjs' and 'y-indexeddb' as dependencies"
fi

echo "==> Files copied:"
git status --short | head -30
echo "..."
git status --short | wc -l
echo " total new/modified files"

echo ""
echo "==> Staging all changes..."
git add -A

echo "==> Committing..."
git commit -m "feat: migrate all Blackout custom features from blackout monorepo

Migrated features:
- Governance (proposals, voting, quorum, delegation)
- Steganography (LSB encoding/decoding, AES-CBC encryption)
- Moderation (AutoMod, timeouts, Draupnir integration)
- Roles (named role system with power level mappings)
- Forum channels (thread-first mode)
- Dead drop channels (time-delayed messages)
- Welcome/onboarding (wizard, welcome screen editor)
- Call/VoIP (Element Call integration)
- Navigation (quick switcher, mentions inbox)
- Extended profiles (avatar decorations, profile editor)
- Settings extensions (appearance, developer, accessibility, privacy)
- Feature flag system (starter/governance/sovereignty presets)
- Solarpunk theme engine (dark canopy, light grove, AMOLED night)
- Design tokens (colors, spacing, radii, typography)
- Shared UI components (RadialBloom, CanopyBar, OverflowSheet, VineActions)

Source: Blackmarket-coa/blackout (apps/blackout-client + packages/core)
All imports rewritten from @blackout/* to local paths (src/lib/bmc-core/)."

echo ""
echo "==> Pushing to origin/$BRANCH..."
git push -u origin "$BRANCH"

echo ""
echo "==> Migration complete!"
echo "    Branch: $BRANCH"
echo "    Repo: Blackmarket-coa/blackout_app"
echo ""
echo "Next steps:"
echo "  1. Open a PR from $BRANCH -> dev"
echo "  2. Run 'npm install' to install any new dependencies"
echo "  3. Run 'npm run build' to verify the build"
echo "  4. Wire new features into Cinny's routing (see migration plan)"
