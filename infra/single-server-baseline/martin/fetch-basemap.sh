#!/usr/bin/env bash
# Download the coalition map's basemap: an area of a Protomaps daily build,
# saved as martin/pmtiles/basemap.pmtiles in the directory the stack runs
# from, where Martin serves it at /tiles/basemap and the client's map reads it
# (no other source is used; see
# apps/blackout-client/src/app/features/coalition/tabs/basemapStyle.ts).
#
#   ./martin/fetch-basemap.sh --bbox WEST,SOUTH,EAST,NORTH [options]
#   ./martin/fetch-basemap.sh --region area.geojson [options]
#
# Options:
#   --into DIR     the directory the stack runs from: the one holding the live
#                  docker-compose.yml and .env (deploy.sh's $INFRA_DIR). By
#                  default $INFRA_DIR, or whichever of /opt/blackout-infra and
#                  /opt/blackout holds a docker-compose.yml. Not the repository
#                  checkout: compose run from there would recreate the live
#                  containers without the live .env.
#   --maxzoom N    deepest zoom level to keep (default: all, 15). Fewer levels
#                  are much smaller; the map still zooms in past the last one.
#   --build DATE   a build by date, YYYYMMDD (default: the newest one whose
#                  schema is version 4, the one the client's style is for).
#   --dry-run      say how much would be downloaded, and download nothing.
#
# Needs curl and the pmtiles command (https://github.com/protomaps/go-pmtiles,
# BSD-3-Clause), for example `go install github.com/protomaps/go-pmtiles@v1.31.2`,
# which installs it as go-pmtiles; set PMTILES=/path/to/it if it is elsewhere.
# pmtiles reads only the parts of the build it needs from build.protomaps.com
# (the whole planet is about 140 GB). The data is OpenStreetMap's, under the
# ODbL; the map shows "© OpenStreetMap contributors".
#
# Afterwards, from the directory the stack runs from, recreate Martin alone
# (it reads its sources when it starts; --no-deps leaves the database be):
#   docker compose up -d --no-deps --force-recreate martin
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
into=""
while [ $# -gt 0 ]; do
    case "$1" in
        --bbox) bbox="${2:?--bbox needs WEST,SOUTH,EAST,NORTH}"; shift 2 ;;
        --region) region="${2:?--region needs a GeoJSON file}"; shift 2 ;;
        --maxzoom) maxzoom="${2:?--maxzoom needs a number}"; shift 2 ;;
        --build) build="${2:?--build needs YYYYMMDD}"; shift 2 ;;
        --into) into="${2:?--into needs the directory the stack runs from}"; shift 2 ;;
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

# Where the stack runs from.
if [ -z "$into" ]; then
    if [ -n "${INFRA_DIR:-}" ]; then
        into="$INFRA_DIR"
    else
        candidates=()
        for dir in /opt/blackout-infra /opt/blackout; do
            [ -f "$dir/docker-compose.yml" ] && candidates+=("$dir")
        done
        if [ "${#candidates[@]}" -ne 1 ]; then
            echo "say where the stack runs from: --into DIR (the directory with the live docker-compose.yml and .env)" >&2
            exit 2
        fi
        into="${candidates[0]}"
    fi
fi
if [ ! -f "$into/docker-compose.yml" ] || [ ! -f "$into/.env" ]; then
    echo "$into does not hold a docker-compose.yml and a .env, so the stack does not run from there" >&2
    exit 2
fi
if [ ! -d "$into/martin/pmtiles" ]; then
    echo "$into/martin/pmtiles does not exist: copy the repository's martin/ folder there first (docs/runbooks/SPATIAL_LAYER_BASE.md, 1.3)" >&2
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

# The client's style is Protomaps' own for their version 4 schema
# (@protomaps/basemaps 5.7.2). A build of another schema version would load
# without an error and draw little or nothing, so only version 4 builds are
# taken. The list is one JSON array of {"key": "YYYYMMDD.pmtiles", ...,
# "version": "4.15.2"}; PROTOMAPS_BUILDS_URL can point at a copy of it.
builds_url="${PROTOMAPS_BUILDS_URL:-https://build-metadata.protomaps.dev/builds.json}"
v4_builds="$(curl -fsS "$builds_url" | grep -o '{[^}]*}' \
    | grep -E '"version": *"4\.' | grep -Eo '"key": *"[0-9]{8}\.pmtiles"' \
    | grep -Eo '[0-9]{8}' | sort || true)"
if [ -z "$build" ]; then
    build="$(printf '%s\n' "$v4_builds" | tail -n 1)"
    if [ -z "$build" ]; then
        echo "found no version 4 build in $builds_url; name one with --build YYYYMMDD" >&2
        exit 1
    fi
elif ! printf '%s\n' "$v4_builds" | grep -qx "$build"; then
    echo "$build is not a version 4 build in $builds_url, which the client's style needs" >&2
    exit 2
fi

out="$into/martin/pmtiles/basemap.pmtiles"
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
echo "Now recreate Martin alone, from there, and check that it serves it:"
echo "  cd $into"
echo "  docker compose up -d --no-deps --force-recreate martin"
echo "  docker compose exec martin wget -qO- http://127.0.0.1:3000/basemap"
