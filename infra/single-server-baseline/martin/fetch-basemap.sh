#!/usr/bin/env bash
# Download the coalition map's basemap: an area of a Protomaps daily build,
# saved as martin/pmtiles/basemap.pmtiles, which Martin serves at
# /tiles/basemap and the client's map reads (no other source is used; see
# apps/blackout-client/src/app/features/coalition/tabs/basemapStyle.ts).
#
#   ./martin/fetch-basemap.sh --bbox WEST,SOUTH,EAST,NORTH [options]
#   ./martin/fetch-basemap.sh --region area.geojson [options]
#
# Options:
#   --maxzoom N    deepest zoom level to keep (default: all, 15). Fewer levels
#                  are much smaller; the map still zooms in past the last one.
#   --build DATE   a build by date, YYYYMMDD (default: the newest).
#   --dry-run      say how much would be downloaded, and download nothing.
#
# Needs curl and the pmtiles command (https://github.com/protomaps/go-pmtiles,
# BSD-3-Clause), for example `go install github.com/protomaps/go-pmtiles@v1.31.2`,
# which installs it as go-pmtiles; set PMTILES=/path/to/it if it is elsewhere.
# pmtiles reads only the parts of the build it needs from build.protomaps.com
# (the whole planet is about 140 GB). The data is OpenStreetMap's, under the
# ODbL; the map shows "© OpenStreetMap contributors".
#
# Run it on the server, from infra/single-server-baseline/, then recreate
# Martin, which reads its sources when it starts (recreate rather than
# restart, so it also picks up a changed definition, such as the fonts mount):
#   docker compose up -d --force-recreate martin
set -euo pipefail

usage() {
    # The comment block at the top of this file, without its "# ".
    awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
    exit "${1:-0}"
}

bbox=""
region=""
maxzoom=""
build=""
dry_run=""
while [ $# -gt 0 ]; do
    case "$1" in
        --bbox) bbox="${2:?--bbox needs WEST,SOUTH,EAST,NORTH}"; shift 2 ;;
        --region) region="${2:?--region needs a GeoJSON file}"; shift 2 ;;
        --maxzoom) maxzoom="${2:?--maxzoom needs a number}"; shift 2 ;;
        --build) build="${2:?--build needs YYYYMMDD}"; shift 2 ;;
        --dry-run) dry_run="--dry-run"; shift ;;
        -h|--help) usage 0 ;;
        *) echo "unknown argument: $1" >&2; usage 2 ;;
    esac
done

if [ -z "$bbox" ] && [ -z "$region" ]; then
    echo "say which area to download: --bbox WEST,SOUTH,EAST,NORTH or --region FILE" >&2
    usage 2
fi
if [ -n "$bbox" ] && ! printf '%s' "$bbox" | grep -Eq '^-?[0-9.]+,-?[0-9.]+,-?[0-9.]+,-?[0-9.]+$'; then
    echo "--bbox is four numbers: WEST,SOUTH,EAST,NORTH (longitude, latitude)" >&2
    exit 2
fi
if [ -n "$maxzoom" ] && ! printf '%s' "$maxzoom" | grep -Eq '^([0-9]|1[0-5])$'; then
    echo "--maxzoom is a whole number from 0 to 15" >&2
    exit 2
fi
if [ -n "$build" ] && ! printf '%s' "$build" | grep -Eq '^[0-9]{8}$'; then
    echo "--build is a date, YYYYMMDD" >&2
    exit 2
fi

pmtiles="${PMTILES:-}"
if [ -z "$pmtiles" ]; then
    pmtiles="$(command -v pmtiles || command -v go-pmtiles || true)"
fi
if [ -z "$pmtiles" ] || [ ! -x "$pmtiles" ]; then
    echo "the pmtiles command is not installed; see the top of this script" >&2
    exit 1
fi

if [ -z "$build" ]; then
    # builds.json lists every build as {"key": "YYYYMMDD.pmtiles", ...}, oldest first.
    build="$(curl -fsS https://build-metadata.protomaps.dev/builds.json \
        | grep -Eo '"key": *"[0-9]{8}\.pmtiles"' | tail -n 1 | grep -Eo '[0-9]{8}')"
    if [ -z "$build" ]; then
        echo "could not find the newest build; name one with --build YYYYMMDD" >&2
        exit 1
    fi
fi

here="$(cd "$(dirname "$0")" && pwd)"
out="$here/pmtiles/basemap.pmtiles"
partial="$out.partial"
source_url="https://build.protomaps.com/$build.pmtiles"

args=(extract "$source_url" "$partial")
[ -n "$bbox" ] && args+=("--bbox=$bbox")
[ -n "$region" ] && args+=("--region=$region")
[ -n "$maxzoom" ] && args+=("--maxzoom=$maxzoom")
[ -n "$dry_run" ] && args+=("$dry_run")

echo "Protomaps build $build -> $out"
rm -f "$partial"
"$pmtiles" "${args[@]}"
if [ -n "$dry_run" ]; then
    exit 0
fi
"$pmtiles" show "$partial" >/dev/null
mv -f "$partial" "$out"
echo
echo "Saved $out ($(du -h "$out" | cut -f1))."
echo "Now recreate Martin and check that it serves it:"
echo "  docker compose up -d --force-recreate martin"
echo "  docker compose exec martin wget -qO- http://127.0.0.1:3000/basemap"
