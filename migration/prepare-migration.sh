#!/usr/bin/env bash
# prepare-migration.sh
#
# Prepares all Blackout custom feature files for migration into blackout_app (Cinny fork).
# Run from the blackout monorepo root. Creates migration/blackout_app/ with the target structure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGING="$SCRIPT_DIR/blackout_app"

echo "==> Cleaning staging directory..."
rm -rf "$STAGING"
mkdir -p "$STAGING"

# -------------------------------------------------------------------
# 1) Core business logic → src/lib/bmc-core/
# -------------------------------------------------------------------
echo "==> Copying core business logic..."
mkdir -p "$STAGING/src/lib/bmc-core"
cp "$REPO_ROOT/packages/core/src/types/index.ts"     "$STAGING/src/lib/bmc-core/types.ts"
cp "$REPO_ROOT/packages/core/src/governance/index.ts" "$STAGING/src/lib/bmc-core/governance.ts"
cp "$REPO_ROOT/packages/core/src/crypto/index.ts"     "$STAGING/src/lib/bmc-core/crypto.ts"
cp "$REPO_ROOT/packages/core/src/federation/index.ts"  "$STAGING/src/lib/bmc-core/federation.ts"
cp "$REPO_ROOT/packages/core/src/themes.ts"           "$STAGING/src/lib/bmc-core/themes.ts"
cp "$REPO_ROOT/packages/core/src/quick-actions.ts"    "$STAGING/src/lib/bmc-core/quick-actions.ts"
cp "$REPO_ROOT/packages/core/src/index.ts"            "$STAGING/src/lib/bmc-core/index.ts"

# Fix relative import in governance.ts (../types → ./types)
sed -i "s|from '../types'|from './types'|g" "$STAGING/src/lib/bmc-core/governance.ts"

# -------------------------------------------------------------------
# 2) State atoms → src/app/state/bmc-*.ts
# -------------------------------------------------------------------
echo "==> Copying state atoms..."
mkdir -p "$STAGING/src/app/state"
for f in auth rooms spaces navigation settings unreads composer; do
    cp "$REPO_ROOT/apps/blackout-client/src/app/state/${f}.ts" "$STAGING/src/app/state/bmc-${f}.ts"
done

# -------------------------------------------------------------------
# 3) Hooks → src/app/hooks/
# -------------------------------------------------------------------
echo "==> Copying hooks..."
mkdir -p "$STAGING/src/app/hooks"
for f in useMatrixClient useRoom useTimeline usePowerLevels useSpaceHierarchy useTyping useNotifications; do
    cp "$REPO_ROOT/apps/blackout-client/src/app/hooks/${f}.ts" "$STAGING/src/app/hooks/bmc-${f}.ts"
done

# -------------------------------------------------------------------
# 4) Utilities → src/app/utils/
# -------------------------------------------------------------------
echo "==> Copying utilities..."
mkdir -p "$STAGING/src/app/utils"
for f in room media event markdown; do
    if [ -f "$REPO_ROOT/apps/blackout-client/src/app/utils/${f}.ts" ]; then
        cp "$REPO_ROOT/apps/blackout-client/src/app/utils/${f}.ts" "$STAGING/src/app/utils/bmc-${f}.ts"
    fi
done

# -------------------------------------------------------------------
# 5) Feature modules → src/app/features/
# -------------------------------------------------------------------
echo "==> Copying feature modules..."
FEATURES_SRC="$REPO_ROOT/apps/blackout-client/src/app/features"
FEATURES_DST="$STAGING/src/app/features"
mkdir -p "$FEATURES_DST"

for feature_dir in "$FEATURES_SRC"/*/; do
    feature_name=$(basename "$feature_dir")
    echo "    Copying feature: $feature_name"
    cp -r "$feature_dir" "$FEATURES_DST/$feature_name"
done

# -------------------------------------------------------------------
# 6) Shared components → src/app/components/bmc/
# -------------------------------------------------------------------
echo "==> Copying shared components..."
mkdir -p "$STAGING/src/app/components/bmc"

# Message renderers
if [ -d "$REPO_ROOT/apps/blackout-client/src/app/components/messages" ]; then
    cp -r "$REPO_ROOT/apps/blackout-client/src/app/components/messages" "$STAGING/src/app/components/bmc/messages"
fi

# MatrixBootstrapper, ThemeProvider
for f in MatrixBootstrapper ThemeProvider; do
    if [ -f "$REPO_ROOT/apps/blackout-client/src/app/components/${f}.tsx" ]; then
        cp "$REPO_ROOT/apps/blackout-client/src/app/components/${f}.tsx" "$STAGING/src/app/components/bmc/${f}.tsx"
    fi
done

# -------------------------------------------------------------------
# 7) UI package components → src/app/components/bmc/ui/
# -------------------------------------------------------------------
echo "==> Copying UI package components..."
mkdir -p "$STAGING/src/app/components/bmc/ui"
for f in "$REPO_ROOT/packages/ui/src/components/"*.tsx; do
    [ -f "$f" ] && cp "$f" "$STAGING/src/app/components/bmc/ui/"
done
if [ -f "$REPO_ROOT/packages/ui/src/components/index.ts" ]; then
    cp "$REPO_ROOT/packages/ui/src/components/index.ts" "$STAGING/src/app/components/bmc/ui/index.ts"
fi
if [ -f "$REPO_ROOT/packages/ui/src/index.ts" ]; then
    cp "$REPO_ROOT/packages/ui/src/index.ts" "$STAGING/src/app/components/bmc/ui/package-index.ts"
fi

# -------------------------------------------------------------------
# 8) Types → src/types/
# -------------------------------------------------------------------
echo "==> Copying types..."
mkdir -p "$STAGING/src/types"
if [ -f "$REPO_ROOT/apps/blackout-client/src/types/matrix.ts" ]; then
    cp "$REPO_ROOT/apps/blackout-client/src/types/matrix.ts" "$STAGING/src/types/bmc-matrix.ts"
fi

# -------------------------------------------------------------------
# 9) Styles (if any)
# -------------------------------------------------------------------
echo "==> Copying styles..."
if [ -d "$REPO_ROOT/apps/blackout-client/src/app/styles" ]; then
    mkdir -p "$STAGING/src/app/styles"
    cp -r "$REPO_ROOT/apps/blackout-client/src/app/styles/"* "$STAGING/src/app/styles/" 2>/dev/null || true
fi

# -------------------------------------------------------------------
# 10) Pages (ClientLayout etc.)
# -------------------------------------------------------------------
echo "==> Copying pages..."
if [ -d "$REPO_ROOT/apps/blackout-client/src/app/pages" ]; then
    mkdir -p "$STAGING/src/app/pages"
    cp -r "$REPO_ROOT/apps/blackout-client/src/app/pages/"* "$STAGING/src/app/pages/" 2>/dev/null || true
fi

# -------------------------------------------------------------------
# 11) Client initialization
# -------------------------------------------------------------------
echo "==> Copying client initialization..."
if [ -d "$REPO_ROOT/apps/blackout-client/src/client" ]; then
    mkdir -p "$STAGING/src/client"
    cp -r "$REPO_ROOT/apps/blackout-client/src/client/"* "$STAGING/src/client/" 2>/dev/null || true
fi

echo ""
echo "==> Staging complete! File count:"
find "$STAGING" -name "*.ts" -o -name "*.tsx" | wc -l
echo " TypeScript files staged in $STAGING"
echo ""
echo "==> Now running import rewrites..."

# -------------------------------------------------------------------
# IMPORT REWRITES
# -------------------------------------------------------------------
# Fix all imports in staged files to use the new paths.

find "$STAGING" -type f \( -name "*.ts" -o -name "*.tsx" \) | while read -r file; do
    # @blackout/core → relative path to bmc-core
    # Calculate relative path from file to src/lib/bmc-core
    file_dir=$(dirname "$file")
    rel_to_src="${file_dir#$STAGING/src/}"

    # Determine depth from file to src/lib/bmc-core
    depth=$(echo "$rel_to_src" | tr '/' '\n' | wc -l)
    prefix=""
    for ((i=0; i<depth; i++)); do
        prefix="../$prefix"
    done

    # @blackout/core → relative bmc-core path
    sed -i "s|from '@blackout/core'|from '${prefix}lib/bmc-core'|g" "$file"
    sed -i "s|from '@blackout/core/|from '${prefix}lib/bmc-core/|g" "$file"

    # State atom imports: ../state/auth → ../state/bmc-auth (within hooks/features)
    sed -i "s|from '\.\./state/auth'|from '../state/bmc-auth'|g" "$file"
    sed -i "s|from '\.\./state/rooms'|from '../state/bmc-rooms'|g" "$file"
    sed -i "s|from '\.\./state/spaces'|from '../state/bmc-spaces'|g" "$file"
    sed -i "s|from '\.\./state/navigation'|from '../state/bmc-navigation'|g" "$file"
    sed -i "s|from '\.\./state/settings'|from '../state/bmc-settings'|g" "$file"
    sed -i "s|from '\.\./state/unreads'|from '../state/bmc-unreads'|g" "$file"
    sed -i "s|from '\.\./state/composer'|from '../state/bmc-composer'|g" "$file"

    # Also handle ../../state/ paths (from features/*/files)
    sed -i "s|from '\.\./\.\./state/auth'|from '../../state/bmc-auth'|g" "$file"
    sed -i "s|from '\.\./\.\./state/rooms'|from '../../state/bmc-rooms'|g" "$file"
    sed -i "s|from '\.\./\.\./state/spaces'|from '../../state/bmc-spaces'|g" "$file"
    sed -i "s|from '\.\./\.\./state/navigation'|from '../../state/bmc-navigation'|g" "$file"
    sed -i "s|from '\.\./\.\./state/settings'|from '../../state/bmc-settings'|g" "$file"
    sed -i "s|from '\.\./\.\./state/unreads'|from '../../state/bmc-unreads'|g" "$file"
    sed -i "s|from '\.\./\.\./state/composer'|from '../../state/bmc-composer'|g" "$file"

    # Hook imports: ../hooks/useMatrixClient → ../hooks/bmc-useMatrixClient
    sed -i "s|from '\.\./hooks/useMatrixClient'|from '../hooks/bmc-useMatrixClient'|g" "$file"
    sed -i "s|from '\.\./hooks/useRoom'|from '../hooks/bmc-useRoom'|g" "$file"
    sed -i "s|from '\.\./hooks/useTimeline'|from '../hooks/bmc-useTimeline'|g" "$file"
    sed -i "s|from '\.\./hooks/usePowerLevels'|from '../hooks/bmc-usePowerLevels'|g" "$file"
    sed -i "s|from '\.\./hooks/useSpaceHierarchy'|from '../hooks/bmc-useSpaceHierarchy'|g" "$file"
    sed -i "s|from '\.\./hooks/useTyping'|from '../hooks/bmc-useTyping'|g" "$file"
    sed -i "s|from '\.\./hooks/useNotifications'|from '../hooks/bmc-useNotifications'|g" "$file"

    # Also handle ../../hooks/ paths
    sed -i "s|from '\.\./\.\./hooks/useMatrixClient'|from '../../hooks/bmc-useMatrixClient'|g" "$file"
    sed -i "s|from '\.\./\.\./hooks/useRoom'|from '../../hooks/bmc-useRoom'|g" "$file"
    sed -i "s|from '\.\./\.\./hooks/useTimeline'|from '../../hooks/bmc-useTimeline'|g" "$file"
    sed -i "s|from '\.\./\.\./hooks/usePowerLevels'|from '../../hooks/bmc-usePowerLevels'|g" "$file"
    sed -i "s|from '\.\./\.\./hooks/useSpaceHierarchy'|from '../../hooks/bmc-useSpaceHierarchy'|g" "$file"
    sed -i "s|from '\.\./\.\./hooks/useTyping'|from '../../hooks/bmc-useTyping'|g" "$file"
    sed -i "s|from '\.\./\.\./hooks/useNotifications'|from '../../hooks/bmc-useNotifications'|g" "$file"

    # Hook-to-hook imports (./useRoom → ./bmc-useRoom within hooks dir)
    sed -i "s|from './useMatrixClient'|from './bmc-useMatrixClient'|g" "$file"
    sed -i "s|from './useRoom'|from './bmc-useRoom'|g" "$file"
    sed -i "s|from './useTimeline'|from './bmc-useTimeline'|g" "$file"

    # Util imports: ../utils/room → ../utils/bmc-room
    sed -i "s|from '\.\./utils/room'|from '../utils/bmc-room'|g" "$file"
    sed -i "s|from '\.\./utils/media'|from '../utils/bmc-media'|g" "$file"
    sed -i "s|from '\.\./utils/event'|from '../utils/bmc-event'|g" "$file"
    sed -i "s|from '\.\./utils/markdown'|from '../utils/bmc-markdown'|g" "$file"
    sed -i "s|from '\.\./\.\./utils/room'|from '../../utils/bmc-room'|g" "$file"
    sed -i "s|from '\.\./\.\./utils/media'|from '../../utils/bmc-media'|g" "$file"
    sed -i "s|from '\.\./\.\./utils/event'|from '../../utils/bmc-event'|g" "$file"
    sed -i "s|from '\.\./\.\./utils/markdown'|from '../../utils/bmc-markdown'|g" "$file"

    # State internal cross-refs: ./auth → ./bmc-auth (within state dir)
    sed -i "s|from './auth'|from './bmc-auth'|g" "$file"
    sed -i "s|from './rooms'|from './bmc-rooms'|g" "$file"
    sed -i "s|from './spaces'|from './bmc-spaces'|g" "$file"
    sed -i "s|from './unreads'|from './bmc-unreads'|g" "$file"

    # @blackout/ui → relative path to bmc/ui
    sed -i "s|from '@blackout/ui'|from '${prefix}app/components/bmc/ui'|g" "$file"

    # Style imports (theme.css reference)
    sed -i "s|from '\.\./styles/theme\.css'|from '../styles/theme.css'|g" "$file"
done

echo "==> Import rewrites complete!"
echo ""
echo "==> Final staged file count:"
find "$STAGING" -type f \( -name "*.ts" -o -name "*.tsx" \) | wc -l
echo ""
echo "==> Directory structure:"
find "$STAGING/src" -type d | sort | sed "s|$STAGING/||"
