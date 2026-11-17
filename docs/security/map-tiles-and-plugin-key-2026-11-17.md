# Map tiles from this server; a plugin publishing key (2026-11-17)

Two operator decisions from `trust-claims-2026-11-16.md` were taken on
2026-11-17, Free Black Market running on the same server as Blackout:
self-host the coalition map's tiles (decision 8, finding T20), and make the
plugin publishing key (decision 9, finding T22). This records what each
changed, how it was checked, and what was not checked.

## M. The coalition map's background

### Found

-   **The map told OpenStreetMap who was looking where.** With no
    `VITE_MAPLIBRE_STYLE_URL` (no deployment file sets one), `CoalitionMap.tsx`
    used a style whose only source was `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
    so opening the map sent OpenStreetMap the viewer's network address and the
    area on screen (T20).
-   **The deployment's own tile server sat idle.** `infra/single-server-baseline`
    runs Martin 0.14.2 behind nginx at `api.theblackout.app/tiles/`, with a
    PMTiles directory for a basemap. Nothing in the client asked it for
    anything, the directory held no basemap, and the client is served from
    the chat origin, where there was no `/tiles/` route.
-   **The runbook's basemap step could not work.** `SPATIAL_LAYER_BASE.md` and
    `martin/pmtiles/README.md` said to run `pmtiles convert` on a Geofabrik
    `.osm.pbf`. That command converts MBTiles (`go-pmtiles convert --help`:
    "Convert an MBTiles database to PMTiles").
-   **The runbook's smoke test passed on a redirect.** It fetched
    `http://localhost/tiles/...` with `curl -sf`; port 80 answers every path
    but two with a 301 to https, which `-f` does not treat as a failure.
-   **Martin 0.14.2 will not start with an empty fonts directory**
    (`FontError::NoFontFilesFound`, `src/fonts/mod.rs`), and nginx resolves
    `martin` when it starts or reloads. Fonts fetched as a setup step would
    have left a deployment that skipped it with a tile server that does not
    start.

### Done

-   **Client.** `coalition/tabs/basemapStyle.ts` builds the style from
    Protomaps' own layers (`@protomaps/basemaps` 5.7.2, BSD-3-Clause, no
    dependencies, integrity checked against the registry) with three changes:
    the fonts are the ones Martin has, points of interest are left out, and
    so is every icon, because Protomaps serves its fonts and icons from its
    own site. The basemap is read through Martin's TileJSON at
    `<tiles>/basemap` and the glyphs from `<tiles>/font/{fontstack}/{range}`.
    `<tiles>` is `VITE_MAP_TILES_URL` or `/tiles` on the API (this origin in
    production, `VITE_API_BASE_URL`'s host where that is set). There is no
    fallback: when the basemap does not load, the pins stay on a plain
    background and the map says "This server's map background did not load,
    so pins are shown without streets or place names." An operator's own
    style (`VITE_MAPLIBRE_STYLE_URL`) is still used as it is.
-   **Martin.** `base_path: /tiles`, so its TileJSON points tiles back through
    nginx's route; `fonts: /var/lib/martin/fonts`, mounted read-only from
    `martin/fonts/`, which holds Noto Sans Regular, Bold and Italic and Noto
    Sans Devanagari Regular from Ubuntu's `fonts-noto-core` 20201225-2
    (SIL OFL 1.1; checksums in `martin/fonts/README.md`).
-   **nginx.** `location ^~ /tiles/` on the chat origin, proxied to Martin
    like the API host's, with `expires 1d` and no `add_header`, so it keeps
    the server's security headers.
-   **Basemap.** `martin/fetch-basemap.sh` extracts an area (`--bbox` or
    `--region`, `--maxzoom`, `--build`, `--dry-run`) from the newest
    Protomaps daily build into `martin/pmtiles/basemap.pmtiles`, through a
    `.partial` file renamed when complete.
-   **Documents.** `THREAT_MODEL.md` §3 boundary 8, `KNOWN_LIMITATIONS.md`,
    the spatial runbook (topology, basemap, smoke test), the pmtiles and
    fonts READMEs, `RUNBOOK.md` §17, the client's `.env.example`,
    `CONSOLIDATION.md` and the field-operations plan.

### Checked

-   **Tests.** `tests/unit/features/coalition/basemapStyle.test.ts` (13) and
    two new cases in `CoalitionMap.test.tsx`: the style names no address but
    the tile server's TileJSON and glyph route; it asks only for the four
    fonts; it draws no icon; the notice shows for a basemap error and not for
    a font or another source. Against the previous `CoalitionMap.tsx` both
    new map cases fail (the OpenStreetMap address; no notice). A mutation
    pass over the new code (15 mutants: points of interest kept, the
    Devanagari name kept, icon-only layers kept, icon properties kept, the
    API host or `VITE_MAP_TILES_URL` ignored, a looser source match, the
    OpenStreetMap source or Protomaps' glyph site put back, the error
    listener removed or made unconditional, and others) was caught 15 of 15.
-   **Martin 0.14.2, built from its crate, with `martin.yaml` as committed**
    (less its `postgres` section and with local paths). It names the fonts
    exactly as the style asks; its TileJSON for a request carrying
    `Host: theblackout.app` and `X-Forwarded-Proto: https` names
    `https://theblackout.app/tiles/basemap/{z}/{x}/{y}`; a glyph range is
    `200 application/x-protobuf`; a range no font covers (CJK) is 200 and
    empty; an unknown font or source is 404; a tile outside the extract is
    204; with no `.pmtiles` it starts, and `/basemap` is 404.
-   **nginx 1.24 with the baseline configuration** (a copy with the upstream
    hostnames pointed at 127.0.0.1, a self-signed certificate, and the
    `[::]` listens removed because the test machine has no IPv6). `nginx -t`
    passes. `curl` per location: the new `/tiles/` (TileJSON 200, tile 204,
    glyphs 200, unknown 404) carries the six headers of
    `security-headers.conf` plus `Expires` and `Cache-Control: max-age=86400`;
    `/` and `/v1/` carry the same six as before; the API host's `/tiles/` is
    unchanged. Through nginx the TileJSON names `https://theblackout.app/tiles/...`
    on the chat origin and `https://api.theblackout.app/tiles/...` on the API
    host.
-   **Chromium, through that nginx and Martin,** rendering the style the
    client builds, with every name but the two test hosts made unresolvable:
    every request went to `https://theblackout.app` and none failed; the
    TileJSON, four tiles and three glyph ranges loaded; roads, water and
    labels in the three Noto Sans fonts were drawn, and the highway number
    without its shield. The page ran under the CSP of
    `security-headers.conf`. With no basemap, MapLibre's error event was
    `{sourceId: "basemap", status: 404}`, which the notice's check matches.
-   **`fetch-basemap.sh`** passes `shellcheck` 0.9.0. With a stand-in for
    `pmtiles`, it extracts from `https://build.protomaps.com/<build>.pmtiles`
    into `basemap.pmtiles.partial` with the `--bbox` and `--maxzoom` given,
    checks the result, renames it, and on `--dry-run` writes nothing. The
    real `pmtiles` accepts those flags. Its newest-build lookup reads the
    build list's format correctly (20261116, schema 4.15.2).

### Not checked

-   **A real Protomaps extract.** Downloading one was not permitted in the
    session that made this change, so the tiles above were a synthetic set in
    the same layer names (earth, water, roads, places). A real extract also
    has the layers the style draws that the synthetic one lacked (landuse,
    landcover, buildings, boundaries, transit), and the first real run of
    `fetch-basemap.sh` is the first time the whole path meets real data.
-   **The containers.** No Docker daemon was available, so neither
    `ghcr.io/maplibre/martin:v0.14.2` nor `nginx:1.27-alpine` (the compose
    images) ran; the same Martin version ran from source and nginx 1.24 ran
    the configuration.
-   **The other two nginx configurations** (`infra/nginx/`,
    `deploy/docker/blackout-backend/`) have no tile server and were not
    changed; a deployment using them shows the notice.
-   **The full client** in a deployment: the map component's behaviour is
    covered by the unit tests, and the style by the browser check above.
