#!/usr/bin/env bash
# Before Martin is recreated, check that it will start.
#
#   ./martin/check-fonts.sh [DIR]
#
# DIR is the directory the stack runs from (deploy.sh's $INFRA_DIR; default:
# the current directory). Its martin/martin.yaml names a fonts directory
# (/var/lib/martin/fonts), and Martin 0.14.2 exits at once if that directory
# is missing or holds no font. nginx resolves `martin` when it starts or
# reloads, so a Martin that cannot start can keep the whole site's nginx from
# starting. This exits 0 when martin.yaml names no fonts directory, or when the
# fonts are there and the martin service mounts them; otherwise it says what to
# copy from the repository and exits 1. deploy.sh runs it before recreating.
set -euo pipefail

dir="${1:-.}"
yaml="$dir/martin/martin.yaml"
if [ ! -f "$yaml" ]; then
    echo "check-fonts: $yaml does not exist" >&2
    exit 1
fi
if ! grep -q '/var/lib/martin/fonts' "$yaml"; then
    exit 0
fi
if ! compgen -G "$dir/martin/fonts/*.ttf" >/dev/null; then
    echo "check-fonts: $yaml names /var/lib/martin/fonts, but $dir/martin/fonts holds no font: copy the repository's martin/fonts/ there" >&2
    exit 1
fi
if ! (cd "$dir" && docker compose config martin 2>/dev/null) | grep -q 'target: /var/lib/martin/fonts$'; then
    echo "check-fonts: $yaml names /var/lib/martin/fonts, but the martin service in $dir does not mount it: add './martin/fonts:/var/lib/martin/fonts:ro' to its volumes, as in the repository's docker-compose.yml" >&2
    exit 1
fi
