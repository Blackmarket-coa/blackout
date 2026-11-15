# Dependency advisory triage — 2026-11-14

Seven advisories against the API's HTTP framework and its Node adapter,
published on 2026-11-12, turned CI's **Dependency audit (no un-triaged
advisories, any severity)** (`ci.yml`, osv-scanner v2.3.3 on `pnpm-lock.yaml`)
red on `develop`'s lockfile, and so on every PR. It was seen on 2026-11-14 on
PR #1008, a client-only change that touches no dependency file, in its run
43653547472 (reported to this triage; the run's log was not read from this
session, which has no GitHub API access). Run here on `develop`'s
`pnpm-lock.yaml` and `osv-scanner.toml` (`7a9814ebc9`) at 23:46Z, the same
scanner exits 1 with exactly these rows:

| Advisory            | CVSS (v3.1) | Package           | Version | Fixed   |
| ------------------- | ----------- | ----------------- | ------- | ------- |
| GHSA-jpvv-r467-5p4w | 5.3         | @hono/node-server | 2.1.3   | 2.1.6   |
| GHSA-qv5m-9pm6-hqp3 | 5.3         | @hono/node-server | 2.1.3   | 2.1.6   |
| GHSA-3gg2-335m-rxc6 | 3.4         | hono              | 4.13.11 | 4.13.16 |
| GHSA-46wx-v44x-9hh2 | 5.3         | hono              | 4.13.11 | 4.13.16 |
| GHSA-4h7h-rv7c-7m2v | 5.3         | hono              | 4.13.11 | 4.13.16 |
| GHSA-4m76-xfj5-7975 | 5.3         | hono              | 4.13.11 | 4.13.16 |
| GHSA-h7mg-cq63-vhpq | 5.3         | hono              | 4.13.11 | 4.13.16 |

"Total 2 packages affected by 7 known vulnerabilities (0 Critical, 0 High, 6
Medium, 1 Low, 0 Unknown)", with deepmerge's accepted advisory filtered.
`security.yml`'s **Dependency vulnerability audit** job runs the same
osv-scanner step with the same arguments (`--lockfile=pnpm-lock.yaml`), so it
fails the same way wherever it runs; its `pnpm audit --prod --audit-level high`
step passes (the seven are Moderate or Low).

**Since when.** GitHub published the two node-server advisories at 21:28Z and
21:32Z on 2026-11-12 and the five hono advisories between 23:22Z and 23:31Z;
OSV's records followed by 21:45Z and 23:45Z. Any run of either gate on
`develop`'s lockfile after 23:45Z on 2026-11-12 fails with these rows. Which
`develop` or PR run failed first was not determined: that needs the Actions
API, which this session cannot reach.

**Result:**

-   **@hono/node-server 2.1.3 → 2.1.6** (still pinned exactly) and **hono
    4.13.11 → 4.13.16** (`^4.13.16` in `packages/api` and in the root
    `pnpm.overrides`, a caret as before, not a bare `>=`). Both are the
    versions the advisories name as fixed, the smallest releases outside
    every range. Only `packages/api` depends on either.
-   **Reachability, in short:** of the seven, only GHSA-jpvv's code runs here:
    `@hono/node-server` turns a raw backslash in the request path into `/`
    and resolves `..` on every request (shown on the wire below). No proxy
    rule in this repository that it would get past was found. The other six
    are in code the API does not load or configure: `hono/css`, `csrf()`,
    `validator('form')`, `mount()`, RegExpRouter (SmartRouter settles on
    TrieRouter for this route table) and node-server's own WebSocket support.
    Details per advisory below.
-   **After the bump** the OSV scan exits 0 in UTC, UTC+3 and UTC+14 ("No
    issues found", 1 filtered), Trivy with `security.yml`'s flags exits 0
    with no finding in any of its six targets, and the API's lint, typecheck, integration, post-merge
    and launch-smoke suites pass (Verification).
-   The lockfile changes only the two packages (Lockfile). Nothing was added
    to `osv-scanner.toml`, `.trivyignore` or `pnpm.auditConfig.ignoreGhsas`.
-   **Outside `pnpm-lock.yaml`**, osv-scanner run on the other five
    lockfiles reports 40 advisories in 24 packages (Python and Rust). No gate
    runs OSV on them, and Trivy's gate reports none of them. They are listed,
    not fixed or ignored here, and are left for a separate sweep ("Found
    outside the gates", item 1).

No index of the advisory records exists in this tree (`docs/security` has no
README, and no document lists the `dependency-advisories-*` records), so there
was none to add this record to.

---

## Method

**Advisory text and ranges.** Each ID came from two sources, fetched at 23:33Z
on 2026-11-14:

-   the OSV API (`api.osv.dev/v1/vulns/<id>`);
-   GitHub's own record in `github/advisory-database`
    (`advisories/github-reviewed/2026/11/<id>/<id>.json`, from
    `raw.githubusercontent.com`).

For all seven, the affected ranges, summary and details are identical in
both, and none is withdrawn. Each candidate version was then queried through
OSV `/v1/querybatch` (Summary).

**Versions and code.** The npm registry gave the versions, publish times,
peer ranges and tarball integrity. Four tarballs were read: hono 4.13.11 and
4.13.16, @hono/node-server 2.1.3 and 2.1.6, each downloaded into its own empty
directory and checked against the registry's `sha512` (the two old ones also
match the lockfile's integrity). The two versions of each package were diffed
file by file; the diffs stand in for release notes, which were not read.

**Probes.** Scratch scripts, not committed, kept outside the tarball
directories:

-   the real app from `packages/api/src/index.ts` (`BLACKOUT_DB_MODE=memory`,
    `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test`), served by `serve()` from
    each node-server version as `src/index.ts:512` does, driven with raw
    HTTP/1.1 over a socket (16 requests);
-   a minimal Hono app with path-scoped middleware behind each node-server
    version (6 raw request-targets);
-   the real app's router: which router SmartRouter picks, which routes
    RegExpRouter refuses, and which middleware runs for paths with an encoded
    line terminator (10 requests through `app.request`), on each hono
    version;
-   Go 1.24.7's `net/http/httputil.ReverseProxy` in front of a raw socket, to
    see what request line it forwards for a backslash path (item on
    GHSA-jpvv).

**Scanners.** osv-scanner **v2.3.3**, the version `osv-scanner-action@v2.3.3`
runs (release binary, checked against `osv-scanner_SHA256SUMS`: OK), run as
both workflows run it: `osv-scanner --lockfile=pnpm-lock.yaml` from the
repository root, which loads `osv-scanner.toml` from beside the lockfile.
Trivy **0.69.3** with its DB downloaded at 23:47Z (DB `UpdatedAt` 2026-11-14
19:00Z).

**Reachable** means the vulnerable code runs, in something this repository
builds or deploys, on input an attacker controls.

---

## Summary

| Advisory                              | Package           | GHSA severity | Was     | Now     | Reachable here                                                                                                                                              |
| ------------------------------------- | ----------------- | ------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-jpvv-r467-5p4w (CVE-2026-126210) | @hono/node-server | Moderate      | 2.1.3   | 2.1.6   | The parsing runs on every request; no front-proxy rule it gets past was found (Caddy's `/metrics*` block sits behind Go's proxy, which re-encodes `\`)      |
| GHSA-qv5m-9pm6-hqp3 (CVE-2026-126343) | @hono/node-server | Moderate      | 2.1.3   | 2.1.6   | No: `serve()` is called without the `websocket` option, so node-server installs no upgrade handler; the three WebSocket shims use `ws`/socket.io themselves |
| GHSA-3gg2-335m-rxc6 (CVE-2026-126359) | hono              | Low           | 4.13.11 | 4.13.16 | No: nothing imports `hono/css`                                                                                                                              |
| GHSA-46wx-v44x-9hh2 (CVE-2026-126355) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: nothing imports `hono/csrf`                                                                                                                             |
| GHSA-4h7h-rv7c-7m2v (CVE-2026-126356) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: nothing imports `hono/validator`; bodies are read as JSON                                                                                               |
| GHSA-4m76-xfj5-7975 (CVE-2026-126357) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: no `mount()`; sub-apps are composed with `app.route()`                                                                                                  |
| GHSA-h7mg-cq63-vhpq (CVE-2026-126358) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: SmartRouter picks TrieRouter for this route table (measured), and the advisory names RegExpRouter only                                                  |

OSV `/v1/querybatch` at 23:46Z: hono 4.13.11 → the five hono IDs; 4.13.16,
4.13.17 and 4.13.18 → none. @hono/node-server 2.1.3 → the two node-server IDs;
2.1.6, 2.1.7 and 2.1.8 → none.

The API imports five hono specifiers and nothing else from either package:
`hono` (110 files under `packages/api/src`), `hono/cors` and `hono/body-limit`
(one each), `hono/streaming` (two), and `serve` from `@hono/node-server`
(`src/index.ts:1`). Its tests import `hono` only. No other workspace package
depends on either (the lockfile's only importer of both is `packages/api`).

---

## @hono/node-server: 2.1.3 → 2.1.6 (packages/api)

### GHSA-jpvv-r467-5p4w: a backslash in the path is read as `/`

-   **What:** node-server hands the raw request-target to the WHATWG URL
    parser, which treats `\` in the path of an `http:` URL as `/` and then
    resolves `..`. `/admin\secret` and `/public\..\admin/secret` reach the
    app as `/admin/secret`. A front proxy that keeps the backslash (the
    advisory names nginx on Linux, HAProxy and Envoy) decides on the original
    path, so a path it blocks can be reached. Access control inside the Hono
    app runs on the rewritten path and is not affected. Range
    `introduced 2.0.0`, `fixed 2.1.6` (and `fixed 1.19.18` on the 1.x line). The fix answers 400 to
    a raw backslash in the path (HTTP/1.1, HTTP/2, absolute-form targets and
    WebSocket upgrades); a percent-encoded backslash and one in the query are
    still accepted.
-   **The code runs here.** Every API request goes through
    `serve({ fetch: app.fetch, port: PORT })` (`packages/api/src/index.ts:512`).
    On the wire, against the real app with 2.1.3: `GET /v1/..\metrics`
    answered 200 with the Prometheus text of `/metrics`, `GET /ct\..\health`
    answered `/health`'s 200, and `GET /v1\no-such-route` the JSON 404. In the
    minimal app, `/admin\secret` and `/public\..\admin/secret` both reached
    `/admin/secret` with the `/admin/*` middleware running, as the advisory
    says. With 2.1.6 all three backslash paths, in both harnesses, get
    `400 Bad Request` from the adapter before the app runs.
-   **What a backslash could get past, in this repository's deployments:**
    -   **`deploy/docker/production/Caddyfile:19-20`**,
        `handle_path /metrics* { respond 403 }`, in front of `reverse_proxy app:3000`
        (`:11`). `app` is the backend image (`docker-compose.yml:16`), built
        from `apps/blackout-server/Dockerfile`, which runs `@blackout/api` on
        port 3000 (`Dockerfile:19-22`). This is the advisory's shape: a
        path-based block at the proxy. Caddy is written in Go, and Go's
        reverse proxy re-encodes the backslash: through Go 1.24.7's
        `httputil.ReverseProxy`, `/x/..\metrics` went upstream as
        `GET /x/..%5Cmetrics`, `/admin\secret` as `/admin%5Csecret`. A
        percent-encoded backslash is not a separator to the URL parser, so
        node-server 2.1.3 does not rewrite it (wire probe: `/v1/no-such-route%5C`
        is a 404 on both versions). Caddy itself was not run, so this is
        Go's standard library, not a test of Caddy. Behind the block, the
        app's own `/metrics` handler (`src/index.ts:345-367`) still requires
        `INTERNAL_METRICS_TOKEN` and answers 503 in production when it is
        unset.
    -   **nginx** (`infra/nginx/sites-available/theblackout.app.conf` and
        `infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`):
        on the chat host only `/v1/`, `/i/` and `/c/` go to the API (`:124`,
        `:143`, `:156` and `:163`, `:180`, `:193`), and nginx on Linux keeps a
        backslash (the advisory's account; nginx was not run), so
        `chat…/v1/..\metrics` would reach the API's `/metrics` with 2.1.3. That split is routing, not access control: both files
        proxy every path of `api.theblackout.app` to the API (`location /`,
        `:212` and `:277`), with no deny rule for any API path. The same
        routes are reachable there directly.
    -   No other proxy config in the tree sits in front of the API with a
        path rule: `deploy/docker/blackout-backend/nginx/nginx.conf`'s
        `location /` goes to the web client, and the Kubernetes ingress and
        VirtualService (`deploy/kubernetes/phase4`, `phase6`) front Element
        and Synapse.
-   **Outcome:** reached as parsing, not shown to bypass anything here. Fixed
    by 2.1.6.

### GHSA-qv5m-9pm6-hqp3: `ECONNRESET` during an async WebSocket upgrade

-   **What:** with WebSocket support enabled in node-server, its upgrade
    handler awaits the Hono app before attaching any listener to the socket.
    A client that resets the connection in that window raises an unhandled
    `'error'` and the process exits. Range `introduced 2.0.0`, `fixed 2.1.6`.
-   **Not reached.** node-server's upgrade handler (`setupWebSocket`) is
    installed only when `serve()` is given `websocket: { server }`
    (`createAdaptorServer` in `dist/index.mjs`, read in 2.1.3 and unchanged
    in 2.1.6).
    `src/index.ts:512` passes no `websocket` option, and the minimal harness
    counted 0 `upgrade` listeners on the server `serve()` returns, with 2.1.3
    and 2.1.6. The API's three WebSocket endpoints attach their own handlers
    to that server afterwards (`src/index.ts:522`, `:533`, `:545`): the
    Twitch-IRC and OBS-WebSocket shims call `ws`'s `handleUpgrade`
    synchronously inside the `upgrade` event
    (`integrations/twitch-compat/ircServer.ts:215-223`,
    `integrations/obs-ws-compat/server.ts:298-325`), so the window the
    advisory describes does not exist there; the StreamElements shim is
    socket.io's own upgrade path, not read further.

### What else changed between 2.1.3 and 2.1.6

The whole difference in the shipped ESM (`dist/index.mjs`, `dist/serve-static.mjs`)
is: the backslash check above; the WebSocket listener and destroyed-socket
fixes above; on HTTP/2, an aborted request is now treated as a premature close
(the API serves HTTP/1.1 only); `serveStatic` now passes non-GET/HEAD requests
through and no longer answers OPTIONS like HEAD (not used); and the `hono` peer
range is `^4 || ^5.0.0-0` (was `^4`). It accepts 4.13.16. The CommonJS build
and README change in step.

**On the wire**, the real app served by each version answered 13 of the 16
requests identically (status line, content type, length, CORS and
`nosniff` headers, and a hash of the body with generated ids masked): `GET` and
`HEAD /health`, `GET /metrics`, an unknown path, a percent-encoded path, a CORS
preflight from a foreign origin, register with malformed JSON (400), valid JSON
(201) and a chunked body (201), a 64 MiB `Content-Length` (413 from the body
cap), an absolute-form target, a backslash in the query only, and a
percent-encoded backslash. The other three are the backslash paths above. The
400 that 2.1.6 sends for them comes from the adapter, before any middleware,
so it carries no security headers and is not counted in the HTTP metrics; no
browser sends a raw backslash in a path (it normalises it to `/`).

The API suites dispatch through `app.request` / `app.fetch`, apart from one
test that runs the real `serve()`:
`test/production-app-sigterm.integration.test.ts` ("start-app execs the API,
which drains on SIGTERM and exits 0") starts `deploy/docker/backend/bin/start-app`,
waits for the listening log, sends `GET /health` and checks the drain. It
passed with 2.1.6 (Verification). The wire probe above is the rest of the
evidence for the adapter.

---

## hono: 4.13.11 → 4.13.16 (packages/api)

### GHSA-3gg2-335m-rxc6: `css` helper, closing tag split across an interpolation

-   **What:** `hono/css` escapes `</` inside each interpolated value, but not
    when the `<` ends the text before the value and the value starts with
    `/`, so a client-controlled value can close the `<style>` element during
    server-side rendering and inject HTML. Range `introduced 3.12.0`,
    `fixed 4.13.16`. Low.
-   **Not reached.** No file in `packages/api` (or anywhere else in the
    workspace) imports `hono/css` or `hono/jsx`; the API renders no HTML with
    hono.

### GHSA-46wx-v44x-9hh2: `csrf()` does not check `text/ping` requests

-   **What:** `csrf()` checks `Origin` / `Sec-Fetch-Site` only for the three
    content types a form can send. Chromium's hyperlink auditing
    (`<a ping>`) sends a credentialed cross-origin POST with
    `Content-Type: text/ping` and no preflight, which the middleware passes.
    Range `introduced 0`, `fixed 4.13.16`.
-   **Not reached.** Nothing imports `hono/csrf`, and no `csrf(` call exists.
    The API does not rely on hono's CSRF middleware. Whether its cookie token
    transport (`AUTH_COOKIE_*`, `services/auth.ts:90-92`) needs a CSRF check of
    its own is outside this advisory and was not assessed here.

### GHSA-4h7h-rv7c-7m2v: `validator('form')` skips multipart with extra parameters

-   **What:** `validator('form')` recognises `multipart/form-data` only with a
    lone `boundary` parameter. With another legal parameter (`charset`) or
    extra whitespace, the callback receives `{}` while
    `c.req.parseBody()` still parses the form. Range `introduced 4.5.1`,
    `fixed 4.13.16`.
-   **Not reached.** Nothing imports `hono/validator` and no `validator(`
    call exists; there is no `parseBody()` or `formData()` call either. The
    API validates bodies with zod after `c.req.json()`
    (`readJsonBody`, `src/middleware/validate.ts:13-20`).

### GHSA-4m76-xfj5-7975: `mount()` forwards a path past prefix-scoped middleware

-   **What:** `mount()` / `app.mount()` strip the mount prefix by the route
    pattern's length (wrong for a dynamic prefix such as `/api/:tenant/*`) and,
    since 4.12.21, rebuild the forwarded path from the decoded one (so `%5C..`
    collapses). Either way a request can reach a mounted app's route that the
    outer app guards with sub-path middleware. Range `introduced 0`,
    `fixed 4.13.16`.
-   **Not reached.** No `.mount(` call and no `hono/mount` import. The API
    composes its routers with `app.route()` (`src/index.ts:178-322`), which
    copies each sub-router's routes into the parent's router at registration
    and strips nothing at request time.

### GHSA-h7mg-cq63-vhpq: RegExpRouter skips wildcard middleware

-   **What:** RegExpRouter, which the default `SmartRouter` tries first,
    failed to apply wildcard middleware in three cases: a middleware
    parameter written with the explicit default pattern (`:p{[^/]+}`) against
    a route written `:p` (since 4.13.0); middleware on `/admin/*` against a
    route on `/admin*` (since 4.1.4); and paths with an encoded line
    terminator (`%0A`, `%0D`, `%E2%80%A8`, `%E2%80%A9`), which reached the
    not-found handler with no wildcard middleware (since 4.4.0). TrieRouter,
    LinearRouter and PatternRouter are not affected. Range
    `introduced 4.1.4`, `fixed 4.13.16`.
-   **The API uses the default router**, `new Hono()` (`src/index.ts:131`), and
    guards `/v1/*` with wildcard middleware (`:180`), so this needed
    measuring rather than a grep.
-   **SmartRouter settles on TrieRouter.** After the first request,
    `app.router.name` is `SmartRouter + TrieRouter`, on 4.13.11 and on
    4.13.16. RegExpRouter refuses this route table: adding the 755 registered
    routes in order, it throws `UnsupportedPathError` at route 50,
    `GET /v1/invitations/:id/matrix-status`
    (`routes/invitations.ts:179`), which it cannot combine with the static
    siblings registered before it (`/v1/invitations/preview/*`, `/redeem`,
    `/personal`, `:30`, `:31`, `:147`). Skipping each refused route and
    carrying on, it refuses 48 of the 755, both versions. So the shape is
    common in this API, not one route.
-   **Measured:** on both versions, `/v1/no-such-route` with `%0A`, `%0D`,
    `%E2%80%A8` and `%E2%80%A9` appended, a top-level unknown path with `%0A`,
    and `/v1/aid-pools/abc%0A` and `/v1/aid-pools/a%0Ab` all answered with the
    security headers (`X-Content-Type-Options`, CSP) and the route's or the
    app's JSON 404, like the same paths without the terminator: the wildcard
    middleware ran.
-   The route table has none of the shapes of the first two cases either: no
    parameter with a custom pattern, and no route with a `*` that does not
    follow a `/`.
-   **Not reached.** If a later change removed every conflict, SmartRouter
    would select RegExpRouter; 4.13.16 carries the fix for that case too.

### What else changed between 4.13.11 and 4.13.16

Of the files the API loads (`hono` and its routers, `hono/cors`,
`hono/body-limit`, `hono/streaming`), these changed in the ESM build:

-   `router/trie-router/node.js`, the router in use: when one pattern names
    the same parameter twice, the first value now wins. No route here repeats
    a parameter name (checked over all 755).
-   `utils/url.js`: `c.req.query(key)` falls back to the full parser when an
    earlier key in the query string is percent- or plus-encoded, so an
    encoded key equal to `key` is found; results are unchanged otherwise.
    `stripPathPrefix` is new, for `mount()`.
-   `context.js`: re-creating a finalised response to set a header is skipped
    when its body was already read.
-   `hono-base.js` (the `mount()` fix, `.mount()` deprecated), `hono.js` (a
    stray side-effect import removed; SmartRouter still tries RegExpRouter
    then TrieRouter), `router/reg-exp-router/*` (the GHSA-h7mg fix) and
    `request.js` (doc comments only).

`hono/cors`, `hono/body-limit` and `hono/streaming` did not change. The rest of
the diff is in modules the API does not import: `hono/css`, `hono/jsx`, the
`csrf`, `jwt`, `jwk`, `basic-auth`, `bearer-auth`, `combine`, `etag` and
`serve-static` middleware, the validator, the route helper, and a new
`hono/mount` export.

---

## The bump

-   **Registry** (`registry.npmjs.org`, 23:34Z): hono 4.13.16 was published
    2026-11-01T03:04:37Z, not deprecated, `engines` `node >=16.9.0`, no
    dependencies; later releases are 4.13.17 (2026-11-07) and 4.13.18
    (2026-11-11, `latest`). @hono/node-server 2.1.6 was published
    2026-11-02T10:22:05Z, not deprecated, `node >=20`, peer
    `hono: ^4 || ^5.0.0-0`; later are 2.1.7 (2026-11-11) and 2.1.8
    (2026-11-12, `latest`).
-   **Manifests:** `packages/api/package.json` `"@hono/node-server": "2.1.6"`
    (exact, as before) and `"hono": "^4.13.16"`; root `pnpm.overrides`
    `"hono": "^4.13.16"`. The override rewrites every hono specifier, so it
    decides the version, and a caret that excludes 4.13.15 cannot resolve
    below the fixes.
-   **Why 4.13.16 and not 4.13.18.** pnpm resolves a range to its highest
    match (the 2026-10-30 record saw it do so), which here would be 4.13.18,
    three days old. The advisories name
    4.13.16; it has been out for 13 days. As in the 2026-10-30 record, the
    override was set to `4.13.16` for one `pnpm install --lockfile-only` and
    back to `^4.13.16` for a second; pnpm keeps the locked 4.13.16 because it
    satisfies the range. The lockfile was not edited by hand. A later update
    may take 4.13.17 or above (OSV lists no advisory for either).
-   **Install:** `pnpm install --frozen-lockfile --ignore-scripts` then
    reported "Lockfile is up to date, resolution step is skipped" and added
    the two packages; `packages/api/node_modules` links hono 4.13.16 and
    @hono/node-server 2.1.6. `--ignore-workspace` was not used.

## Lockfile

Compared as parsed YAML, `7a9814ebc9`'s `pnpm-lock.yaml` against this change's:

-   **Removed (2):** `@hono/node-server@2.1.3`, `hono@4.13.11`, from
    `packages:` and from `snapshots:`.
-   **Added (2):** `@hono/node-server@2.1.6`, `hono@4.13.16`, in both, each
    with the registry's `sha512`. The node-server entry's recorded peer is
    `hono: ^4.13.16` (pnpm writes the override into it, as it wrote
    `^4.13.11` before).
-   **Importer changed (1):** `packages/api`'s two specifiers and versions.
-   **Overrides:** `hono: ^4.13.11` → `^4.13.16`.
-   Nothing else moved: 1,493 packages, 1,499 snapshots and 18 importers before
    and after, no entry changed in place, no other top-level key.
    `git diff --stat`: 13 lines out, 13 in.

---

## Found outside the gates (not changed here)

1. **The other five lockfiles carry 40 advisories that no gate fails on.**
   osv-scanner v2.3.3 run on them at 23:46Z (no `osv-scanner.toml` applies
   there) exits 1: "24 packages affected by 40 known vulnerabilities (1
   Critical, 11 High, 10 Medium, 5 Low, 13 Unknown) from 2 ecosystems".

    | Lockfile                                                      | Packages | Advisories | Packages named                                                                                                                                                                                                                                |
    | ------------------------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `apps/blackout-server/poetry.lock`                            | 5        | 10         | black 23.10.1 (4, one CVSS 9.8), pygments 2.15.1, sentry-sdk 1.35.0, soupsieve 2.10 (3), tornado 6.6                                                                                                                                          |
    | `blackout-desktop/src-tauri/Cargo.lock`                       | 18       | 23         | anyhow, event-listener, glib 0.18.5, pin-utils, proc-macro-error, quick-xml 0.37.5 and 0.38.4, rand 0.9.2, rustix, rustls 0.23.37 (4), rustls-webpki, serde_with, tar, tokio 1.50.0, webpki-root-certs, zbus_names, zvariant, zvariant_derive |
    | `services/perturbation/requirements.txt`                      | 1        | 7          | starlette 0.41.3                                                                                                                                                                                                                              |
    | `apps/blackout-server/Cargo.lock`                             | 0        | 0          | —                                                                                                                                                                                                                                             |
    | `apps/blackout-server/services/blackout-api/requirements.txt` | 0        | 0          | —                                                                                                                                                                                                                                             |

    Neither OSV gate reads these files (both pass `--lockfile=pnpm-lock.yaml`
    only). Trivy does, and its gate passes: it reports CRITICAL and HIGH only
    (by its own severity sources), with a fix only, and leaves out development
    dependencies. So Trivy's 0 is
    not evidence that these files are clean. Not triaged here; left for a
    separate sweep, with no entry added to any ignore list.

2. **A backslash in a WebSocket upgrade path is still the shims' business.**
   2.1.6's 400 for a backslash applies to node-server's own upgrade handler,
   which this API does not install. The Twitch-IRC and OBS-WebSocket shims
   parse `req.url` with `new URL(req.url, 'http://localhost')`
   (`ircServer.ts:217`, `obs-ws-compat/server.ts:300`), which reads `\` as `/`
   the same way. No proxy here makes a path decision for those endpoints, so
   nothing is bypassed today.
3. **RegExpRouter refuses 48 of the API's 755 routes**, so every instance of
   the default `new Hono()` here runs on TrieRouter after the first request.
   Not a defect; recorded because it decides whether a RegExpRouter advisory
   applies, and it was not written down before.
4. **`guard:audit-clean` (`pnpm audit --prod --audit-level moderate`) failed
   on `develop`**: exit 1, "8 vulnerabilities found", "2 low \| 6 moderate"
   (the seven above plus deepmerge). It is a local script; CI does not run
   it. After the change it exits 0 with deepmerge's one low row.
5. **`pnpm install` warns about unmet peers** that predate this change and are
   not touched by it (vite-plugin-static-copy, vite-plugin-pwa, folds,
   `packages/ui`'s react-dom), as in the 2026-11-08 record.

---

## Verification

Runs are local, with Node 22.22.0 and pnpm 9.15.4 (the pinned
`packageManager`), from 23:33Z on 2026-11-14 to the commit on 2026-11-15. Commands are
as in `ci.yml` and `security.yml` where those run them. Heavy suites started
only when the 1-minute load average was under 3.5, one at a time.

| Gate                    | Command                                                                                                                                                                                                                                            | Result                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OSV, before             | osv-scanner v2.3.3, `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, on `7a9814ebc9`'s lockfile and toml, 23:46Z                                                                                                                                             | exit 1: 1,493 packages, 1 filtered (deepmerge), the 7 rows above                                                                                             |
| OSV                     | the same on this change, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`, 23:46Z                                                                                                                                                                   | exit 0 in all three: 1,493 packages, "No issues found", 1 filtered, no unused-ignore line                                                                    |
| OSV, other lockfiles    | the same binary on the five other lockfiles (informational; no workflow runs this)                                                                                                                                                                 | exit 1: 40 advisories in 24 packages (item 1 of "Found outside the gates"); unchanged by this change, which touches none of them                             |
| Trivy                   | 0.69.3, `fs .` on a `git archive` extract of `7a9814ebc9` with this change's three manifest and lock files, `security.yml`'s flags (`--severity CRITICAL,HIGH --ignore-unfixed --scanners vuln --exit-code 1 --ignorefile .trivyignore`), fresh DB | exit 0 at 23:47Z: six targets, 0 findings each; `--show-suppressed` lists nothing suppressed. The same on `7a9814ebc9`'s own files: exit 0, six targets at 0 |
| Trivy, all severities   | `fs` on the lockfile alone, no severity or fixed-only filter (production paths, Trivy's default)                                                                                                                                                   | before: the 7 advisories as 6 MEDIUM and 1 LOW (below the gate); after: 0                                                                                    |
| pnpm audit              | `pnpm audit --prod --audit-level high` (`security.yml`) and `--audit-level moderate` (`guard:audit-clean`)                                                                                                                                         | before: high exit 0, moderate exit 1 ("8 vulnerabilities", "2 low \| 6 moderate"); after: both exit 0, "1 vulnerabilities found", 1 low (deepmerge)          |
| lockfile                | `pnpm install --lockfile-only --ignore-scripts`, twice (exact override, then caret)                                                                                                                                                                | exit 0 both; diff as in Lockfile                                                                                                                             |
| install                 | `pnpm install --frozen-lockfile --ignore-scripts`                                                                                                                                                                                                  | exit 0, "Lockfile is up to date, resolution step is skipped", 2 packages added                                                                               |
| API lint                | `pnpm --filter @blackout/api lint` (`eslint "src/**/*.ts" "test/**/*.ts" --max-warnings=0`)                                                                                                                                                        | exit 0, 9 s                                                                                                                                                  |
| API types               | `pnpm --filter @blackout/api typecheck` (`tsc --noEmit -p tsconfig.json`)                                                                                                                                                                          | exit 0, 10 s                                                                                                                                                 |
| API integration         | `pnpm --filter @blackout/api test:integration` with `BLACKOUT_DB_MODE=memory`, `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test` (`ci.yml`)                                                                                                            | exit 0: 2,033 tests, 2,033 pass, 0 fail, 0 cancelled, 0 skipped, 230 s                                                                                       |
| API post-merge          | `pnpm --filter @blackout/api test`, without the CI env above (`turborepo-ci.yml` runs it through `turbo run test` on pushes)                                                                                                                       | exit 0: 2,153 tests, 2,153 pass, 0 fail, 0 cancelled, 0 skipped, 515 s; every one of the 2,033 integration test names appears in it                          |
| API launch smoke        | `pnpm --filter @blackout/api test:launch-smoke` with the same env (`ci.yml`)                                                                                                                                                                       | exit 0: 14 tests, 14 pass, 0 fail, 4 s                                                                                                                       |
| on the wire             | the real app under `serve()` from 2.1.3 and from 2.1.6, 16 raw requests                                                                                                                                                                            | 13 identical; the 3 backslash paths reach the app on 2.1.3 and get 400 from 2.1.6                                                                            |
| router                  | the real app on 4.13.11 and 4.13.16: router name, RegExpRouter build, 10 requests with encoded line terminators                                                                                                                                    | `SmartRouter + TrieRouter` on both; RegExpRouter refuses 48 of 755 routes on both; all 10 requests ran the wildcard middleware on both                       |
| prettier                | `prettier --check` on the changed files (`pnpm-lock.yaml` is in `.prettierignore`)                                                                                                                                                                 | pass on this record, `package.json` and `packages/api/package.json`                                                                                          |
| duplicate paths         | `node tools/ci/check-duplicate-paths.mjs`                                                                                                                                                                                                          | exit 0, five checks passed                                                                                                                                   |
| lint-staged, auth guard | `npx lint-staged --concurrent false` and `node tools/ci/check-auth-secrets.mjs` before the commit                                                                                                                                                  | lint-staged: `prettier --write --ignore-unknown` on the four staged files, no change; guard: "Auth secret hardening check passed", exit 0                    |
| gitleaks                | 8.21.2, `gitleaks dir --no-banner --redact` on each changed file before the commit                                                                                                                                                                 | "no leaks found" on each of the four changed files; the range scan over the branch's commit runs once the commit exists (reported with the PR)               |

**Not verified:**

-   Which CI run first failed with these rows, and the log of PR #1008's run
    43653547472: no GitHub API access from this session.
-   That Caddy forwards a backslash as `%5C`: Go's standard library proxy was
    tested, not Caddy. nginx was not run either; that nginx on Linux keeps the
    backslash is the advisory's statement.
-   The StreamElements shim's socket.io upgrade path was not read.
-   CI had not run on this branch when this record was committed.
