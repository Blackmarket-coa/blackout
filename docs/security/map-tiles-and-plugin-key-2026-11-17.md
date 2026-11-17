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
    204; with no `.pmtiles` it starts, and `/basemap` is 404. With a fonts
    path that does not exist (a container restarted, not recreated, after the
    fonts mount was added) it exits: "Invalid font file ...". The runbook and
    the script therefore say `docker compose up -d --force-recreate martin`.
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

## P. The plugin publishing key

### Found

-   **Every build trusted a key anyone could sign with.** The client's only
    publishing key was `fbm-dev-hmac`, an HMAC secret written in
    `pluginSignature.ts`; its `process.env` override is undefined in a browser
    build, so the literal shipped (T22). The comment beside it said real keys
    rotated through `/.well-known/freeblackmarket-publishing-keys.json`; no code
    fetched that.
-   **Free Black Market already signs with Ed25519.** The API passes FBM's
    envelope through unchanged (`issueSignedBundle` in
    `integrations/marketplace/freeblackmarket.ts`), and its test signs the way
    FBM's `signBlackoutEnvelope` does, with an Ed25519 key. The client could
    verify Ed25519 already; it had no such key to verify against.
-   **The client builds with no build arguments.** `deploy.sh` runs
    `docker build -f apps/blackout-client/Dockerfile .` and the Dockerfile
    takes none, so a key passed only at build time would reach no deployed
    build.
-   **A failed check showed its code.** The install dialog displayed
    "Refusing to install — signature verification failed (unknown-key-id)".

### Done

-   **Client** (`features/monetization/install/`). The keys a bundle is
    checked against are the Ed25519 keys in `publishingKeys.ts` (committed, so
    every build, web, desktop and mobile, pins the same ones, and a change to
    them is reviewed), any in `VITE_PLUGIN_PUBLISHING_KEYS` for one build, and,
    in a development build only, `fbm-dev-hmac`. An entry that is not an
    Ed25519 public key (SPKI with OID 1.3.101.112) under a plain key id is
    ignored, so an HMAC secret cannot be pinned. Outside development an HMAC
    key is refused even if it is in the list (`hmac-key-refused`), and an
    empty list refuses everything (`no-publishing-key`). The install dialog
    says why in words ("Not installed: this copy of the app trusts no plugin
    publisher yet, so it installs no plugins.", and so on).
-   **`tools/plugins/publishing-key.mjs`.** `generate` writes a new private key
    (PKCS#8 PEM, mode 0600, never over an existing file) and prints the line
    to pin; `public` prints it for an existing key, such as the one FBM signs
    with now; `verify` checks a bundle the way a production client does,
    against a key list or the keys pinned in the source. Its tests run in CI
    (`plugin-publishing-key` in `ci.yml`).
-   **The stub marketplace** signs with an Ed25519 key when
    `FREEBLACKMARKET_STUB_SIGNING_KEY_FILE` and `..._KEY_ID` are set, so a
    demo running it behind a production build can pin that key; without them
    it signs with the development key, as before.
-   **Documents.** `THREAT_MODEL.md` §6a (the mitigation and its residual
    risk), `KNOWN_LIMITATIONS.md`, T22 and decision 9, the client's and the
    backend's `.env.example`, `CONSOLIDATION.md`.

### Where each half of the key goes

The private key is Free Black Market's: its bundle-signing setting, signing
under the key id that is pinned, readable by the process that signs and by
nothing else. FBM runs on the same server as the API, so whoever takes that
server can sign bundles; they could already change the web client it serves,
but a desktop or mobile build that pins the key keeps trusting it until a new
build drops it. The public key goes in `publishingKeys.ts`, in a reviewed
commit. To rotate: pin the new key beside the old, ship builds with both,
switch FBM, then drop the old entry. A key that leaks is dropped at once.

### Checked

-   **Client tests.** `tests/unit/features/monetization/pluginPublishingKeys.test.ts`
    (11): a bundle signed with a generated Ed25519 key installs and one signed
    with another key under the same id does not; the key list takes only
    Ed25519 keys under plain ids (an HMAC secret, a P-256 key, an X25519 key
    of the same length, a truncated key and a bad id are all refused); with
    `DEV` false an HMAC key in the list is refused, the default list holds no
    development key, an empty list installs nothing, keys from
    `VITE_PLUGIN_PUBLISHING_KEYS` and from `publishingKeys.ts` (mocked) are
    trusted and nothing else listed there; in development the stub's key still
    works; each reason has its own sentence. Against the previous code seven of
    the eleven fail; the four that pass cover what already worked (Ed25519
    verification, the development key in development). The four existing
    `pluginSignature.test.ts` cases pass. A mutation pass (12 mutants: the
    empty-list refusal, the HMAC refusal, the development condition, each key
    source, the id and key checks, the OID and length checks, the messages)
    failed the suite every time; one of them, by breaking compilation.
-   **API tests.** `test/freeblackmarket-stub-signer.test.ts` (4): the default
    HMAC signature; an Ed25519 signature under the configured id that
    `crypto.verify` accepts; a missing or bad key id and a non-Ed25519 key
    refused; a whole stub bundle checked as the client checks it. The existing
    stub and signed-bundle suites pass (17 in all).
-   **Together.** A key made by `generate` (file mode 0600), a bundle the stub
    signed with it, `verify` on that bundle, and the client's own
    `verifySignedBundle` in a production setting (`DEV` false, the key in
    `VITE_PLUGIN_PUBLISHING_KEYS`) all agree: accepted.
-   **The production build** (`vite build`): the JavaScript contains neither
    `fbm-dev-hmac` nor its secret. The source maps still carry the original
    source text, as the repository does.

-   **Secret scan.** GitGuardian flagged the HMAC key in
    `pluginPublishingKeys.test.ts` (commit `daeb5c2caa`) as a generic
    high-entropy secret. It is the counting pattern `0011…eeff` that the test
    suite uses as its HMAC test key in nine other files, not a credential, and
    a production build refuses every HMAC key. The test now makes its key at
    run time. That commit stays in history (it is not rewritten), so the
    finding has to be closed in GitGuardian, as a test value, by someone with
    access to that workspace.

### Not checked

-   **Free Black Market's side.** Its signing configuration is outside this
    repository: which key it signs with today, and under which key id, has to
    be read on the server. `verify` on a bundle FBM served is the check to run
    before shipping a build that pins its key.

## R. Independent review of M and P (2026-11-17)

A reviewer given only the code and this repository's rules read the change.
It found no way for an HMAC key, a non-Ed25519 key or the development key to
be trusted in a production build, and no third-party address in the map's
style. It did find the following, all fixed or answered here.

-   **R1. The basemap steps pointed at the checkout, not the stack.** The stack
    runs from a copy of `infra/single-server-baseline` holding the live `.env`
    and override (`deploy.sh`'s `$INFRA_DIR`); the script wrote the basemap
    beside itself, and `docker compose up` run from the checkout would have
    recreated the live Martin (project `blackout-prod`) without that `.env`,
    and possibly the database with it. Now `fetch-basemap.sh --into DIR`
    writes into the directory the stack runs from, refuses one without a
    `docker-compose.yml` and a `.env` or without `martin/pmtiles`, and prints
    `cd DIR` and `docker compose up -d --no-deps --force-recreate martin`; the
    runbook lists the files to copy into that directory. Checked with a
    stand-in `pmtiles` and stand-in directories.
-   **R2. Two `Access-Control-Allow-Origin` headers on the API host's
    `/tiles/`.** Martin 0.14.2 answers every request with its own (the
    request's origin) and the block added `*`; browsers refuse a response
    with two, so a desktop or mobile build (which asks that host) could not
    load the map. The block now hides Martin's (`proxy_hide_header`). Before:
    `access-control-allow-origin: tauri://localhost` and `*`; after: `*` only,
    and a cross-origin fetch from a page on the chat origin succeeds in
    Chromium.
-   **R3. A deploy left Martin one restart from not starting.** `deploy.sh`
    did not recreate Martin, so a new `martin.yaml` could meet an old
    container without the fonts mount at the next restart; Martin then exits,
    and nginx cannot start without the name `martin`. `martin/check-fonts.sh`
    now checks that the fonts are present and that the martin service mounts
    them (by rendering it with `docker compose config`); `deploy.sh` runs it
    and then recreates Martin with the other services. Checked against four directory states: up to date (passes),
    fonts missing and mount missing (each refused, saying what to copy), and
    not yet updated (passes).
-   **R4. A client could choose the host in the TileJSON.** Martin builds the
    tile addresses from `X-Forwarded-Host` or `Forwarded` before `Host`, and
    neither block cleared them; with the answer cacheable, a shared cache in
    front could hand others a TileJSON naming another host. Both blocks now
    set `X-Forwarded-Host $host` and clear `Forwarded`, and the client's style
    pins the tile addresses (`tiles` beside `url`; MapLibre takes the bounds
    and zoom levels from the TileJSON and the addresses from the style).
    Before: `X-Forwarded-Host: tiles.attacker.example` came back in `tiles`;
    after: the real host on both hosts. In Chromium the source still reports
    zoom 0 to 14 and the extract's bounds, and zooming to 16.5 requests level
    14 tiles only.
-   **R5. Boundary 8 left out the proxy in front.** The live host is served
    through Cloudflare, which ends TLS and sees each tile's address with the
    viewer's network address. `THREAT_MODEL.md` §3 boundary 8 and
    `KNOWN_LIMITATIONS.md` now say so.
-   **R6. The notice could show while the background drew.** MapLibre reports
    a failed tile (any status but 404) with the basemap's `sourceId`, so one
    flaky tile showed the notice for good. It now shows only when the source
    itself fails to load (an error without a `tile`, or the TileJSON request);
    a test fires a 502 tile error and expects no notice.
-   **R7. The error listener silenced MapLibre's console errors.** With a
    listener attached MapLibre stops logging; errors the map does not handle
    are now logged with `console.error` as MapLibre would, and the basemap
    failure with a warning. Tested.
-   **R8. `publishing-key.mjs verify` was not quite the client's check.** It
    decoded base64 with Node's lenient decoder (a base64url signature
    passed); it now decodes as `atob` does (whitespace and missing padding
    accepted, anything else refused). Its source reader took commented-out
    pins as pinned; comments are now stripped first, without breaking keys
    that contain `//`. Tested.
-   **R9. Goods from bundles that fail the new check stayed in effect.** When
    the app starts it checks installed bundles again and marks a failure as
    `error`, but the parts of the app that read goods (AI goods, cosmetics,
    privacy tools, audio, vault, stream assets, templates) did not look at the
    mark. They now read only enabled plugins (`enabledPluginsAtom`); a test
    gives an `error`, a `disabled` and a `pending` record goods and expects
    none of them to apply.
-   **R10. The script took the newest build whatever its schema.** It now
    takes the newest build of schema version 4 from Protomaps' build list,
    and refuses a `--build` that is not one (the list also holds 0.x and 3.x
    builds). Checked against the list's real format.
-   **R11.** A runbook line still said the basemap can be rebuilt from
    Geofabrik extracts; corrected.

`nginx -t` passes on the changed configuration, and every location answers
with the headers it did before: the chat origin's `/tiles/` the six of
`security-headers.conf` plus `Expires` and `Cache-Control`, `/` and `/v1/`
the six, the API host's `/tiles/` HSTS, its `Cache-Control` and one
`Access-Control-Allow-Origin`.
