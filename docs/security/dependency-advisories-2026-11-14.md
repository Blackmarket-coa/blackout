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
    are in code the API never selects or calls: `hono/css`, `csrf()` and
    `validator('form')` (not imported), `mount()` (not called), RegExpRouter
    (loaded, and tried on the first request, where SmartRouter settles on
    TrieRouter for this route table, so its matcher is never selected) and
    node-server's own WebSocket support (not switched on). Details per
    advisory below.
-   **Found while checking GHSA-qv5m, not fixed by the bump, and fixed in
    this change by code:** that advisory's code is not reached, but its
    impact was, by another route. One unauthenticated request with
    `Upgrade: websocket` on a path none of the API's three WebSocket shims
    claims (`/v1/health` will do), reset by the client within about a
    second, left an unhandled socket `'error'` and the API process exited 1.
    Measured on the real app with node-server 2.1.3 and with 2.1.6. The
    cause was the API's own `upgrade` listeners, not node-server. The third
    commit of this change puts a guard ahead of them
    (`packages/api/src/webSocketUpgrades.ts`): every upgraded socket has an
    `'error'` listener from the moment Node hands it over, and an upgrade no
    shim takes is answered `404` and closed. Of eleven requests, each to a
    fresh API process, seven ended the process before the fix and none does
    after it (the GHSA-qv5m section; "Found outside the gates", item 1).
    Whether the deployed proxies passed such a request and the reset through
    to the API was not established.
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
    outside the gates", item 2).

No index of the advisory records exists in this tree: `docs/security` has no
README, and `.trivyignore` and `osv-scanner.toml` cite records only for their
own entries. So there was no index to add this record to.

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
    each node-server version as `src/index.ts:513` does, driven with raw
    HTTP/1.1 over a socket (16 requests);
-   a minimal Hono app with path-scoped middleware behind each node-server
    version (6 raw request-targets);
-   the real app's router: which router SmartRouter picks, which routes
    RegExpRouter refuses, and which middleware runs for paths with an encoded
    line terminator (10 requests through `app.request`: 7 with a terminator
    and 3 controls without one), on each hono version;
-   Go 1.24.7's `net/http/httputil.ReverseProxy` in front of a raw socket, to
    see what request line it forwards for a backslash path (item on
    GHSA-jpvv);
-   for the review, the real app served by each node-server version with
    the three WebSocket shims attached, sent one upgrade request that the
    client then resets, in a child process whose exit is observed (item on
    GHSA-qv5m, 18 runs), and a plain Node `http.Server` for the `upgrade`
    hand-off;
-   for the fix, the API started as `deploy/docker/backend/bin/start-app`
    starts it (`node --import tsx src/index.ts` from `packages/api`, memory
    store, a free port), sent one upgrade request that the client then
    resets, a fresh process for each of 11 requests, before the fix and
    again after it; one more process sent 600 unclaimed upgrades reset
    after 0 to 3 ms; and a plain Node `http.Server` sent an HTTP CONNECT
    and a malformed request, to see what Node does with them when nothing
    listens for `connect` or `clientError`.

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

| Advisory                              | Package           | GHSA severity | Was     | Now     | Reachable here                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ----------------- | ------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GHSA-jpvv-r467-5p4w (CVE-2026-126210) | @hono/node-server | Moderate      | 2.1.3   | 2.1.6   | The parsing runs on every request; no front-proxy rule it gets past was found. For Caddy's `/metrics*` block, a probe of Go 1.24.7's `httputil.ReverseProxy` forwarded `\` as `%5C`; Caddy, the proxy that sits in front of the app there, was not run                                                                                                             |
| GHSA-qv5m-9pm6-hqp3 (CVE-2026-126343) | @hono/node-server | Moderate      | 2.1.3   | 2.1.6   | Its code, no: `serve()` is called without the `websocket` option, so node-server installs no upgrade handler. Its impact, yes, by another route and on 2.1.6 too: an unclaimed upgrade reset within about 1 s crashed the API through its own shims' listeners. Fixed in this change by a guard ahead of them, not by the bump ("Found outside the gates", item 1) |
| GHSA-3gg2-335m-rxc6 (CVE-2026-126359) | hono              | Low           | 4.13.11 | 4.13.16 | No: nothing imports `hono/css`                                                                                                                                                                                                                                                                                                                                     |
| GHSA-46wx-v44x-9hh2 (CVE-2026-126355) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: nothing imports `hono/csrf`                                                                                                                                                                                                                                                                                                                                    |
| GHSA-4h7h-rv7c-7m2v (CVE-2026-126356) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: nothing imports `hono/validator`; bodies are read as JSON or text, never as a form                                                                                                                                                                                                                                                                             |
| GHSA-4m76-xfj5-7975 (CVE-2026-126357) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: no `mount()`; sub-apps are composed with `app.route()`                                                                                                                                                                                                                                                                                                         |
| GHSA-h7mg-cq63-vhpq (CVE-2026-126358) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: SmartRouter picks TrieRouter for this route table (measured), and the advisory names RegExpRouter only                                                                                                                                                                                                                                                         |

OSV `/v1/querybatch` at 23:46Z: hono 4.13.11 → the five hono IDs; 4.13.16,
4.13.17 and 4.13.18 → none. @hono/node-server 2.1.3 → the two node-server IDs;
2.1.6, 2.1.7 and 2.1.8 → none.

The API imports five hono specifiers and nothing else from either package:
`hono` (110 files under `packages/api/src`), `hono/cors` and `hono/body-limit`
(one each), `hono/streaming` (two), and `serve` from `@hono/node-server`
(`src/index.ts:1`). Its tests imported `hono` only. The upgrade fix adds a
type-only import of `ServerType` from `@hono/node-server`
(`src/webSocketUpgrades.ts`), and its test imports `serve`. No other workspace
package depends on either (the lockfile's only importer of both is
`packages/api`).

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
    `serve({ fetch: app.fetch, port: PORT })` (`packages/api/src/index.ts:513`).
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
        app's own `/metrics` handler (`src/index.ts:346-368`) still requires
        `INTERNAL_METRICS_TOKEN` and answers 503 in production when it is
        unset.
    -   **nginx** (`infra/nginx/sites-available/theblackout.app.conf` and
        `infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`):
        on the chat host only `/v1/`, `/i/` and `/c/` go to the API (`:124`,
        `:143`, `:156` and `:163`, `:180`, `:193`), and nginx on Linux keeps a
        backslash (the advisory's account; nginx was not run), so
        `chat…/v1/..\metrics` would reach the API's `/metrics` with 2.1.3.
        That split is routing, not access control: on `api.theblackout.app`
        both files proxy every path to the API (`location /`, `:212` and
        `:277`) except the baseline's `/tiles/`, which goes to Martin
        (`:262`), and neither has a deny rule for any API path. The same
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
-   **The advisory's code is not reached.** node-server's upgrade handler
    (`setupWebSocket`) is installed only when `serve()` is given
    `websocket: { server }` (`createAdaptorServer` in `dist/index.mjs`,
    read in 2.1.3 and unchanged in 2.1.6). `src/index.ts:513` passes no
    `websocket` option, and the minimal harness counted 0 `upgrade`
    listeners on the server `serve()` returns, with 2.1.3 and 2.1.6.
-   **Its impact was reached by another route, on both versions, until the
    fix in this change.** The API attaches three `upgrade` listeners of its
    own to that server (at `src/index.ts:520-547` when this was measured, in
    `src/webSocketUpgrades.ts` since the fix), and together they left the
    same window open for any upgrade none of them claims:
    -   Node's HTTP server removes its own socket `'error'` listener before
        it emits `upgrade` (Node 22.22.0, measured: 1 listener on
        `connection`, 0 inside `upgrade`). Once any `upgrade` listener is
        registered, Node hands every upgrade request to the listeners
        instead of answering it as a plain request (with none, Node 22
        passes it to the request handler: measured, 200 from a plain
        `http.Server`).
    -   The Twitch-IRC shim returns without touching the socket when the
        path is not exactly `/twitch-irc`
        (`integrations/twitch-compat/ircServer.ts:216-218`), and the
        OBS-WebSocket shim when it does not start with `/obs-ws/`
        (`integrations/obs-ws-compat/server.ts:299-301`). For the paths
        they claim, `ws`'s `handleUpgrade` or the shim's own 404 takes the
        socket over at once.
    -   The StreamElements shim is socket.io 4.8.3 on engine.io 6.6.11.
        For a path that is not `/se-overlay/`, engine.io's `upgrade`
        listener attaches an `'error'` listener and ends the socket only in
        a timer, 1,000 ms later by default (`engine.io/build/server.js:693-710`;
        the shim sets no `destroyUpgrade` option,
        `integrations/se-overlay-compat/server.ts:93-101`).
    -   So for about a second the socket had no `'error'` listener. A
        client reset in that time was an unhandled `'error'` event, and
        nothing in `packages/api/src` registers a process-level
        `uncaughtException` handler.
-   **Measured before the fix** on the real app (`src/index.ts`'s default export,
    `BLACKOUT_DB_MODE=memory`, `NODE_ENV=test`, a throwaway JWT secret),
    served by `serve()` from 2.1.3 and from 2.1.6 with the three shims
    attached as `src/index.ts` attaches them (3 `upgrade` listeners): one
    raw `GET` with `Upgrade: websocket`, then a TCP reset from the client
    (`socket.resetAndDestroy()`), then `GET /health` 1.5 s later.
    -   `/v1/health`, `/v1/anything` and `/obs-ws-nope`, reset after
        200 ms: the process exits 1 with "Unhandled 'error' event",
        "Error: read ECONNRESET", "Emitted 'error' event on Socket
        instance", on 2.1.3 and on 2.1.6. On 2.1.6, a reset after 20 ms
        or 900 ms and the path `/twitch-irc/x` do the same.
    -   A reset after 1,500 ms: alive (engine.io's timer has ended the
        socket by then). The claimed paths `/twitch-irc`,
        `/obs-ws/no-such-id` (the shim's 404) and
        `/se-overlay/?EIO=4&transport=websocket`, reset after 200 ms:
        alive.
    -   With no shim attached (0 `upgrade` listeners) the same request is
        answered as a plain request and the process lives. With only the
        two `ws` shims it exits even after a 1,500 ms reset, since nothing
        ever takes the socket; with only the socket.io shim, after 200 ms.
    -   Again before the fix, at `6378d7c6bb`, on the API started as
        `deploy/docker/backend/bin/start-app` starts it
        (`node --import tsx src/index.ts` from `packages/api`, memory store,
        `NODE_ENV=development`, a free port), a fresh process for each
        request (01:45Z to 02:01Z on 2026-11-15). `/v1/health` reset after
        0, 20, 200 and 900 ms, and `/v1/anything`, `/obs-ws-nope` and
        `/twitch-irc/x` reset after 200 ms: seven processes, and each
        exited with code 1 without answering the upgrade, with
        `throw er; // Unhandled 'error' event`, `Error: read ECONNRESET` at
        `TCP.onStreamRead` and `Emitted 'error' event on Socket instance` on
        stderr; `GET /health` was refused afterwards. `/v1/health` reset
        after 1,500 ms (engine.io had ended it by then, with no bytes),
        `/twitch-irc` (101), `/obs-ws/no-such-id` (the shim's 404) and
        `/se-overlay/?EIO=4&transport=websocket` (101): alive, and
        `/health` answered 200.
-   **The fix, in this change** (`packages/api/src/webSocketUpgrades.ts`).
    `attachWebSocketShims`, which `src/index.ts:521` calls straight after
    `serve()`, is now the one place the three shims are attached, and it
    installs a guard before them, synchronously, as the first `upgrade`
    listener. No other entry point makes an HTTP server (`src/worker.ts`
    runs the background loops without one).
    -   The guard gives every upgraded socket an `'error'` listener before
        it returns, and never removes it. Node drops its own listener and
        emits `upgrade` in one synchronous step, and a stream emits
        `'error'` on a later tick, so no error can be emitted while the
        socket has none: whichever shims are attached, in whatever order
        their dynamic imports resolve, and whether or not one takes the
        socket.
    -   One turn of the event loop later, when every listener has run, a
        socket that no listener has written to, ended, destroyed or put an
        `'error'` listener of its own on is answered
        `HTTP/1.1 404 Not Found` (`Connection: close`, no body) and
        destroyed, instead of being left to engine.io's timer. The three
        shims take a socket before their listener returns: `ws`'s
        `handleUpgrade` attaches its `'error'` listener on its first line
        (`ws/lib/websocket-server.js`, 8.21.0), the OBS shim writes its 404
        or destroys, and engine.io reaches `ws` synchronously with this
        shim's options (a fixed CORS setting, no `allowRequest`). What they
        accept is unchanged, and the test below holds each of them to it.
    -   Each such upgrade is counted (`http_upgrades_unclaimed_total`), and
        at most one `http_upgrade_unclaimed` line is logged per 10 s, with
        the number since the previous line. Of the request, the line
        carries the first path segment only, and that only when it is short
        and plain (`/v1`): no header, no query string, nothing deeper in
        the path.
    -   `connect` and `clientError` are left to Node, and nothing here
        listens for either: Node closes an HTTP CONNECT without an answer,
        and answers a malformed request 400 before it destroys the socket
        (measured on a plain `http.Server` and on the wired app; a client
        reset after either raised nothing).
-   **Measured after the fix**, at its commit `45383d249e`, the same eleven
    requests, each to a fresh process started the same way (03:09Z): all
    eleven processes stayed up, answered `GET /health` 200 and exited 0 on
    SIGTERM. The eight on unclaimed paths (the seven above and the one
    reset after 1,500 ms) got the guard's `404` and logged one
    `http_upgrade_unclaimed` line; the three on claimed paths answered as
    before (101, the OBS shim's 404, 101). One more process took 600
    unclaimed upgrades reset after 0 to 3 ms, 293 of them before any answer
    had reached the client: alive, `/health` 200,
    `http_upgrades_unclaimed_total` 600, one log line, nothing unhandled,
    exit 0 on SIGTERM.
-   **Held by** `packages/api/test/websocket-upgrade-guard.integration.test.ts`
    (12 tests, part of `pnpm test:integration`): the real app behind
    `serve()`, wired by `attachWebSocketShims`; resets after 0, 20, 200 and
    900 ms on `/v1/health` and after 20 ms on five other unclaimed paths;
    the guard's answer, counter and log line; what the three shims answer
    themselves (101 on `/twitch-irc`, on `/obs-ws/` with an active id and
    on `/se-overlay/`, a socket.io client that gets to `connect`, and their
    own 400s and 404); CONNECT and a malformed request; and the API process
    itself, started as `start-app` starts it. With the guard taken out of
    `attachWebSocketShims`, which is the wiring as it was, 7 of the 12
    fail, among them the in-process reset test (`uncaughtException`,
    `read ECONNRESET`) and the process test (exit code 1, with the stack
    above). Fourteen other one-line changes to the guard were tried the
    same way, and each fails at least one test.
-   **Exposure through this repository's proxies was not established, and
    this record does not say whether the crash could be triggered in
    production.**
    -   Known: the nginx API locations (`infra/nginx`,
        `infra/single-server-baseline`) set no `proxy_set_header Upgrade`,
        and nginx does not pass the hop-by-hop `Upgrade` header upstream
        unless told to, so through nginx the request arrives as a plain
        request (nginx's documented behaviour; nginx was not run). The only
        nginx locations in the tree that forward `Upgrade` go to LiveKit
        and maubot. In `deploy/docker/production` the app publishes no
        port; Caddy (`reverse_proxy app:3000`, `Caddyfile:11`) is in front
        of every path but `/metrics*`, which it answers 403, and its reverse
        proxy performs an upgrade request and then tunnels the connection
        (Caddy's documentation; Caddy was not run).
    -   Not known: whether a client's reset at Caddy reaches `app:3000` as
        a reset. A FIN would not raise `'error'`. This was not tested.
    -   Any port where the API was reachable without a proxy was exposed
        as measured. The app service restarts after a crash
        (`restart: unless-stopped`, `docker-compose.yml:18`), dropping its
        in-flight requests, and in Postgres mode a crash also loses the
        writes still queued behind the requests that made them
        (`src/db/writeBehindQueue.ts`).
-   **Outcome:** the advisory's own code is not reached, and the bump does
    not change the crash above, which was the API's own. The guard in this
    change fixes it; it is recorded under "Found outside the gates",
    item 1.

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
    workspace) imports `hono/css`, `hono/jsx` or `hono/html`. The API does
    return HTML through hono's `c.html()`, but renders none with hono's JSX
    or css helpers: its OG preview pages and the stub checkout page are
    string templates (`routes/sharePreview.ts:109`,
    `routes/campaignPreview.ts:59`, `:64`, `:71`, `:84`,
    `routes/marketplace.ts:488`).

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
    call exists. Bodies are read as JSON or as text and never as a form:
    there is no `parseBody()` or `formData()` call. Most are read through
    `readJsonBody` (`src/middleware/validate.ts:13-20`; 205 calls in 62
    files), which parses the JSON and checks it against a zod schema; 14
    other calls read `c.req.json()` themselves and 8 read `c.req.text()`.

### GHSA-4m76-xfj5-7975: `mount()` forwards a path past prefix-scoped middleware

-   **What:** `mount()` / `app.mount()` strip the mount prefix by the route
    pattern's length (wrong for a dynamic prefix such as `/api/:tenant/*`) and,
    since 4.12.21, rebuild the forwarded path from the decoded one (so `%5C..`
    collapses). Either way a request can reach a mounted app's route that the
    outer app guards with sub-path middleware. Range `introduced 0`,
    `fixed 4.13.16`.
-   **Not reached.** No `.mount(` call and no `hono/mount` import. The API
    composes its routers with `app.route()` (`src/index.ts:179-323`), which
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
-   **The API uses the default router**, `new Hono()` (`src/index.ts:132`), and
    guards `/v1/*` with wildcard middleware (`:181`), so this needed
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

## Found outside the gates

1. **One unauthenticated upgrade request could crash the API, and 2.1.6 did
   not fix it. Fixed in this change.** An HTTP request with
   `Upgrade: websocket` on any path the three WebSocket shims do not claim
   (anything but exactly `/twitch-irc`, a path under `/obs-ws/` and
   `/se-overlay/`), reset by the client within about 1 s, left the socket
   without an `'error'` listener; the reset was an unhandled `'error'` event
   and the process exited 1. Measured on the real app with node-server 2.1.3
   and 2.1.6, and again on the API started as production starts it; the
   mechanism and the runs are in the GHSA-qv5m section above.
    - **The fix** is the third commit of this change:
      `packages/api/src/webSocketUpgrades.ts`, called from
      `src/index.ts:521`, with
      `packages/api/test/websocket-upgrade-guard.integration.test.ts`. One
      `upgrade` listener ahead of the shims gives every upgraded socket an
      `'error'` listener as Node hands it over, and answers `404` and closes
      any upgrade no shim has taken once the listeners have run. Of the two
      fixes this item first proposed it is the second, and it does the
      first one's job for every listener at once.
    - **Before and after:** of eleven requests, each to a fresh API
      process, seven ended the process before the fix (exit 1, unhandled
      `ECONNRESET`) and none does after it. The other four, on claimed
      paths or reset too late, are answered as before, except that the late
      one now gets the `404` too.
    - **Where it mattered** was never established for production, and the
      fix does not change that: it mattered wherever the API's port was
      reachable directly, as measured. The nginx configs gave it no way in:
      no API location forwards `Upgrade`, so the API sees a plain request
      (nginx's documented behaviour; nginx was not run). Through the
      production Caddy it depended on whether a client's reset reaches
      `app:3000` as a reset, which was not tested. This record does not
      say the crash could, or could not, be triggered in production.
    - **Left as it is:** an upgrade request for a path no shim takes is
      still not served as the plain request it would be with no `upgrade`
      listener at all. It gets the bare `404` (before the fix: no answer,
      and the connection ended after 1 s). Node has had
      `server.shouldUpgradeCallback` since 22.21.0 (its documentation),
      which declines an upgrade before the socket is handed over, so that
      the request handler answers it (measured on 22.22.0 with a plain
      `http.Server`: 200 from the handler, and no `upgrade` event). It was
      not used: each shim decides inside its own listener what it takes,
      and `engines` allows Node from 22.11, where the callback does not
      exist.
2. **The other five lockfiles carry 40 advisories that no gate fails on.**
   osv-scanner v2.3.3 run on them at 23:46Z (no `osv-scanner.toml` applies
   there) exits 1: "24 packages affected by 40 known vulnerabilities (1
   Critical, 11 High, 10 Medium, 5 Low, 13 Unknown) from 2 ecosystems".

    | Lockfile                                                      | Packages | Advisories | Packages named                                                                                                                                                                                                                                |
    | ------------------------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | `apps/blackout-server/poetry.lock`                            | 5        | 10         | black 23.10.1 (4, one CVSS 9.8), pygments 2.15.1, sentry-sdk 1.35.0, soupsieve 2.10 (3), tornado 6.6                                                                                                                                          |
    | `blackout-desktop/src-tauri/Cargo.lock`                       | 18       | 23         | anyhow, event-listener, glib 0.18.5, pin-utils, proc-macro-error, quick-xml 0.37.5 and 0.38.4, rand 0.9.2, rustix, rustls 0.23.37 (4), rustls-webpki, serde_with, tar, tokio 1.50.0, webpki-root-certs, zbus_names, zvariant, zvariant_derive |
    | `services/perturbation/requirements.txt`                      | 1        | 7          | starlette 0.41.3 (not in the file: a transitive dependency of fastapi 0.115.6, which osv-scanner resolved)                                                                                                                                    |
    | `apps/blackout-server/Cargo.lock`                             | 0        | 0          | —                                                                                                                                                                                                                                             |
    | `apps/blackout-server/services/blackout-api/requirements.txt` | 0        | 0          | —                                                                                                                                                                                                                                             |

    Neither OSV gate reads these files (both pass `--lockfile=pnpm-lock.yaml`
    only). Trivy does, and its gate passes: it reports CRITICAL and HIGH only
    (by its own severity sources), with a fix only, and leaves out development
    dependencies. For a `requirements.txt` there is a larger reason: Trivy
    reads only the pins written in the file and does not resolve their
    dependencies, so it never sees starlette at any severity. Trivy 0.69.3
    on `services/perturbation/requirements.txt` alone, with no severity or
    fixed-only filter (DB `UpdatedAt` 2026-11-14 19:00Z), lists five
    packages, the five pins, and 0 vulnerabilities. So Trivy's 0 is not
    evidence that these files are clean. Not triaged here; left for a
    separate sweep, with no entry added to any ignore list.

3. **A backslash in a WebSocket upgrade path is still the shims' business.**
   2.1.6's 400 for a backslash applies to node-server's own upgrade handler,
   which this API does not install. The Twitch-IRC and OBS-WebSocket shims
   parse `req.url` with `new URL(req.url, 'http://localhost')`
   (`ircServer.ts:217`, `obs-ws-compat/server.ts:300`), which reads `\` as `/`
   the same way. No proxy here makes a path decision for those endpoints, so
   nothing is bypassed today.
4. **RegExpRouter refuses 48 of the API's 755 routes**, so every instance of
   the default `new Hono()` here runs on TrieRouter after the first request.
   Not a defect; recorded because it decides whether a RegExpRouter advisory
   applies, and it was not written down before.
5. **`guard:audit-clean` (`pnpm audit --prod --audit-level moderate`) failed
   on `develop`**: exit 1, "8 vulnerabilities found", "2 low \| 6 moderate"
   (the seven above plus deepmerge). It is a local script; CI does not run
   it. After the change it exits 0 with deepmerge's one low row.
6. **`pnpm install` warns about unmet peers** that predate this change and are
   not touched by it (vite-plugin-static-copy, vite-plugin-pwa, folds,
   `packages/ui`'s react-dom), as in the 2026-11-08 record.

---

## Corrections after review (2026-11-15)

A review of this record's first version found four statements that were
wrong or overstated. Each is corrected in place above:

1. **GHSA-qv5m.** The first version said the Twitch-IRC and OBS-WebSocket
   shims take the socket synchronously, "so the window the advisory
   describes does not exist there", and left the socket.io path unread.
   Only the narrow half held: node-server's own upgrade handler is not
   installed. For a path no shim claims, the shims left the socket without
   an `'error'` listener, and a reset crashed the process on 2.1.3 and on
   2.1.6, until the fix recorded below (the GHSA-qv5m section; "Found
   outside the gates", item 1).
2. **GHSA-3gg2.** "The API renders no HTML with hono" was false: it returns
   string-template HTML through `c.html()`. The conclusion stands, since
   nothing imports `hono/css`, `hono/jsx` or `hono/html`.
3. **GHSA-jpvv.** "Both files proxy every path of `api.theblackout.app` to
   the API" was false for the single-server baseline, which sends `/tiles/`
   to Martin. The conclusion stands: neither has a deny rule for any API
   path.
4. **Outside the gates.** starlette was listed as if
   `services/perturbation/requirements.txt` named it. It is a transitive
   dependency that osv-scanner resolved, and Trivy, which reads only the
   file's pins, never sees it at any severity.

A second review asked for six more corrections of wording. Each is made in
place above:

5. **The line-terminator probe** sent 10 requests: 7 with a terminator and 3
   controls without one. Method and the Verification table said "10 requests
   with encoded line terminators", against a list of seven.
6. **GHSA-qv5m** cited `ircServer.ts:216-217` for the Twitch-IRC shim's
   return. The return is on line 218, so the citation is `216-218`.
7. **Summary, GHSA-jpvv.** The row said Caddy's `/metrics*` block "sits
   behind Go's proxy, which re-encodes `\`", as a fact about Caddy. What was
   probed is Go's `httputil.ReverseProxy`; Caddy, the proxy in front of the
   app, was not run, and the row now says so.
8. **The index sentence.** "No document lists the `dependency-advisories-*`
   records" was false: `.trivyignore` and `osv-scanner.toml` cite records,
   each for its own entries. What holds is that no index of the records
   exists.
9. **The header's summary of the six unreached advisories** said their code
   is code "the API does not load or configure". RegExpRouter is loaded and
   is tried on the first request; only its matcher is never selected. The
   header now says "never selects or calls", and says which is which.
10. **GHSA-4h7h.** "Bodies are read as JSON" left out the eight
    `c.req.text()` reads. Bodies are read as JSON or text, mostly through
    `readJsonBody`'s zod check, and never as a form.

**The upgrade crash was then fixed in this change.** Until its third commit
this record said of "Found outside the gates", item 1, "Not fixed here: this
change is a dependency bump, and the fix is a code change for a separate PR",
the section's heading read "(not changed here)", and the header, the Summary
row and the GHSA-qv5m section described the crash in the present tense
("leaves an unhandled socket `'error'` and the API process exits 1"). Those
places now say what was measured before the fix and what is measured after
it; the mechanism and the earlier runs stand as they were written. The fix
adds one import line to `src/index.ts`, so the lines this record cites below
it moved by one and were updated (`:132`, `:179-323`, `:181`, `:346-368`,
`:513`); `:520-547`, where the three listeners were attached, is kept as their
place at `6378d7c6bb`.

---

## Verification

Runs are local, with Node 22.22.0 and pnpm 9.15.4 (the pinned
`packageManager`), from 23:33Z on 2026-11-14 to the first commit at 00:05Z on
2026-11-15. The review corrections (from 00:30Z) changed only this record; the
rows marked "review" were run for them. API lint, typecheck and launch
smoke were re-run on the final tree; the integration and post-merge suites
were not, since no file they read changed. The upgrade fix (from 01:45Z)
changed code under `packages/api`: the rows marked "fix" were run on the tree
its commit `45383d249e` holds, the API suites in full (02:54Z to 03:08Z, just
before the commit was made) and the after-fix requests on the commit itself.
Commands are as in `ci.yml` and `security.yml` where those run them. Heavy
suites started only when the 1-minute load average was under 3.5, one at a
time.

| Gate                             | Command                                                                                                                                                                                                                                                                          | Result                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OSV, before                      | osv-scanner v2.3.3, `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, on `7a9814ebc9`'s lockfile and toml, 23:46Z                                                                                                                                                                           | exit 1: 1,493 packages, 1 filtered (deepmerge), the 7 rows above                                                                                                                                                                                                                                                         |
| OSV                              | the same on this change, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`, 23:46Z                                                                                                                                                                                                 | exit 0 in all three: 1,493 packages, "No issues found", 1 filtered, no unused-ignore line                                                                                                                                                                                                                                |
| OSV, other lockfiles             | the same binary on the five other lockfiles (informational; no workflow runs this)                                                                                                                                                                                               | exit 1: 40 advisories in 24 packages (item 2 of "Found outside the gates"); unchanged by this change, which touches none of them                                                                                                                                                                                         |
| Trivy                            | 0.69.3, `fs .` on a `git archive` extract of `7a9814ebc9` with this change's three manifest and lock files, `security.yml`'s flags (`--severity CRITICAL,HIGH --ignore-unfixed --scanners vuln --exit-code 1 --ignorefile .trivyignore`), fresh DB                               | exit 0 at 23:47Z: six targets, 0 findings each; `--show-suppressed` lists nothing suppressed. The same on `7a9814ebc9`'s own files: exit 0, six targets at 0                                                                                                                                                             |
| Trivy, all severities            | `fs` on the lockfile alone, no severity or fixed-only filter (production paths, Trivy's default)                                                                                                                                                                                 | before: the 7 advisories as 6 MEDIUM and 1 LOW (below the gate); after: 0                                                                                                                                                                                                                                                |
| pnpm audit                       | `pnpm audit --prod --audit-level high` (`security.yml`) and `--audit-level moderate` (`guard:audit-clean`)                                                                                                                                                                       | before: high exit 0, moderate exit 1 ("8 vulnerabilities", "2 low \| 6 moderate"); after: both exit 0, "1 vulnerabilities found", 1 low (deepmerge)                                                                                                                                                                      |
| lockfile                         | `pnpm install --lockfile-only --ignore-scripts`, twice (exact override, then caret)                                                                                                                                                                                              | exit 0 both; diff as in Lockfile                                                                                                                                                                                                                                                                                         |
| install                          | `pnpm install --frozen-lockfile --ignore-scripts`                                                                                                                                                                                                                                | exit 0, "Lockfile is up to date, resolution step is skipped", 2 packages added                                                                                                                                                                                                                                           |
| API lint                         | `pnpm --filter @blackout/api lint` (`eslint "src/**/*.ts" "test/**/*.ts" --max-warnings=0`)                                                                                                                                                                                      | exit 0, 9 s                                                                                                                                                                                                                                                                                                              |
| API types                        | `pnpm --filter @blackout/api typecheck` (`tsc --noEmit -p tsconfig.json`)                                                                                                                                                                                                        | exit 0, 10 s                                                                                                                                                                                                                                                                                                             |
| API integration                  | `pnpm --filter @blackout/api test:integration` with `BLACKOUT_DB_MODE=memory`, `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test` (`ci.yml`)                                                                                                                                          | exit 0: 2,033 tests, 2,033 pass, 0 fail, 0 cancelled, 0 skipped, 230 s                                                                                                                                                                                                                                                   |
| API post-merge                   | `pnpm --filter @blackout/api test`, without the CI env above (`turborepo-ci.yml` runs it through `turbo run test` on pushes)                                                                                                                                                     | exit 0: 2,153 tests, 2,153 pass, 0 fail, 0 cancelled, 0 skipped, 515 s; every one of the 2,033 integration test names appears in it                                                                                                                                                                                      |
| API launch smoke                 | `pnpm --filter @blackout/api test:launch-smoke` with the same env (`ci.yml`)                                                                                                                                                                                                     | exit 0: 14 tests, 14 pass, 0 fail, 4 s                                                                                                                                                                                                                                                                                   |
| on the wire                      | the real app under `serve()` from 2.1.3 and from 2.1.6, 16 raw requests                                                                                                                                                                                                          | 13 identical; the 3 backslash paths reach the app on 2.1.3 and get 400 from 2.1.6                                                                                                                                                                                                                                        |
| router                           | the real app on 4.13.11 and 4.13.16: router name, RegExpRouter build, 10 requests (7 with an encoded line terminator, 3 controls without one)                                                                                                                                    | `SmartRouter + TrieRouter` on both; RegExpRouter refuses 48 of 755 routes on both; all 10 requests ran the wildcard middleware on both                                                                                                                                                                                   |
| prettier                         | `prettier --check` on the changed files (`pnpm-lock.yaml` is in `.prettierignore`)                                                                                                                                                                                               | pass on this record, `package.json` and `packages/api/package.json`                                                                                                                                                                                                                                                      |
| duplicate paths                  | `node tools/ci/check-duplicate-paths.mjs`                                                                                                                                                                                                                                        | exit 0, five checks passed                                                                                                                                                                                                                                                                                               |
| lint-staged, auth guard          | `npx lint-staged --concurrent false` and `node tools/ci/check-auth-secrets.mjs` before the commit                                                                                                                                                                                | lint-staged: `prettier --write --ignore-unknown` on the four staged files, no change; guard: "Auth secret hardening check passed", exit 0                                                                                                                                                                                |
| gitleaks                         | 8.21.2, `gitleaks dir --no-banner --redact` on each changed file before the commit                                                                                                                                                                                               | "no leaks found" on each of the four changed files; the range scan over the branch's commit runs once the commit exists (reported with the PR)                                                                                                                                                                           |
| gitleaks, range (review)         | `gitleaks git --no-banner --redact --log-opts="origin/develop..HEAD"` at 00:41Z, before the second commit                                                                                                                                                                        | "1 commits scanned", "no leaks found", exit 0                                                                                                                                                                                                                                                                            |
| OSV (review)                     | osv-scanner v2.3.3, `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, 00:41Z on 2026-11-15                                                                                                                                                                                                  | exit 0: "No issues found", 1 filtered (deepmerge)                                                                                                                                                                                                                                                                        |
| upgrade reset (review)           | the real app under `serve()` from 2.1.3 and from 2.1.6 with the three shims attached; one raw `Upgrade: websocket` request, a client reset, then `GET /health` (GHSA-qv5m section)                                                                                               | exit 1 with an unhandled `ECONNRESET` for `/v1/health`, `/v1/anything`, `/obs-ws-nope` reset after 200 ms on both versions, and on 2.1.6 for resets after 20 and 900 ms and for `/twitch-irc/x`; alive for a reset after 1,500 ms, for `/twitch-irc`, `/obs-ws/no-such-id` and `/se-overlay/`, and with no shim attached |
| Node `upgrade` hand-off (review) | a plain `http.Server` on Node 22.22.0: the socket's `'error'` listener count on `connection` and inside `upgrade`; and an upgrade request to a server with no `upgrade` listener                                                                                                 | 1, then 0; with no listener, the request handler answers it (200)                                                                                                                                                                                                                                                        |
| Trivy, perturbation (review)     | 0.69.3 `fs services/perturbation/requirements.txt --scanners vuln --list-all-pkgs`, no severity or fixed-only filter, DB of 2026-11-14 19:00Z                                                                                                                                    | 0 vulnerabilities; packages: the five pins only (no starlette)                                                                                                                                                                                                                                                           |
| API lint, types, smoke (review)  | the three commands above, same env, 00:47Z to 00:49Z on 2026-11-15                                                                                                                                                                                                               | lint exit 0 (9 s); typecheck exit 0 (17 s); launch smoke 14 tests, 14 pass, 0 fail (3 s)                                                                                                                                                                                                                                 |
| upgrade reset, before (fix)      | at `6378d7c6bb`, the API started as `start-app` starts it (`node --import tsx src/index.ts`, memory store, a free port), a fresh process for each of 11 requests: one raw `Upgrade: websocket` request, a client reset after 0 to 1,500 ms, then `GET /health`; 01:45Z to 02:01Z | 7 processes exit 1 with an unhandled `ECONNRESET` (`/v1/health` after 0, 20, 200 and 900 ms; `/v1/anything`, `/obs-ws-nope` and `/twitch-irc/x` after 200 ms); 4 alive (`/v1/health` after 1,500 ms, `/twitch-irc`, `/obs-ws/no-such-id`, `/se-overlay/`)                                                                |
| upgrade reset, after (fix)       | the same 11 at `45383d249e`, 03:09Z; then one process sent 600 unclaimed upgrades reset after 0 to 3 ms                                                                                                                                                                          | 11 alive, `/health` 200, exit 0 on SIGTERM; the guard's 404 for the 8 on unclaimed paths, 101, the OBS shim's 404 and 101 for the 3 claimed. The 600: alive, `http_upgrades_unclaimed_total` 600, 1 log line, nothing unhandled                                                                                          |
| Node, other hand-offs (fix)      | a plain `http.Server` on Node 22.22.0 with no `connect` or `clientError` listener: an HTTP CONNECT and a malformed request, each also followed by a client reset; and a server whose `shouldUpgradeCallback` declines one path                                                   | CONNECT: closed with no bytes; malformed: 400, then closed; nothing uncaught after a reset. The declined upgrade: 200 from the request handler, no `upgrade` event                                                                                                                                                       |
| upgrade guard test (fix)         | `tsx --test test/websocket-upgrade-guard.integration.test.ts` with CI's env; then with the guard taken out of `attachWebSocketShims`, and with 14 other one-line changes to the guard, one at a time, each restored afterwards                                                   | 12 tests, 12 pass. Guard taken out: 7 of 12 fail (in process, `uncaughtException`, `read ECONNRESET`; the API process, exit code 1). Each of the other 14: at least 1 fails                                                                                                                                              |
| API lint (fix)                   | `pnpm --filter @blackout/api lint`                                                                                                                                                                                                                                               | exit 0, 8 s                                                                                                                                                                                                                                                                                                              |
| API types (fix)                  | `pnpm --filter @blackout/api typecheck`                                                                                                                                                                                                                                          | exit 0, 9 s                                                                                                                                                                                                                                                                                                              |
| API integration (fix)            | `pnpm --filter @blackout/api test:integration` with `BLACKOUT_DB_MODE=memory`, `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test`                                                                                                                                                     | exit 0: 2,045 tests (the 2,033 above and the 12 new), 2,045 pass, 0 fail, 0 cancelled, 0 skipped, 237 s                                                                                                                                                                                                                  |
| API post-merge (fix)             | `pnpm --filter @blackout/api test`, without the CI env                                                                                                                                                                                                                           | exit 0: 2,165 tests, 2,165 pass, 0 fail, 0 cancelled, 0 skipped, 473 s; every one of the 2,045 integration test names appears in it                                                                                                                                                                                      |
| API launch smoke (fix)           | `pnpm --filter @blackout/api test:launch-smoke` with the CI env                                                                                                                                                                                                                  | exit 0: 14 tests, 14 pass, 0 fail, 3 s                                                                                                                                                                                                                                                                                   |
| prettier, duplicate paths (fix)  | `prettier --check` on the five changed files (this record and four under `packages/api`); `node tools/ci/check-duplicate-paths.mjs`                                                                                                                                              | pass; exit 0, five checks passed                                                                                                                                                                                                                                                                                         |
| OSV (fix)                        | osv-scanner v2.3.3, `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, 03:08Z                                                                                                                                                                                                                | exit 0: "No issues found", 1 filtered (deepmerge)                                                                                                                                                                                                                                                                        |
| gitleaks (fix)                   | 8.21.2: `gitleaks dir --no-banner --redact` on each of the five changed files; `gitleaks git --no-banner --redact --log-opts="origin/develop..HEAD"` at 03:09Z, after the fix's commit and before this record's                                                                  | "no leaks found" on each file and over the range ("3 commits scanned"). A first file scan had flagged RFC 6455's sample handshake nonce, written as a literal in the new test (`generic-api-key`); the test now generates its nonce, and nothing was added to `.gitleaksignore`                                          |
| lint-staged, auth guard (fix)    | `npx lint-staged --concurrent false` and `node tools/ci/check-auth-secrets.mjs` before the fix's commit and before each commit of this record                                                                                                                                    | lint-staged: `prettier --write --ignore-unknown` on the staged files, no change; guard: "Auth secret hardening check passed", exit 0                                                                                                                                                                                     |

**Not verified:**

-   Which CI run first failed with these rows, and the log of PR #1008's run
    43653547472: no GitHub API access from this session.
-   That Caddy forwards a backslash as `%5C`: Go's standard library proxy was
    tested, not Caddy. nginx was not run either; that nginx on Linux keeps the
    backslash is the advisory's statement.
-   Whether a client's TCP reset at the production Caddy reaches `app:3000`
    as a reset, which the crash in "Found outside the gates", item 1, needed;
    Caddy was not run. That nginx does not forward `Upgrade` unless told to
    is its documented behaviour; nginx was not run for this either. So
    whether the crash could be triggered through either proxy is not known.
-   The fix on any Node but 22.22.0. `engines` allows `>=22.11`, and the
    backend image builds from `node:22-alpine`, whatever 22.x that is on
    the day.
-   CI had not run on this branch when this record was committed.
