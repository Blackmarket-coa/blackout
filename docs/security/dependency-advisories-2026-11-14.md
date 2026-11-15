# Dependency advisory triage — 2026-11-14

Seven advisories against the API's HTTP framework and its Node adapter,
published on 2026-11-12, turned CI's **Dependency audit (no un-triaged
advisories, any severity)** (`ci.yml`, osv-scanner v2.3.3 on `pnpm-lock.yaml`)
red on `develop`'s lockfile, and so on every PR. It was seen on 2026-11-14 on
PR #1008, a client-only change that touches no dependency file, in its run
43653547472 (reported to this triage; the run's log was first read on
2026-11-15 and shows the rows below: "Corrections after review", item 21).
Run here on `develop`'s
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
`develop`'s lockfile after 23:45Z on 2026-11-12 fails with these rows. The
first run that did was read from the Actions API on 2026-11-15 (item 21): the
API lists no run of `ci.yml` or `security.yml` created between 21:00Z on
2026-11-12 and 23:27Z on 2026-11-14, when the push run 43653345220 on PR
#1008's branch failed in the "OSV scanner" step of `ci.yml`'s Dependency
audit job; the pull-request run above followed at 23:30Z. Both workflows
last passed on `develop` in the runs started at 17:47Z on 2026-11-12, at
`7a9814ebc9` (they finished at 17:55Z and 17:49Z).

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
    impact was, by another route. One unauthenticated upgrade request
    (`Upgrade: websocket` with `Connection: Upgrade`) on a path none of the
    API's three WebSocket shims claims (`/v1/health` will do), reset by the
    client while the API still held the connection, left an unhandled
    socket `'error'` and the API process exited 1. The API held a new
    connection for about a second, and one that had already carried a
    response for as long as the client did, without limit. Measured on the
    real app with node-server 2.1.3 and with 2.1.6. The cause was the API's
    own `upgrade` listeners, not node-server. This change puts a guard
    ahead of them (`packages/api/src/webSocketUpgrades.ts`): every upgraded
    socket has an `'error'` listener from the moment Node hands it over, and
    an upgrade no shim takes is answered `404`, closed and counted, on a
    new connection and on a reused one (the GHSA-qv5m section names three
    narrow cases that end otherwise). Of eleven requests, each to a fresh
    API process, seven ended the process before the fix and none does after
    it (the GHSA-qv5m section; "Found outside the gates", item 1). As first
    committed (`45383d249e`) the guard kept the process up on a reused
    connection but neither answered nor closed the upgrade there; a review
    found that and `a3edcde179` corrects it ("Corrections after review",
    item 11). As corrected, a client that did not read the answers ahead
    of its upgrade still kept its connection where those answers were
    more than the kernel would take, since the `404` could not leave, and
    a connection kept that way held the server open at SIGTERM
    until the forced exit, which does not drain the store. The next review
    found the first, runs on the real API showed the second, and the guard
    now destroys such a socket after 1 s (items 18 and 19). Whether the
    deployed proxies passed such a request and the reset through to the
    API was not established.
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
    listens for `connect` or `clientError`;
-   for the third review, the API started the same way and sent an upgrade
    that is not the first request on its connection: after one or two
    answered plain requests (a connection kept alive), and in one write
    with a plain request (pipelined); then left alone, reset 10 s later,
    or held open while the process was sent SIGTERM. Run with the wiring
    as at `6378d7c6bb`, at `3a5986028f` and at `a3edcde179`. With it, Go
    1.24.7's `httputil.ReverseProxy`, sent two plain requests before the
    upgrade so that it holds a pooled connection, in front of a stub
    server and in front of the API; and a plain Node `http.Server`, for
    which requests Node hands to `upgrade` listeners and for what has run
    by the next tick and by the next turn of the event loop after the
    hand-off.

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

| Advisory                              | Package           | GHSA severity | Was     | Now     | Reachable here                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ----------------- | ------------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-jpvv-r467-5p4w (CVE-2026-126210) | @hono/node-server | Moderate      | 2.1.3   | 2.1.6   | The parsing runs on every request; no front-proxy rule it gets past was found. For Caddy's `/metrics*` block, a probe of Go 1.24.7's `httputil.ReverseProxy` forwarded `\` as `%5C`; Caddy, the proxy that sits in front of the app there, was not run                                                                                                                                                                                                                            |
| GHSA-qv5m-9pm6-hqp3 (CVE-2026-126343) | @hono/node-server | Moderate      | 2.1.3   | 2.1.6   | Its code, no: `serve()` is called without the `websocket` option, so node-server installs no upgrade handler. Its impact, yes, by another route and on 2.1.6 too: an unclaimed upgrade, reset while the API still held the socket (about 1 s on a new connection, without limit on one that had already carried a response), crashed the API through its own shims' listeners. Fixed in this change by a guard ahead of them, not by the bump ("Found outside the gates", item 1) |
| GHSA-3gg2-335m-rxc6 (CVE-2026-126359) | hono              | Low           | 4.13.11 | 4.13.16 | No: nothing imports `hono/css`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GHSA-46wx-v44x-9hh2 (CVE-2026-126355) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: nothing imports `hono/csrf`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GHSA-4h7h-rv7c-7m2v (CVE-2026-126356) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: nothing imports `hono/validator`; bodies are read as JSON or text, never as a form                                                                                                                                                                                                                                                                                                                                                                                            |
| GHSA-4m76-xfj5-7975 (CVE-2026-126357) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: no `mount()`; sub-apps are composed with `app.route()`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| GHSA-h7mg-cq63-vhpq (CVE-2026-126358) | hono              | Moderate      | 4.13.11 | 4.13.16 | No: SmartRouter picks TrieRouter for this route table (measured), and the advisory names RegExpRouter only                                                                                                                                                                                                                                                                                                                                                                        |

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
        `http.Server`). An upgrade request is one with an `Upgrade` header
        and `Connection: upgrade`, whatever the protocol named; with
        `Upgrade` alone, or beside `Connection: close`, Node answers it as
        a plain request (measured: 200, and no `upgrade` event).
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
        `integrations/se-overlay-compat/server.ts:93-101`). The timer acts
        only on a socket that has written nothing
        (`socket.bytesWritten <= 0`, `:704`), and that count is the
        connection's: on one that has already carried a response the timer
        does nothing, and nothing else ended the socket.
    -   So the socket had no `'error'` listener for about a second on a new
        connection, and for as long as the client kept it open on one that
        had already carried a response. A client reset in that time was an
        unhandled `'error'` event, and nothing in `packages/api/src`
        registers a process-level `uncaughtException` handler.
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
        socket by then; each request in these runs was the first on its
        connection). The claimed paths `/twitch-irc`,
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
    -   On a connection that was not new, measured for the third review
        (04:06Z on 2026-11-15) with the wiring as at `6378d7c6bb` in a copy
        of the tree at `3a5986028f`, started the same way. `GET /health`
        answered 200, then the upgrade to `/v1/health` on the same
        connection: no byte in answer, and the connection still open 10 s
        later; the client's reset then ended the process, exit code 1, with
        the same lines on stderr. A plain request and the upgrade in one
        write: 200 for the plain request, nothing for the upgrade, still
        open after 10 s, and the reset ended the process the same way.
        `Upgrade: h2c` after two answered requests: no answer within 3 s.
        `/twitch-irc` after an answered request: 101.
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
        socket that no listener has ended, destroyed or put an `'error'`
        listener of its own on is ended with `HTTP/1.1 404 Not Found`
        (`Connection: close`, no body) and destroyed when that answer has
        left Node, or 1 s later if it has not, instead of being left to
        engine.io's timer. Bytes written do not count as a listener
        taking the socket: on a connection that was kept alive they include
        the earlier responses, and when a plain request and an upgrade
        arrive in one write, Node hands the upgrade over while the plain
        request is still being answered (measured). `'error'` listeners are
        counted from what the socket had at the hand-off. (As first
        committed, in `45383d249e`, a socket with `bytesWritten` above zero
        counted as taken, which is engine.io's test too: "Corrections after
        review", item 11.) The three shims take a socket before their
        listener returns: `ws`'s `handleUpgrade` attaches its `'error'`
        listener on its first line (`ws/lib/websocket-server.js`, 8.21.0),
        the OBS shim destroys the socket, after its own 404 or without
        one, and engine.io reaches `ws`
        synchronously with this shim's options (a fixed CORS setting, no
        `allowRequest`). What they accept is unchanged, and the test below
        holds each of them to it.
    -   Each such upgrade is counted (`http_upgrades_unclaimed_total`), and
        at most one `http_upgrade_unclaimed` line is logged per 10 s, with
        the number since the previous line. Of the request, the line
        carries the first path segment only, and that only when it is short
        and plain (`/v1`): no header, no query string, nothing deeper in
        the path.
    -   Three cases end otherwise, and the test pins each. An upgrade whose
        connection has already failed when the guard looks (the client's
        reset was read first) is counted and not answered: there is nobody
        to answer. An upgrade sent in one write behind a plain request
        whose answer closes the connection is closed by Node with that
        connection, with no `404` and no count: Node ends the socket
        itself, which the guard cannot tell from a listener ending it. An
        upgrade behind answers its client is not reading, where they are
        more than the kernel will take, is counted and its `404` is
        written, but the `404` waits in Node behind those answers: the
        guard destroys the socket 1 s after it ended it
        (`UNCLAIMED_CLOSE_TIMEOUT_MS`), with the `404` and whatever else was
        still queued unsent. The log line's `answered: true` says the `404`
        was written to the socket, not that it arrived. (Until this was
        added, after `e2439dad73`, such a socket stayed open until the
        client read or left. The same requests without the upgrade keep
        their connection the same way for a client that does not read;
        their answers were complete, so the server closed that connection
        at SIGTERM, and it did not close this one: "What the correction
        still missed" below, and "Corrections after review", items 18 and
        19.)
    -   `connect` and `clientError` are left to Node, and nothing here
        listens for either: Node closes an HTTP CONNECT without an answer,
        and answers a malformed request 400 before it destroys the socket
        (measured on a plain `http.Server` and on the wired app; a client
        reset after either raised nothing).
-   **Measured after the fix as first committed**, at `45383d249e`, the same
    eleven requests, each to a fresh process started the same way and each
    the first on its connection (03:09Z): all eleven processes stayed up,
    answered `GET /health` 200 and exited 0 on SIGTERM. The eight on
    unclaimed paths (the seven above and the one reset after 1,500 ms) got
    the guard's `404` and logged one `http_upgrade_unclaimed` line; the
    three on claimed paths answered as before (101, the OBS shim's 404,
    101). One more process took 600 unclaimed upgrades reset after 0 to 3
    ms, 293 of them before any answer had reached the client: alive,
    `/health` 200, `http_upgrades_unclaimed_total` 600, one log line,
    nothing unhandled, exit 0 on SIGTERM.
-   **What that commit missed**, measured at `3a5986028f` (04:05Z): an
    unclaimed WebSocket upgrade after an answered `GET /health` on the
    same connection got no byte, was not closed within 10 s and was not
    counted; a reset 10 s later left the process up. In that run the h2c
    upgrade (after two answered requests) and a plain request with the
    upgrade in one write were each watched for 3 s and not reset: no byte
    for the h2c upgrade, and 200 for the plain request with nothing for
    the upgrade. The next review ran those two for 10 s with a reset, on
    an export of `packages/api` at `3a5986028f` (05:32Z): each still open
    after 10 s, not counted, the process up after the reset
    ("Corrections after review", item 15). With one such connection held open,
    SIGTERM took 10,028 ms and ended in `shutdown_forced_after_timeout`
    (`src/index.ts:532-535`), the path that exits without draining the
    store. The review measured the same (its run: 10,019 ms).
-   **Measured after the correction**, at `a3edcde179` (05:03Z to 05:05Z on
    2026-11-15), started the same way.
    -   The same eleven requests, a fresh process each: all eleven processes
        stayed up, answered `GET /health` 200 and exited 0 on SIGTERM. The
        eight on unclaimed paths were closed by the guard with its `404`
        (the client that reset after 0 ms had left before it arrived) and
        each logged one `http_upgrade_unclaimed` line; the three on claimed
        paths answered as before (101, the OBS shim's 404, 101).
    -   600 unclaimed upgrades to one process, reset after 0 to 3 ms: 204 of
        them before any answer had reached the client: alive, `/health` 200,
        `http_upgrades_unclaimed_total` 600, one log line, nothing
        unhandled, exit 0 on SIGTERM.
    -   An unclaimed upgrade after an answered `GET /health` on the same
        connection, for WebSocket and (after two answered requests) for h2c:
        the guard's `404`, the connection closed by the API within 6 ms,
        each counted. A plain request and the upgrade in one write: 200 for
        the plain request, then the `404`, closed, counted. `/twitch-irc`
        after an answered request: 101, as before. With the client leaving
        by a reset 10 s after the upgrade, kept alive and pipelined: the
        connection was long closed, the process up, `/health` 200. With the
        kept-alive connection held open by the client and SIGTERM sent: exit
        0 after 21 ms, with `runtime_store_drained` and no
        `shutdown_forced_after_timeout`.
-   **What the correction still missed, and the second correction**,
    measured on the real API, started the same way. A client that never
    reads sends plain `GET` requests and then an unclaimed upgrade, all in
    one write. The review's run of that (1,500 requests to `/health`,
    61,657 bytes) did not keep the connection: the API closed its side.
    Nor did writes of about 65,000 bytes (2,028 requests to `/health`, or
    2,497 to `/`): the API no longer held the connection 900 ms after the
    write. Writes of 129,998 bytes (4,997 requests to `/`) and of 194,998
    (7,497) did keep it. In the runs below SIGTERM is sent 3 s after the
    write, unless another time is given.
    -   At `e2439dad73`, in an export of `packages/api` (05:55Z to 06:00Z):
        with either of the two larger writes the guard logged the upgrade
        (`answered: true`, `count: 1`), and the API still held the
        connection 3 s after the write. SIGTERM then took 10,056 ms both
        times and ended in `shutdown_forced_after_timeout`, with no
        `runtime_store_drained`. The same 4,997 requests without the
        upgrade were held as long, and there SIGTERM took 26 ms and ended
        in `runtime_store_drained`: at shutdown the server closed that
        connection, whose answers were complete, and it did not close the
        upgraded socket. So the upgrade gave these requests a way into
        the forced exit that they did not have without it, and that the
        correction had removed for a kept-alive connection. It was not
        the only way in, then or now: a plain request the client leaves
        unfinished ends in the same forced exit (the fifth review's runs
        at `dc2ecd611f`: a POST with part of its body, 10,026 ms; a GET
        with unfinished headers, 10,032 ms; no connection held, 41 ms and
        drained), and `deploy/docker/production/README.md:58` says the
        same of an SSE stream or a WebSocket client.
    -   With the 1 s close, in the working tree at 06:00Z, before
        `c081bad011` was committed (the guard's file is the committed one,
        by sha256): for both writes the API held the connection 1.5 s
        after the write and no longer at 3 s, and SIGTERM then took 28 ms
        and 35 ms. Sent about 1,550 ms after the 129,998-byte write, with
        the connection still held, SIGTERM took 311 ms. Each ended in
        `runtime_store_drained`.
    -   Run again for the check of the second correction (07:21Z to
        07:22Z). The 129,998-byte write on the export of `e2439dad73`:
        SIGTERM 10,021 ms and the forced exit, and 23 ms without the
        upgrade. On the worktree at `a79bfb6bbd`: 19 ms and 21 ms for the
        two writes, and 147 ms with the connection still held, each ending
        in `runtime_store_drained`.
    -   No test holds these runs: whether the state is reached depends on
        how much the kernel takes. The test holds the close itself, on a
        plain `http.Server` with the guard.
-   **Held by** `packages/api/test/websocket-upgrade-guard.integration.test.ts`
    (16 tests now, 15 at `a3edcde179`, 12 before; part of `pnpm test:integration`):
    the real app behind `serve()`, wired by `attachWebSocketShims`; resets
    after 0, 20, 200 and 900 ms on `/v1/health` and after 20 ms on five
    other unclaimed paths; the guard's answer, counter and log line; what
    the three shims answer themselves (101 on `/twitch-irc`, on `/obs-ws/`
    with an active id and on `/se-overlay/`, a socket.io client that gets
    to `connect`, and their own 400s and 404); CONNECT and a malformed
    request; and the API process itself, started with `start-app`'s
    command. Since the correction, also: an unclaimed upgrade, for
    WebSocket and for h2c, on a connection that has already carried one or
    two responses, with and without a client reset, and `/twitch-irc` on
    such a connection; one or two plain requests and an unclaimed upgrade
    in one write, the plain requests answered before the hand-off, before
    the guard looks, or 50 ms later, and one whose answer closes the
    connection; a listener that only writes to the
    socket; a server that puts an `'error'` listener on every connection
    it accepts; and, in the process test, an unclaimed upgrade on a
    kept-alive connection whose client never closes its side, followed by
    SIGTERM, which must end in `runtime_store_drained` and exit 0. Since
    the second correction, also: a client that does not read a 32 MiB
    answer ahead of its upgrade, whose connection the server must have
    closed no sooner than 990 ms and no later than the test's wait after
    the hand-off, with the `404` unsent; and the half-open client's
    connection closed as soon as its `404` has left.
    -   With the guard taken out of `attachWebSocketShims`, which is the
        wiring as it was, 9 of the then 15 failed, among them the
        in-process reset test (`uncaughtException`, `read ECONNRESET`) and
        the process test (exit code 1). At `45383d249e`, 7 of the then 12
        failed.
    -   With the guard as it was at `3a5986028f`, 5 of the 15 fail: the
        kept-alive, pipelined and connection-listener tests and the process
        test, where the upgrade is never answered, and the test that pins
        that writing alone does not take a socket.
    -   Eighteen other one-line changes to the corrected guard were tried
        the same way, in a copy of the tree, and each fails at least one
        test. Three of them undo the correction a piece at a time: counting
        `bytesWritten` above zero as a claim again fails 5 tests; counting
        the bytes written since the hand-off, the review's variant, fails 2
        (the pipelined test and the write-only listener); counting every
        `'error'` listener fails 1.
    -   Seven one-line changes to the 1 s close were tried in a copy of the
        tree holding the committed guard and test (05:58Z to 06:01Z). Five
        fail the new test and no other: the timer's callback emptied, a
        timeout of 0, a timeout of a minute, `end()` in place of
        `destroy()`, and the timer cleared as soon as it is set. Two fail
        nothing: the timer never cleared, and the timer not unref'd. No
        test holds those two lines.
-   **Exposure through this repository's proxies was not established, and
    this record does not say whether the crash could be triggered in
    production.**
    -   Known from the tree: the nginx API locations (`infra/nginx`,
        `infra/single-server-baseline`) set no `proxy_set_header Upgrade`,
        and the only nginx locations that forward `Upgrade` go to LiveKit
        and maubot. In `deploy/docker/production` the app publishes no
        port, and Caddy (`reverse_proxy app:3000`, `Caddyfile:11`) is in
        front of every path but `/metrics*`, which it answers 403.
    -   From the proxies' documentation, and not run: nginx does not pass
        the hop-by-hop `Upgrade` header upstream unless told to, so through
        those nginx locations the request would arrive as a plain request;
        Caddy's reverse proxy performs an upgrade request and then tunnels
        the connection.
    -   Seen with Go's library, which is not Caddy: through Go 1.24.7's
        `httputil.ReverseProxy` in front of a stub server, after two plain
        requests, an `Upgrade: websocket` request went upstream on a new
        connection, and an `Upgrade: h2c` request on the pooled connection
        that had carried the plain requests' answers. So a proxy that pools
        connections can put an unclaimed upgrade on a reused upstream
        connection, the case with no bound. Through the same proxy in front
        of the API with the wiring as at `6378d7c6bb`, in one run: the
        WebSocket request got `502` from the proxy (engine.io had ended its
        new upstream connection after a second, without a byte), and the h2c
        request got no answer within 4 s; when the client then left with a
        reset, the API stayed up, as in the review's one run. That is one
        run of Go's library, and it settles nothing about Caddy. At
        `a3edcde179` both requests get the guard's `404` through the proxy,
        and each is counted.
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
   not fix it. Fixed in this change.** An HTTP upgrade request
   (`Upgrade: websocket` with `Connection: Upgrade`) on any path the three
   WebSocket shims do not claim (anything but exactly `/twitch-irc`, a path
   under `/obs-ws/` and `/se-overlay/`), reset by the client while the API
   still held the connection, found the socket without an `'error'`
   listener; the reset was an unhandled `'error'` event and the process
   exited 1. The API held a new connection for about 1 s, and one that had
   already carried a response until the client closed it, with no bound.
   Measured on the real app with node-server 2.1.3 and 2.1.6, and again on
   the API started with start-app's command (development environment,
   memory store); the mechanism and the runs are in the GHSA-qv5m section
   above.
    - **The fix** is `packages/api/src/webSocketUpgrades.ts`, called from
      `src/index.ts:521`, with
      `packages/api/test/websocket-upgrade-guard.integration.test.ts`: the
      third commit of this change (`45383d249e`), corrected in `a3edcde179`
      after the third review. One `upgrade` listener ahead of the shims
      gives every upgraded socket an `'error'` listener as Node hands it
      over, and answers `404` and closes any upgrade no shim has taken
      once the listeners have run, on a new connection or a reused one.
      Of the two fixes this item first proposed it is the second, and it
      does the first one's job for every listener at once.
    - **Before and after:** of eleven requests, each to a fresh API
      process, seven ended the process before the fix (exit 1, unhandled
      `ECONNRESET`) and none does after it. The other four, on claimed
      paths or reset too late, are answered as before, except that the late
      one now gets the `404` too. On a connection that had already carried
      a response: before any fix the upgrade was never answered or closed,
      and a reset 10 s later ended the process; at `45383d249e` the process
      stayed up, with the upgrade still unanswered and the connection
      still open; at `a3edcde179` it gets the `404` and the connection is
      closed.
    - **Where it mattered** was never established for production, and the
      fix does not change that: it mattered wherever the API's port was
      reachable directly, as measured. By nginx's documented behaviour the
      nginx configs give it no way in: no API location forwards `Upgrade`,
      so the API would see a plain request. nginx was not run, so that is
      not established. Through the
      production Caddy it depended on whether a client's reset reaches
      `app:3000` as a reset, which was not tested. This record does not
      say the crash could, or could not, be triggered in production.
    - **Left as it is:** an upgrade request for a path no shim takes is
      still not served as the plain request it would be with no `upgrade`
      listener at all. It gets the bare `404` (before the fix: no answer,
      and the connection ended after 1 s if it was new, and not at all if
      it had already carried a response). Node has had
      `server.shouldUpgradeCallback` since 22.21.0 (its documentation),
      which declines an upgrade before the socket is handed over, so that
      the request handler answers it (measured on 22.22.0 with a plain
      `http.Server`: 200 from the handler, and no `upgrade` event). It was
      not used: each shim decides inside its own listener what it takes,
      and `engines` allows Node from 22.11, where the callback does not
      exist.
    - **Also left as it is:** what a client gets when it sends a plain
      request and an upgrade in one write. Node hands the upgrade over while
      the plain request is still being handled (measured on 22.22.0). The
      guard's `404` goes out after whatever the connection has written one
      turn of the event loop later: the real app's `/health` is answered
      first, and then the `404` (measured; the test pins that order for a
      handler that answers from a promise callback); a plain request
      whose handler takes 50 ms is not answered at all, since the connection
      is closed by then (pinned). If the plain request's answer closes the connection, Node
      ends the socket itself and the upgrade goes with it, with no `404` and
      no count (pinned too). A path a shim takes fares worse, and did before
      this change: through `/twitch-irc` the `101` arrived ahead of the
      plain request's `200` (measured before and after the fix). Only that
      connection is affected.
    - **Shutdown:** unclaimed upgrades no longer hold the server open at
      SIGTERM, because they are closed: as soon as the `404` has left, and
      after 1 s where the client is not reading. (As written at
      `e2439dad73` this bullet said only "because they are closed", and for
      a client that was not reading that was false of the guard as it was
      then: on the real API one such connection made SIGTERM take 10,056 ms
      and end in `shutdown_forced_after_timeout`. With the 1 s close
      SIGTERM took 311 ms at most in the same runs, and the store was
      drained. The runs are in the GHSA-qv5m section; "Corrections after
      review", item 19.) A WebSocket that a shim has accepted
      and the client keeps open still does: with a `/twitch-irc` WebSocket
      held open, SIGTERM took 10,023 ms and ended in
      `shutdown_forced_after_timeout` at `a3edcde179`, and 10,021 ms with
      the wiring as at `6378d7c6bb`. That is not this defect, and it is not
      changed here.
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

A third review, of the fix, found the guard incomplete and three statements
wrong or loose. The guard is corrected in `a3edcde179`, and the statements in
place above:

11. **The guard did not answer, close or count an unclaimed upgrade on a
    connection that had already carried a response.** As committed in
    `45383d249e` it took a socket for claimed when `socket.bytesWritten` was
    above zero. That count is the connection's total, so a response sent
    earlier on a kept-alive connection passed for a listener's write.
    engine.io's timer has the same test, so nothing ended such a socket.
    The crash half of the fix held there: the `'error'` listener was
    attached. But this record, the module's comment, the metric's help text
    and the test's header all said that every unclaimed upgrade was
    answered `404`, closed and counted, and for a reused connection that
    was false (the runs are in the GHSA-qv5m section, "What that commit
    missed"). Every request in the test as first committed opened its own
    connection, so no test reached it. The correction:
    -   Bytes written no longer count as a listener taking the socket. A
        socket is taken when a listener has ended it, destroyed it or put
        an `'error'` listener of its own on it, which is how each of the
        three shims takes one. A listener that only writes gets the
        guard's `404` after its bytes, and the test pins that.
    -   The review suggested comparing `bytesWritten` with its value at
        the hand-off, and tried it: that closes the kept-alive case. It
        does not close this one: when a plain request and an upgrade
        arrive in one write, Node hands the upgrade over before the plain
        request is answered, and the answer, written before the guard
        looks, passes for a listener's write (measured with that variant:
        the connection stays open, and the pipelined test fails).
    -   `'error'` listeners are counted from what the socket had at the
        hand-off. A server that gives every connection an `'error'`
        listener when it accepts it would otherwise make every upgrade
        look taken; this API does not, and the test covers one that does.
    -   The metric's help text said each counted upgrade "is answered 404
        and closed". It now says what is counted: upgrades the guard
        closed, answered `404` unless the connection had already failed.
    -   The message of `45383d249e` describes the guard as it was, with
        "written to" among the ways of taking a socket. It stays as
        written.
12. **"Within about a second"** (header, Summary, the mechanism, item 1)
    held only for a new connection. On one that had already carried a
    response engine.io's timer never ended the socket, so the time in
    which a reset ended the process had no bound (measured: a reset 10 s
    after the upgrade, exit code 1). Whether production was exposed is
    still not known; only the bound was wrong.
13. **"Started as production starts it"** (item 1). Only the command was
    production's. The runs used the development environment and the memory
    store; production runs `./bin/migrate && exec ./bin/start-app` with
    `NODE_ENV=production` on Postgres
    (`deploy/docker/production/docker-compose.yml:21-22`, `:27-31`, `:44`).
    Item 1
    now says "started with start-app's command (development environment,
    memory store)", as the GHSA-qv5m section already did.
14. **"Every request that carries an `Upgrade` header"** (the module's
    comment, and the message of `45383d249e`, which stays as written).
    Node hands a request to the `upgrade` listeners only when it also
    carries `Connection: upgrade` (measured). The comment, the header and
    item 1 now say so.

A fourth review, of the corrected fix, found three statements wrong or
loose and one case that "answered `404`, closed and counted" did not cover.
The statements are corrected in place above, and the case is bounded in the
guard, in `c081bad011`:

15. **What the 04:05Z run at `3a5986028f` measured.** The GHSA-qv5m
    section and the Verification row said the h2c upgrade and the two
    requests in one write were each left for 10 s and then reset. In that
    run only the kept-alive WebSocket upgrade was; the other two were
    watched for 3 s and not reset. The fourth review ran the two for 10 s
    with a reset on an export of `packages/api` at `3a5986028f` (05:32Z),
    with the result the record had given: still open, not counted, the
    process up after the reset. Both places now say which run measured
    what. The message of `a3edcde179` carries the first wording and stays
    as written.
16. **"The nginx configs gave it no way in"** (item 1) stated as fact what
    rests on nginx's documentation, in a record whose next sentence and
    whose "Not verified" list say nginx was not run. The same inference
    stood under "Known:" in the GHSA-qv5m section. Item 1 now says "by
    nginx's documented behaviour ... not established", and the section
    separates what the tree shows from what the proxies' documentation
    says.
17. **"The OBS shim writes its 404 or destroys"** listed a write as a way
    of taking a socket, three sentences after saying bytes written do not
    count. The shim destroys the socket in both branches, after its own
    404 or without one (`obs-ws-compat/server.ts:304`, `:311-312`), and
    the destroy is what the guard sees.
18. **"Answered `404`, closed and counted" had a third exception, and the
    guard now bounds it.** The guard destroyed an unclaimed socket when
    its `404` had left Node. With answers queued ahead of it for a client
    that is not reading, the `404` never leaves: the upgrade was counted
    and the socket stayed open until the client read or left. The fourth
    review measured that on a plain `http.Server` with the guard (a 32 MiB
    answer and the upgrade in one write, a client that never reads: after
    8 s one connection, ended, not finished, not destroyed) and did not
    reach it on the real API over loopback, where in its run the kernel
    took every answer. No crash followed. (As first written, this item
    said "could not reach it", and that nothing new was exposed by it,
    since a plain request holds a connection the same way. The state can
    be reached there, and it did expose something: item 19.) The guard
    now also destroys the socket 1 s after ending it
    (`UNCLAIMED_CLOSE_TIMEOUT_MS`, an unref'd timer cleared on close), the
    time engine.io gives an upgrade it does not recognise; a new test
    holds it, and fails with the timer removed ("timed out waiting for the
    server to have no connection left"). The header, the GHSA-qv5m
    section, the Shutdown bullet, the module's comment and the metric's
    help text name the case.

A check of that correction, made after `a79bfb6bbd` against the outputs kept
from the runs, found two of its statements wrong and two loose, and one that
had stood since the first version. It changed this record only:

19. **"Nothing new was exposed by it"** (item 18 as first written), and
    **"the state was not reached on the real API over loopback at all"**
    ("Not verified"). Both repeated the fourth review, which had not
    reached the state on the real API. Runs made there while the 1 s close
    was being written (05:55Z to 06:00Z), which this record did not cite,
    had reached the state with a larger write, and had found what it
    exposed: a connection kept that way held the server open at SIGTERM
    until the forced exit, which does not drain the store (10,056 ms),
    where the same write without the upgrade did not (26 ms). So the
    Shutdown bullet of item 1 as written at `e2439dad73`, "unclaimed
    upgrades no longer hold the server open at SIGTERM, because they are
    closed", was false for a client that does not read, and the 1 s close
    is what makes it true: 311 ms at most in the same runs. They were
    repeated after `a79bfb6bbd` with the same result. The runs are now in
    the GHSA-qv5m section ("What the correction still missed"), and the
    header, the Shutdown bullet, item 18 and "Not verified" say what they
    show. The message of `c081bad011` carries both statements ("could not
    be reached on the real API over loopback", "it exposed nothing a plain
    request does not") and stays as written. No code changed: the guard
    already had the 1 s close.
20. **Two statements about the runs themselves** (Verification). "The
    second correction (from 06:50Z)": it was written from 05:46Z, and its
    gates ran from 06:53Z. "Heavy suites started only when the 1-minute
    load average was under 3.5": the post-merge suite of fix 3 started as
    its integration suite ended, at 4.06. Both now say so. And items 15 to
    18 stood under the third review's sentence; they have their own now.
21. **"This session has no GitHub API access"** (the first paragraph,
    "Since when" and "Not verified", since the first version). GitHub's
    REST API answered from this session on 2026-11-15, 07:26Z to 07:33Z
    (`gh api`; the GraphQL endpoint, which `gh pr view` uses, is refused
    here with a 403). Whether it would have answered on 2026-11-14 is not
    known. The two things left undetermined for want of it were read, the
    first two places now give them, and the "Not verified" entry is gone:
    the log of run 43653547472, whose
    "Dependency audit" job failed in its "OSV scanner" step with the seven
    rows and the total this record gives; and the first run to fail, the
    push run 43653345220 at 23:27Z on 2026-11-14, with no run of either
    workflow listed since the advisories were published. `security.yml`'s
    first run after them, 43653547397 at 23:30Z, failed in the same step of
    its "Dependency vulnerability audit" job. In each of the three runs
    that job was the only one that failed.
22. **"Something a plain request does not"** and **"the server closes that
    one at SIGTERM"** (the GHSA-qv5m section, as the check wrote them) said
    more about plain requests than was run. The control was the same 4,997
    `GET /` requests without the upgrade, whose answers were complete, so
    the server closed that connection at SIGTERM. A plain request the
    client leaves unfinished takes the forced exit by itself: the fifth
    review ran a POST with part of its body (10,026 ms,
    `shutdown_forced_after_timeout`) and a GET with unfinished headers
    (10,032 ms, the same) on the API at `dc2ecd611f`, against 41 ms and a
    drained store with no connection held, and
    `deploy/docker/production/README.md:58` already says it of an SSE
    stream or a WebSocket client. Both sentences now say "the same
    requests without the upgrade", and that the stalled upgrade was one
    more way into a path that exists without it. Item 19's own wording
    ("the same write without the upgrade") was right.
23. **The stalled client's condition, and the test header's count.** The
    header of this record, the third case in the GHSA-qv5m section and the
    test file's header said without condition that a client that does not
    read the answers ahead of its upgrade kept its connection, or is not
    sent the `404`. The runs in "What the correction still missed" show it
    only where those answers are more than the kernel takes (not with
    writes of about 65,000 bytes; with 129,998 and 194,998). Each now
    carries the condition. The test file's header also counted two
    exceptions where the test and this record have three; it now names the
    third, an upgrade whose connection has already failed when the guard
    looks.
24. **Four small statements about the runs.** The check's runs ended at
    07:35Z, not 07:40Z (its commit was made at 07:35:46Z). The 990 ms row
    gave "1,000 to 1,003 ms" for 50 rounds: only the 25 rounds of 07:29Z
    have a kept output (1,000 to 1,002), and the fifth review's 25 read
    999 to 1,004, one of them 999; none is under the test's 990. "Both
    workflows had last passed on `develop` at 17:47Z": that is when the
    two runs started; they finished at 17:55Z and 17:49Z. And six rows of
    fix 3 cite runs whose output was not kept; Verification now says so
    and that the fifth review repeated them. The message of `dc2ecd611f`
    carries the first two as first written and stays as it is.
25. **One run of the fifth review ended in exit code 1, and it was not the
    fixed app.** The reviewer attacking the API with raw sockets started
    it from the worktree at 07:39:52Z, and that run died in its "upgrade
    carrying a body, then reset" case with the unhandled `read ECONNRESET`
    this record is about. The other reviewer of the same round was at that
    moment running the test file against one-line changes made in the
    same worktree and put back afterwards: from 07:39:45Z to 07:40:04Z
    `src/webSocketUpgrades.ts` had the guard taken out of
    `attachWebSocketShims`, and from 07:40:04Z to 07:40:10Z `src/index.ts`
    was as at `6378d7c6bb` (the times of that reviewer's own diff and
    output files). The API in the first run therefore loaded the wiring
    with no guard, and its output shows it: the half-close case before
    the crash, an unclaimed upgrade, got no answer and no count, and the
    run logged no `http_upgrade_unclaimed` line, where every later run of
    the same script got the `404`, a count of one and four lines. In
    twelve further full runs and about 5,400 concentrated requests that
    reviewer saw no socket error without a listener. So the run reproduces
    the defect on the unguarded wiring once more and shows no gap in the
    guard. Reviews of this branch that change files now do it in a copy.

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
The correction after the third review (from 04:00Z) changed
`src/webSocketUpgrades.ts`, its test and the metric's help text in
`src/telemetry/metrics.ts`: the rows marked "fix 2" were run on
the tree its commit `a3edcde179` holds, the API suites in full before the
commit was made (04:48Z to 05:01Z) and the reproductions on the commit itself.
The second correction (written from 05:46Z, its gates from 06:53Z) added the
1 s close to `src/webSocketUpgrades.ts`, its test and the help text: the rows
marked "fix 3" were run on the tree its commit `c081bad011` holds, before the
commit was made, except where a row names another tree. The rows marked
"check" were run for the check of that correction (07:17Z to 07:35Z), which
changed only this record: on the worktree at `a79bfb6bbd`, where they name
no other tree. `origin/develop` moved to `898d466cb5` (#1009) while this
branch was in review and is not merged into it: #1009 changes no file this
branch changes, and none under `packages/api` or the JavaScript lockfile.
The OSV, gitleaks, prettier, duplicate-path, lint-staged and auth-guard rows
of fix 3 were run from the coordinating session and their output was not
kept; the fifth review repeated each on `dc2ecd611f`, and each passed.
Commands are as in `ci.yml` and `security.yml` where those run them. Heavy
suites started only when the 1-minute load average was under 3.5, one at a
time, with one exception: the post-merge suite of fix 3 started as its
integration suite ended, at 4.06.

| Gate                                       | Command                                                                                                                                                                                                                                                                                                                                                           | Result                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV, before                                | osv-scanner v2.3.3, `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, on `7a9814ebc9`'s lockfile and toml, 23:46Z                                                                                                                                                                                                                                                            | exit 1: 1,493 packages, 1 filtered (deepmerge), the 7 rows above                                                                                                                                                                                                                                                                              |
| OSV                                        | the same on this change, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`, 23:46Z                                                                                                                                                                                                                                                                                  | exit 0 in all three: 1,493 packages, "No issues found", 1 filtered, no unused-ignore line                                                                                                                                                                                                                                                     |
| OSV, other lockfiles                       | the same binary on the five other lockfiles (informational; no workflow runs this)                                                                                                                                                                                                                                                                                | exit 1: 40 advisories in 24 packages (item 2 of "Found outside the gates"); unchanged by this change, which touches none of them                                                                                                                                                                                                              |
| Trivy                                      | 0.69.3, `fs .` on a `git archive` extract of `7a9814ebc9` with this change's three manifest and lock files, `security.yml`'s flags (`--severity CRITICAL,HIGH --ignore-unfixed --scanners vuln --exit-code 1 --ignorefile .trivyignore`), fresh DB                                                                                                                | exit 0 at 23:47Z: six targets, 0 findings each; `--show-suppressed` lists nothing suppressed. The same on `7a9814ebc9`'s own files: exit 0, six targets at 0                                                                                                                                                                                  |
| Trivy, all severities                      | `fs` on the lockfile alone, no severity or fixed-only filter (production paths, Trivy's default)                                                                                                                                                                                                                                                                  | before: the 7 advisories as 6 MEDIUM and 1 LOW (below the gate); after: 0                                                                                                                                                                                                                                                                     |
| pnpm audit                                 | `pnpm audit --prod --audit-level high` (`security.yml`) and `--audit-level moderate` (`guard:audit-clean`)                                                                                                                                                                                                                                                        | before: high exit 0, moderate exit 1 ("8 vulnerabilities", "2 low \| 6 moderate"); after: both exit 0, "1 vulnerabilities found", 1 low (deepmerge)                                                                                                                                                                                           |
| lockfile                                   | `pnpm install --lockfile-only --ignore-scripts`, twice (exact override, then caret)                                                                                                                                                                                                                                                                               | exit 0 both; diff as in Lockfile                                                                                                                                                                                                                                                                                                              |
| install                                    | `pnpm install --frozen-lockfile --ignore-scripts`                                                                                                                                                                                                                                                                                                                 | exit 0, "Lockfile is up to date, resolution step is skipped", 2 packages added                                                                                                                                                                                                                                                                |
| API lint                                   | `pnpm --filter @blackout/api lint` (`eslint "src/**/*.ts" "test/**/*.ts" --max-warnings=0`)                                                                                                                                                                                                                                                                       | exit 0, 9 s                                                                                                                                                                                                                                                                                                                                   |
| API types                                  | `pnpm --filter @blackout/api typecheck` (`tsc --noEmit -p tsconfig.json`)                                                                                                                                                                                                                                                                                         | exit 0, 10 s                                                                                                                                                                                                                                                                                                                                  |
| API integration                            | `pnpm --filter @blackout/api test:integration` with `BLACKOUT_DB_MODE=memory`, `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test` (`ci.yml`)                                                                                                                                                                                                                           | exit 0: 2,033 tests, 2,033 pass, 0 fail, 0 cancelled, 0 skipped, 230 s                                                                                                                                                                                                                                                                        |
| API post-merge                             | `pnpm --filter @blackout/api test`, without the CI env above (`turborepo-ci.yml` runs it through `turbo run test` on pushes)                                                                                                                                                                                                                                      | exit 0: 2,153 tests, 2,153 pass, 0 fail, 0 cancelled, 0 skipped, 515 s; every one of the 2,033 integration test names appears in it                                                                                                                                                                                                           |
| API launch smoke                           | `pnpm --filter @blackout/api test:launch-smoke` with the same env (`ci.yml`)                                                                                                                                                                                                                                                                                      | exit 0: 14 tests, 14 pass, 0 fail, 4 s                                                                                                                                                                                                                                                                                                        |
| on the wire                                | the real app under `serve()` from 2.1.3 and from 2.1.6, 16 raw requests                                                                                                                                                                                                                                                                                           | 13 identical; the 3 backslash paths reach the app on 2.1.3 and get 400 from 2.1.6                                                                                                                                                                                                                                                             |
| router                                     | the real app on 4.13.11 and 4.13.16: router name, RegExpRouter build, 10 requests (7 with an encoded line terminator, 3 controls without one)                                                                                                                                                                                                                     | `SmartRouter + TrieRouter` on both; RegExpRouter refuses 48 of 755 routes on both; all 10 requests ran the wildcard middleware on both                                                                                                                                                                                                        |
| prettier                                   | `prettier --check` on the changed files (`pnpm-lock.yaml` is in `.prettierignore`)                                                                                                                                                                                                                                                                                | pass on this record, `package.json` and `packages/api/package.json`                                                                                                                                                                                                                                                                           |
| duplicate paths                            | `node tools/ci/check-duplicate-paths.mjs`                                                                                                                                                                                                                                                                                                                         | exit 0, five checks passed                                                                                                                                                                                                                                                                                                                    |
| lint-staged, auth guard                    | `npx lint-staged --concurrent false` and `node tools/ci/check-auth-secrets.mjs` before the commit                                                                                                                                                                                                                                                                 | lint-staged: `prettier --write --ignore-unknown` on the four staged files, no change; guard: "Auth secret hardening check passed", exit 0                                                                                                                                                                                                     |
| gitleaks                                   | 8.21.2, `gitleaks dir --no-banner --redact` on each changed file before the commit                                                                                                                                                                                                                                                                                | "no leaks found" on each of the four changed files; the range scan over the branch's commit runs once the commit exists (reported with the PR)                                                                                                                                                                                                |
| gitleaks, range (review)                   | `gitleaks git --no-banner --redact --log-opts="origin/develop..HEAD"` at 00:41Z, before the second commit                                                                                                                                                                                                                                                         | "1 commits scanned", "no leaks found", exit 0                                                                                                                                                                                                                                                                                                 |
| OSV (review)                               | osv-scanner v2.3.3, `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, 00:41Z on 2026-11-15                                                                                                                                                                                                                                                                                   | exit 0: "No issues found", 1 filtered (deepmerge)                                                                                                                                                                                                                                                                                             |
| upgrade reset (review)                     | the real app under `serve()` from 2.1.3 and from 2.1.6 with the three shims attached; one raw `Upgrade: websocket` request, a client reset, then `GET /health` (GHSA-qv5m section)                                                                                                                                                                                | exit 1 with an unhandled `ECONNRESET` for `/v1/health`, `/v1/anything`, `/obs-ws-nope` reset after 200 ms on both versions, and on 2.1.6 for resets after 20 and 900 ms and for `/twitch-irc/x`; alive for a reset after 1,500 ms, for `/twitch-irc`, `/obs-ws/no-such-id` and `/se-overlay/`, and with no shim attached                      |
| Node `upgrade` hand-off (review)           | a plain `http.Server` on Node 22.22.0: the socket's `'error'` listener count on `connection` and inside `upgrade`; and an upgrade request to a server with no `upgrade` listener                                                                                                                                                                                  | 1, then 0; with no listener, the request handler answers it (200)                                                                                                                                                                                                                                                                             |
| Trivy, perturbation (review)               | 0.69.3 `fs services/perturbation/requirements.txt --scanners vuln --list-all-pkgs`, no severity or fixed-only filter, DB of 2026-11-14 19:00Z                                                                                                                                                                                                                     | 0 vulnerabilities; packages: the five pins only (no starlette)                                                                                                                                                                                                                                                                                |
| API lint, types, smoke (review)            | the three commands above, same env, 00:47Z to 00:49Z on 2026-11-15                                                                                                                                                                                                                                                                                                | lint exit 0 (9 s); typecheck exit 0 (17 s); launch smoke 14 tests, 14 pass, 0 fail (3 s)                                                                                                                                                                                                                                                      |
| upgrade reset, before (fix)                | at `6378d7c6bb`, the API started as `start-app` starts it (`node --import tsx src/index.ts`, memory store, a free port), a fresh process for each of 11 requests: one raw `Upgrade: websocket` request, a client reset after 0 to 1,500 ms, then `GET /health`; 01:45Z to 02:01Z                                                                                  | 7 processes exit 1 with an unhandled `ECONNRESET` (`/v1/health` after 0, 20, 200 and 900 ms; `/v1/anything`, `/obs-ws-nope` and `/twitch-irc/x` after 200 ms); 4 alive (`/v1/health` after 1,500 ms, `/twitch-irc`, `/obs-ws/no-such-id`, `/se-overlay/`)                                                                                     |
| upgrade reset, after (fix)                 | the same 11 at `45383d249e`, 03:09Z; then one process sent 600 unclaimed upgrades reset after 0 to 3 ms                                                                                                                                                                                                                                                           | 11 alive, `/health` 200, exit 0 on SIGTERM; the guard's 404 for the 8 on unclaimed paths, 101, the OBS shim's 404 and 101 for the 3 claimed. The 600: alive, `http_upgrades_unclaimed_total` 600, 1 log line, nothing unhandled                                                                                                               |
| Node, other hand-offs (fix)                | a plain `http.Server` on Node 22.22.0 with no `connect` or `clientError` listener: an HTTP CONNECT and a malformed request, each also followed by a client reset; and a server whose `shouldUpgradeCallback` declines one path                                                                                                                                    | CONNECT: closed with no bytes; malformed: 400, then closed; nothing uncaught after a reset. The declined upgrade: 200 from the request handler, no `upgrade` event                                                                                                                                                                            |
| upgrade guard test (fix)                   | `tsx --test test/websocket-upgrade-guard.integration.test.ts` with CI's env; then with the guard taken out of `attachWebSocketShims`, and with 14 other one-line changes to the guard, one at a time, each restored afterwards                                                                                                                                    | 12 tests, 12 pass. Guard taken out: 7 of 12 fail (in process, `uncaughtException`, `read ECONNRESET`; the API process, exit code 1). Each of the other 14: at least 1 fails                                                                                                                                                                   |
| API lint (fix)                             | `pnpm --filter @blackout/api lint`                                                                                                                                                                                                                                                                                                                                | exit 0, 8 s                                                                                                                                                                                                                                                                                                                                   |
| API types (fix)                            | `pnpm --filter @blackout/api typecheck`                                                                                                                                                                                                                                                                                                                           | exit 0, 9 s                                                                                                                                                                                                                                                                                                                                   |
| API integration (fix)                      | `pnpm --filter @blackout/api test:integration` with `BLACKOUT_DB_MODE=memory`, `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test`                                                                                                                                                                                                                                      | exit 0: 2,045 tests (the 2,033 above and the 12 new), 2,045 pass, 0 fail, 0 cancelled, 0 skipped, 237 s                                                                                                                                                                                                                                       |
| API post-merge (fix)                       | `pnpm --filter @blackout/api test`, without the CI env                                                                                                                                                                                                                                                                                                            | exit 0: 2,165 tests, 2,165 pass, 0 fail, 0 cancelled, 0 skipped, 473 s; every one of the 2,045 integration test names appears in it                                                                                                                                                                                                           |
| API launch smoke (fix)                     | `pnpm --filter @blackout/api test:launch-smoke` with the CI env                                                                                                                                                                                                                                                                                                   | exit 0: 14 tests, 14 pass, 0 fail, 3 s                                                                                                                                                                                                                                                                                                        |
| prettier, duplicate paths (fix)            | `prettier --check` on the five changed files (this record and four under `packages/api`); `node tools/ci/check-duplicate-paths.mjs`                                                                                                                                                                                                                               | pass; exit 0, five checks passed                                                                                                                                                                                                                                                                                                              |
| OSV (fix)                                  | osv-scanner v2.3.3, `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, 03:08Z                                                                                                                                                                                                                                                                                                 | exit 0: "No issues found", 1 filtered (deepmerge)                                                                                                                                                                                                                                                                                             |
| gitleaks (fix)                             | 8.21.2: `gitleaks dir --no-banner --redact` on each of the five changed files; `gitleaks git --no-banner --redact --log-opts="origin/develop..HEAD"` at 03:09Z, after the fix's commit and before this record's                                                                                                                                                   | "no leaks found" on each file and over the range ("3 commits scanned"). A first file scan had flagged RFC 6455's sample handshake nonce, written as a literal in the new test (`generic-api-key`); the test now generates its nonce, and nothing was added to `.gitleaksignore`                                                               |
| reused connection, before (fix 2)          | the wiring as at `6378d7c6bb` (a copy of the tree at `3a5986028f` with that commit's `src/index.ts`), started with `start-app`'s command: `GET /health` and then an unclaimed upgrade on the same connection, and the same two in one write; each left for 10 s and then reset by the client; 04:06Z                                                              | in both, no answer to the upgrade and the connection still open after 10 s; the reset ended the process: exit 1, unhandled `ECONNRESET`                                                                                                                                                                                                       |
| reused connection, at `3a5986028f` (fix 2) | the worktree at `3a5986028f`, 04:05Z: `GET /health` and then an unclaimed WebSocket upgrade on the same connection, left for 10 s and then reset by the client; the h2c upgrade after two answered requests, and a plain request with the upgrade in one write, each watched for 3 s and not reset; and one kept-alive connection held open while SIGTERM is sent | WebSocket: no answer, not closed within 10 s, not counted; the process up after the reset. h2c and the two in one write: no answer to the upgrade within 3 s. SIGTERM: 10,028 ms, `shutdown_forced_after_timeout`, no `runtime_store_drained`                                                                                                 |
| reused connection, after (fix 2)           | the same at `a3edcde179`, 05:03Z to 05:05Z on 2026-11-15                                                                                                                                                                                                                                                                                                          | the guard's `404` for the upgrade: kept alive, for WebSocket and for h2c, and pipelined, after the plain request's 200; closed by the API within 6 ms; each counted. `/twitch-irc` on a kept-alive connection: 101. The process up after the resets. SIGTERM with the kept-alive connection held: exit 0 after 21 ms, `runtime_store_drained` |
| upgrade reset, after (fix 2)               | the 11 requests of the "fix" rows, a fresh process each, at `a3edcde179`; then one process sent 600 unclaimed upgrades reset after 0 to 3 ms                                                                                                                                                                                                                      | 11 alive, `/health` 200, exit 0 on SIGTERM; the guard's 404 for the 8 on unclaimed paths (the client that reset after 0 ms had left before it arrived), 101, the OBS shim's 404 and 101 for the 3 claimed. The 600: alive, `http_upgrades_unclaimed_total` 600, 1 log line, nothing unhandled                                                 |
| Go proxy, reused connection (fix 2)        | Go 1.24.7 `httputil.ReverseProxy`: two plain requests, then `Upgrade: websocket` or `Upgrade: h2c` on `/v1/health`. In front of a stub that records the upstream connection of each request; then in front of the API with the wiring as at `6378d7c6bb` and at `a3edcde179`                                                                                      | stub: `Upgrade: websocket` on a new upstream connection, `Upgrade: h2c` on the pooled one, which had already written the earlier answers. The API with the wiring as at `6378d7c6bb`: 502 from the proxy for WebSocket, no answer within 4 s for h2c, and the API up after the client's reset. At `a3edcde179`: 404 for both, each counted    |
| Node hand-off order (fix 2)                | a plain `http.Server` on Node 22.22.0 with a request handler that answers from a promise callback, and `upgrade` listeners: a plain request and an upgrade in one write; and an `Upgrade` header with and without `Connection: upgrade`                                                                                                                           | order: the handler starts, the `upgrade` listeners, the first listener's `process.nextTick`, the handler's answer, then `setImmediate`. Without `Connection: upgrade`: 200 from the handler, no `upgrade` event                                                                                                                               |
| upgrade guard test (fix 2)                 | `tsx --test test/websocket-upgrade-guard.integration.test.ts` with CI's env; then, in a copy of the tree, with the guard as at `3a5986028f`, with the guard taken out of `attachWebSocketShims`, and with 18 other one-line changes to the corrected guard, one at a time                                                                                         | 15 tests, 15 pass, in three runs. Guard as at `3a5986028f`: 5 of 15 fail. Guard taken out: 9 of 15 fail. Each of the other 18: at least 1 fails                                                                                                                                                                                               |
| API lint (fix 2)                           | `pnpm --filter @blackout/api lint`                                                                                                                                                                                                                                                                                                                                | exit 0                                                                                                                                                                                                                                                                                                                                        |
| API types (fix 2)                          | `pnpm --filter @blackout/api typecheck`                                                                                                                                                                                                                                                                                                                           | exit 0                                                                                                                                                                                                                                                                                                                                        |
| API integration (fix 2)                    | `pnpm --filter @blackout/api test:integration` with `BLACKOUT_DB_MODE=memory`, `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test`                                                                                                                                                                                                                                      | exit 0: 2,048 tests (the 2,045 above and 3 new), 2,048 pass, 0 fail, 0 cancelled, 0 skipped, 241 s                                                                                                                                                                                                                                            |
| API post-merge (fix 2)                     | `pnpm --filter @blackout/api test`, without the CI env                                                                                                                                                                                                                                                                                                            | exit 0: 2,168 tests, 2,168 pass, 0 fail, 0 cancelled, 0 skipped, 523 s; every one of the 2,048 integration test names appears in it                                                                                                                                                                                                           |
| API launch smoke (fix 2)                   | `pnpm --filter @blackout/api test:launch-smoke` with the CI env                                                                                                                                                                                                                                                                                                   | exit 0: 14 tests, 14 pass, 0 fail, 4 s                                                                                                                                                                                                                                                                                                        |
| prettier, duplicate paths (fix 2)          | `prettier --check` on the four changed files (this record and three under `packages/api`); `node tools/ci/check-duplicate-paths.mjs`                                                                                                                                                                                                                              | pass; exit 0, five checks passed                                                                                                                                                                                                                                                                                                              |
| OSV (fix 2)                                | osv-scanner v2.3.3, `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, 05:02Z                                                                                                                                                                                                                                                                                                 | exit 0: "No issues found", 1 filtered (deepmerge)                                                                                                                                                                                                                                                                                             |
| gitleaks (fix 2)                           | 8.21.2: `gitleaks dir --no-banner --redact` on each of the four changed files; `gitleaks git --no-banner --redact --log-opts="origin/develop..HEAD"` after the correction's commit and before this record's                                                                                                                                                       | "no leaks found" on each file and over the range ("6 commits scanned")                                                                                                                                                                                                                                                                        |
| lint-staged, auth guard (fix 2)            | `npx lint-staged --concurrent false` and `node tools/ci/check-auth-secrets.mjs` before the correction's commit and before this record's                                                                                                                                                                                                                           | lint-staged: `prettier --write --ignore-unknown` on the staged files, no change; guard: "Auth secret hardening check passed", exit 0                                                                                                                                                                                                          |
| lint-staged, auth guard (fix)              | `npx lint-staged --concurrent false` and `node tools/ci/check-auth-secrets.mjs` before the fix's commit and before each commit of this record                                                                                                                                                                                                                     | lint-staged: `prettier --write --ignore-unknown` on the staged files, no change; guard: "Auth secret hardening check passed", exit 0                                                                                                                                                                                                          |
| upgrade guard test (fix 3)                 | `tsx --test test/websocket-upgrade-guard.integration.test.ts`, without and then with CI's env; then the new test alone, in the worktree, with the guard's 1 s timer removed and the file put back after (same sha256)                                                                                                                                             | 16 tests, 16 pass, both times. Timer removed: the new test fails, "timed out waiting for the server to have no connection left"                                                                                                                                                                                                               |
| API lint (fix 3)                           | `pnpm --filter @blackout/api lint`                                                                                                                                                                                                                                                                                                                                | exit 0, 14 s                                                                                                                                                                                                                                                                                                                                  |
| API types (fix 3)                          | `pnpm --filter @blackout/api typecheck`                                                                                                                                                                                                                                                                                                                           | exit 0, 14 s                                                                                                                                                                                                                                                                                                                                  |
| API integration (fix 3)                    | `pnpm --filter @blackout/api test:integration` with `BLACKOUT_DB_MODE=memory`, `BLACKOUT_API_SKIP_LISTEN=1`, `NODE_ENV=test`, 06:53Z to 06:57Z                                                                                                                                                                                                                    | exit 0: 2,049 tests (the 2,048 above and 1 new), 2,049 pass, 0 fail, 0 cancelled, 0 skipped, 229 s                                                                                                                                                                                                                                            |
| API post-merge (fix 3)                     | `pnpm --filter @blackout/api test`, without the CI env, 06:57Z to 07:06Z                                                                                                                                                                                                                                                                                          | exit 0: 2,169 tests, 2,169 pass, 0 fail, 0 cancelled, 0 skipped, 500 s; no `not ok` line in the log                                                                                                                                                                                                                                           |
| API launch smoke (fix 3)                   | `pnpm --filter @blackout/api test:launch-smoke` with the CI env                                                                                                                                                                                                                                                                                                   | exit 0: 14 tests, 14 pass, 0 fail, 3 s                                                                                                                                                                                                                                                                                                        |
| prettier, duplicate paths (fix 3)          | `prettier --check` on the four changed files (this record and three under `packages/api`); `node tools/ci/check-duplicate-paths.mjs`                                                                                                                                                                                                                              | pass; both checks passed                                                                                                                                                                                                                                                                                                                      |
| OSV (fix 3)                                | osv-scanner v2.3.3, `TZ=UTC`, `--config=osv-scanner.toml --lockfile=pnpm-lock.yaml`, 06:56Z                                                                                                                                                                                                                                                                       | exit 0: "No issues found", 1 filtered (deepmerge)                                                                                                                                                                                                                                                                                             |
| gitleaks (fix 3)                           | 8.21.2: `gitleaks dir --no-banner --redact` on each of the four changed files; `gitleaks git --no-banner --redact --log-opts="origin/develop..HEAD"` after the second correction's commit `c081bad011` and before this record's                                                                                                                                   | "no leaks found" on each file and over the range ("8 commits scanned")                                                                                                                                                                                                                                                                        |
| lint-staged, auth guard (fix 3)            | `npx lint-staged --concurrent false` and `node tools/ci/check-auth-secrets.mjs` before the second correction's commit                                                                                                                                                                                                                                             | lint-staged: no change to the staged files; guard: "Auth secret hardening check passed"                                                                                                                                                                                                                                                       |
| stalled client, before (fix 3)             | an export of `packages/api` at `e2439dad73`, started with `start-app`'s command, 05:55Z to 06:00Z: a client that never reads sends plain `GET` requests and an unclaimed upgrade in one write of 64,972, 64,998, 129,998 and 194,998 bytes, then SIGTERM 3 s later; and the 129,998-byte write without the upgrade                                                | the two smaller writes: no longer held 900 ms after the write, SIGTERM 35 ms and 26 ms. The two larger: still held after 3 s; SIGTERM 10,056 ms both times, `shutdown_forced_after_timeout`, no `runtime_store_drained`. Without the upgrade: held, SIGTERM 26 ms, `runtime_store_drained`                                                    |
| stalled client, after (fix 3)              | the two larger writes on the working tree at 06:00Z, before `c081bad011` was committed (the guard's file is the committed one, by sha256); then the 129,998-byte write with SIGTERM about 1,550 ms after it, and without the upgrade                                                                                                                              | held 1.5 s after the write, not at 3 s; SIGTERM 28 ms and 35 ms. SIGTERM with the connection still held: 311 ms. Without the upgrade: 31 ms. Each ended in `runtime_store_drained`                                                                                                                                                            |
| 1 s close, one-line changes (fix 3)        | the test file in a copy of the tree holding the committed guard and test (by sha256), 05:58Z to 06:01Z, with one change at a time: the timer's callback emptied, the timeout 0, the timeout 60 s, `end()` for `destroy()`, the timer cleared as soon as set, the timer never cleared, the timer not unref'd                                                       | the first five: 15 of 16 pass, and the new test fails. Never cleared, and not unref'd: 16 of 16 pass                                                                                                                                                                                                                                          |
| stalled client (check)                     | the 129,998-byte write, with and without the upgrade, on the export of `e2439dad73` (07:21Z); then both larger writes, the 129,998-byte one with SIGTERM 1,545 ms after it, and the one without the upgrade, on the worktree at `a79bfb6bbd` (07:22Z)                                                                                                             | `e2439dad73`: still held after 3 s, SIGTERM 10,021 ms, `shutdown_forced_after_timeout`; without the upgrade 23 ms, `runtime_store_drained`. `a79bfb6bbd`: not held at 3 s, SIGTERM 19 ms and 21 ms; still held, 147 ms; without the upgrade 20 ms; each `runtime_store_drained`                                                               |
| upgrade guard test (check)                 | `tsx --test test/websocket-upgrade-guard.integration.test.ts` on the worktree at `a79bfb6bbd`, without and then with CI's env, 07:24Z                                                                                                                                                                                                                             | 16 tests, 16 pass, both times                                                                                                                                                                                                                                                                                                                 |
| the test's 990 ms bound (check)            | the new test's flow on a plain `http.Server` with the guard: the time from the hand-off to the close of the server's socket, by the clock the test reads. 25 rounds at 07:29Z (output kept; an earlier 25 at 07:17Z, whose output was not kept), and 25 more by the fifth review at 07:46Z                                                                        | 07:29Z: 1,000 to 1,002 ms. 07:46Z: 999 to 1,004 ms, one round reading 999. None under 990, the test's bound                                                                                                                                                                                                                                   |
| CI (check)                                 | GitHub's check runs for `a79bfb6bbd`, the head of pull request #1010, read through the REST API at 07:26Z                                                                                                                                                                                                                                                         | 62 check runs, all completed, the last at 07:23Z: 61 passed, 1 skipped ("Regenerate baselines and push to PR branch")                                                                                                                                                                                                                         |
| CI, the first red runs (check)             | GitHub's Actions REST API (`gh api`), 07:31Z to 07:33Z: the runs of `ci.yml` and of `security.yml` created from 2026-11-11 to 23:35Z on 2026-11-14, the jobs of runs 43653345220, 43653547472 and 43653547397, and the log of the failed job of 43653547472                                                                                                       | both workflows last passed on `develop` at 17:47Z on 2026-11-12; no run of either is listed from then until 23:27Z on 2026-11-14; then the three runs, each with one failed job, its audit, in the "OSV scanner" step. The log: the seven rows and the total line the first paragraph quotes                                                  |
| record, before its commit (check)          | `prettier --check` on this record; `node tools/ci/check-duplicate-paths.mjs`; osv-scanner as in the "fix 3" row, 07:33Z; `gitleaks dir` on this record and `gitleaks git` over `origin/develop..HEAD`; `npx lint-staged --concurrent false` and `node tools/ci/check-auth-secrets.mjs` with this record staged                                                    | prettier: pass; duplicate paths: exit 0, five checks passed; OSV: exit 0, "No issues found", 1 filtered (deepmerge); gitleaks: "no leaks found" on the file and over the range ("9 commits scanned"); lint-staged: no change to the staged file; guard: "Auth secret hardening check passed"                                                  |

**Not verified:**

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
-   An upgrade handed over on a socket whose writable side is already ended
    at the hand-off. The guard leaves such a socket alone, since it cannot
    be answered. On a plain `http.Server` that answers `Connection: close`,
    600 tries to land an upgrade request in that state produced 201
    `upgrade` events, none of them in it; the case was not seen, and no test
    covers it.
-   Whether any proxy in front of the API sends two requests in one write
    on an upstream connection (pipelining). None was tested for it.
-   The 1 s close on a real network path. The test queues 32 MiB ahead of
    the upgrade for a paused client on loopback. On the real API over
    loopback the state was reached with one write of 129,998 bytes or of
    194,998, and not with about 65,000 or fewer (the GHSA-qv5m section).
    A path whose send buffer starts smaller, where less may do, was not
    tested.
-   CI on the commit that adds the rows marked "check": it was not pushed
    when this was written. CI ran on `a79bfb6bbd`, the head of pull request
    #1010 (the "CI" row).
