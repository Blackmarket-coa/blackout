#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/audit/phase0"
mkdir -p "$OUT_DIR"

cd "$ROOT"

echo "Generating Phase 0 audit artifacts in $OUT_DIR"

find module_system -type f | sort > "$OUT_DIR/module_system_files.txt"
find packages/shared-components/src -type f | sort > "$OUT_DIR/shared_components_src_files.txt"
find patches -maxdepth 1 -type f | sort > "$OUT_DIR/patch_files.txt"
find deploy/kubernetes -type f | sort > "$OUT_DIR/kubernetes_files.txt"
find debian -type f | sort > "$OUT_DIR/debian_files.txt"

rg -l "im\.blackout|m\.blackout|Blackout|blackout" src module_system packages/shared-components res deploy/kubernetes debian patches \
  | rg -v "node_modules/" \
  | sort > "$OUT_DIR/blackout_keyword_hits.txt"

{
  find res/fonts -type f 2>/dev/null || true
  find res/img -type f 2>/dev/null || true
  find res/themes -type f 2>/dev/null || true
  find res/css -type f 2>/dev/null || true
} | sort > "$OUT_DIR/branding_candidates.txt"

module_count=$(wc -l < "$OUT_DIR/module_system_files.txt" | tr -d ' ')
shared_count=$(wc -l < "$OUT_DIR/shared_components_src_files.txt" | tr -d ' ')
patch_count=$(wc -l < "$OUT_DIR/patch_files.txt" | tr -d ' ')
k8s_count=$(wc -l < "$OUT_DIR/kubernetes_files.txt" | tr -d ' ')
deb_count=$(wc -l < "$OUT_DIR/debian_files.txt" | tr -d ' ')
keyword_count=$(wc -l < "$OUT_DIR/blackout_keyword_hits.txt" | tr -d ' ')
branding_count=$(wc -l < "$OUT_DIR/branding_candidates.txt" | tr -d ' ')

generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "$OUT_DIR/README.md" <<MD
# Phase 0 Audit Artifacts

Generated: $generated_at

## Counts

- module_system files: $module_count
- shared-components src files: $shared_count
- patch files: $patch_count
- kubernetes files: $k8s_count
- debian files: $deb_count
- blackout keyword hits: $keyword_count
- branding candidate assets/styles: $branding_count

## Files

- module_system_files.txt
- shared_components_src_files.txt
- patch_files.txt
- kubernetes_files.txt
- debian_files.txt
- blackout_keyword_hits.txt
- branding_candidates.txt
MD

echo "Done."
