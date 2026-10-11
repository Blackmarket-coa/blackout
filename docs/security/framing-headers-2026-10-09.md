# Framing headers on the web client — triage, 2026-10-09

Found while building the Black Mask chat panel's framing policy (launch-plan
step B2, `docs/black-mask-chat-panel-and-account-link.md`). Every finding gets a
fix or a written reason, per the standing rule in this directory.

## F1. The live web client could be framed by any site — fixed in the image

-   **Found:** `curl -I https://chat.theblackout.app/` and
    `https://chat.theblackout.app/home/` on 2026-10-09 returned no
    `X-Frame-Options` and no `Content-Security-Policy`. Any site could put the
    signed-in client in an iframe (clickjacking / UI redress).
-   **Why:** the host appears to be served by the `apps/blackout-client/Dockerfile`
    image (`/healthz` answers `ok` the way `docker-nginx.conf` does;
    `/health/ready` falls through to the SPA, which the `blackout-web` image
    would not do). That image's `docker-nginx.conf` set no security headers.
    The header snippets in `infra/nginx` and `infra/single-server-baseline`
    would have covered it, but the live host does not send their headers, so
    it is evidently not behind either.
-   **Fix:** `docker-nginx.conf` now sends `X-Frame-Options: DENY` and
    `Content-Security-Policy: frame-ancestors 'none'` on every route,
    re-included in the one location with its own `add_header` (`/healthz`).
    The only exception is the chat panel (`/embed`, `/embed/*`), which is
    still `'none'` unless `BLACK_MASK_FRAME_ANCESTORS` names allowed origins.
    Verified with `nginx -t` and `curl -I` per location against
    `nginx:1.29.5-alpine`, and in a real Chromium.
-   **Still to do (operator):** after the next deploy of that image, run
    `curl -I https://chat.theblackout.app/` and confirm both headers. Until
    then the live host is unchanged.

## F2. `blackout-web` image drops its framing headers on the main pages — open

-   **Found:** `deploy/docker/nginx-templates/default.conf.template` (used by
    `deploy/docker/Dockerfile` and `Dockerfile.blackout`, published as
    `ghcr.io/blackmarket-coa/blackout-web`) sets `X-Frame-Options:
SAMEORIGIN` and `frame-ancestors 'self'` at server level. But
    `location = /`, `= /index.html`, `/home`, `/sites`, `/config`, `/i18n` and
    `= /version` each set `add_header Cache-Control`, and nginx then drops
    every inherited `add_header` in those blocks. So `/` and `/index.html`, the
    pages that matter, go out with neither framing header. So does every path
    that falls back to `index.html` through `location /`, the chat panel's
    `/embed` included (checked 2026-10-11 with the template on nginx 1.24.0:
    `/embed`, `/embed/`, `/embed?x=1`, `/embed/dms/x` and `/home/` sent only
    `Cache-Control`; an existing static file kept `SAMEORIGIN` and `'self'`).
-   **Not fixed here, deliberately:** it is not the image serving the live
    host (F1), the chat panel does not use it, and the repository's rule for
    these configs is no batch edits: each location needs its own
    `nginx -t` and `curl -I` check. The fix is to re-include the framing
    headers in each of those seven locations (and decide `'self'` versus
    `'none'`), verified the same way as F1.

## F3. Railway, Vercel and Netlify paths send no framing headers — explained

-   **Found:** the root `index.js` (Railway's start command) sets no security
    headers; there is no `vercel.json`; `apps/blackout-client/netlify.toml`
    has redirects only.
-   **Why left:** `.github/workflows/deploy-web.yml`, the only workflow that
    deploys to these, has never run (0 runs; it triggers on `main`, which does
    not exist in this repository). If any of them is serving a client
    somewhere, it has no framing protection, the chat panel included.
    `.github/cfp_headers` is an upstream leftover that nothing references.

## F4. Front proxies would block the panel even when it is configured — by design for now

-   `infra/nginx` and `infra/single-server-baseline/nginx` add
    `frame-ancestors 'none'` to everything at server level. Behind either
    proxy, the panel stays unframeable whatever `BLACK_MASK_FRAME_ANCESTORS`
    says. That fails closed. Enabling the panel there needs an `/embed`
    location in the proxy that re-includes the rest of its header set without
    the two framing headers, verified per location. Not done until a
    deployment actually needs it.
-   **2026-10-11:** fixed in both proxy configs (not deployed); see the
    follow-up below.

## Follow-up 2026-10-11: F4, the front proxies pass the panel's policy through

**Change.** `infra/nginx/sites-available/theblackout.app.conf` and
`infra/single-server-baseline/nginx/sites-available/theblackout.app.conf`
each gain the client image's two panel locations (`location = /embed`,
`location ^~ /embed/`) in the `theblackout.app chat.theblackout.app` server
block, proxied exactly as `location /` (only `proxy_pass http://blackout_web`
plus the http-level `proxy-common.conf`; no websocket headers there or here).
Http-level `map` blocks decide three flags per request:

-   `$black_mask_panel_uri`: `1` when `$request_uri` matches the client image's
    own tests, `^/embed(\?|$)` or `^/embed/`. nginx normalises `/%65mbed/`
    into the panel locations; its raw URI fails this, so it keeps the proxy's
    headers.
-   `$black_mask_panel_upstream_frames`: `1` when
    `$upstream_http_content_security_policy` is exactly
    `frame-ancestors 'none'` or `frame-ancestors` followed by lower-case
    `scheme://host[:port]` origins, which is all
    `40-black-mask-frame-ancestors.sh` writes.
-   `$black_mask_panel_upstream_complete` (added after review, below): `1` when
    the last entry of `$upstream_header_time` is a time, that is, when nginx
    read the whole response header block of the attempt it answered from. The
    entry is `-` when that block was cut off, invalid, too large or never
    finished.

Only when all three are `1` do the panel locations send no `X-Frame-Options`,
the proxy's CSP without its `frame-ancestors` directive, and a second CSP
header repeating the container's list. In every other case the maps' defaults
produce exactly the `security-headers.conf` values: same headers, same order,
same bytes. The panel locations restate that set because declaring any
`add_header` drops the inherited ones (HSTS from `hsts.conf`, the rest
inline). The CSP string therefore exists twice more in each site config (the
map's default and relaxed values).

`tools/ci/check-embed-proxy-framing.mjs` (the Hardening guards job) compares
the six maps and the two panel locations with their pinned form (the upstream
and completeness regexes byte for byte, the raw-URI tests against the client
image's), checks both CSP strings against `security-headers.conf` except for
the `frame-ancestors` directive, and fails if a `black_mask_panel_` name
appears anywhere else in either proxy's site file, `nginx.conf` or snippets
(in any case, as `$x`, `${x}` or a regex capture name, or as a second `map`,
`set` or `geo`) or if one of those files includes a file other than the known
ones. Its test file breaks each case on purpose. It does not run nginx, and it
cannot see files a host adds outside the repository (another file in
`sites-enabled/` or `conf.d/`) or anything in front of the proxy.

**Why maps, and when nginx evaluates them.** nginx computes a map value the
first time a request uses it and keeps it for the rest of that request. Only
the panel locations' `add_header` lines use these maps, and nginx evaluates
`add_header` values when it sends the response header, after the upstream's
header block has been read or has failed. A future use of these variables in a
directive that runs before the upstream answers (`proxy_set_header`, for one)
would fix them at the defaults: the proxy would stop relaxing, which is the
safe direction.

**What nginx still holds when it answers itself.** When the container refuses
the connection or never answers, there are no upstream headers and the maps
take their defaults. But when the container sends some header lines and the
block then turns out cut off, invalid or too large, nginx answers 502 (504
when the block never finishes within `proxy_read_timeout`) while the lines it
parsed are still readable through `$upstream_http_*`. The first version of
this change relaxed on such a 502 when those lines included the list; the
completeness flag closes that (review findings, below). When nginx tries
several upstream servers, `$upstream_header_time` is a list (`-, 0.002`) and
only its last entry counts: nginx discards the header lines of an earlier
attempt before it reads the next one, so `$upstream_http_*` then holds the
attempt nginx answered from. Measured on a scratch copy with two upstream
servers (both configs have one): a cut-off first attempt followed by a
complete answer was judged by that answer (relaxed only when it carried the
list), and two failed attempts (`-, -`) kept the usual headers.

Not covered: after a complete header block that carries the list, a response
nginx makes itself because of that block (its 404 for an `X-Accel-Redirect` it
refuses, its 500 when one loops) goes out relaxed, and only the proxy's repeat
of the list reaches the browser. That is still limited to the container's
list, and the client image sends no `X-Accel-Redirect`.

**Repeated headers depend on the nginx version** (measured with curl against
each version; the 1.22.1 browser outcome also in Chromium):

-   nginx 1.24.0 (local) and 1.27.5 (`nginx:1.27-alpine`, the single-server
    proxy image) join repeated `Content-Security-Policy` headers with ", ".
    Two CSP headers therefore never match, in either order: the proxy keeps
    its own headers and the panel stays unframeable.
-   nginx 1.22.1 (`nginx:1.22.1-alpine`) reads only the first header. With the
    container's `frame-ancestors` list first and another CSP second, the proxy
    relaxes; the browser still enforces both headers, so only the listed
    origin can frame the panel (Chromium 145 through a 1.22.1 proxy:
    `https://mask.example` rendered `/embed`, `https://evil.example` was
    refused). With the other CSP first, the proxy keeps its own headers. Hosts
    that install nginx from a distribution may run 1.22 or older (Debian 12
    ships 1.22; Ubuntu 22.04 ships 1.18).

**Header names: a trade-off, kept.** nginx's
`$upstream_http_content_security_policy` also matches a header spelled with
underscores (`Content_Security_Policy`), and browsers do not treat that as a
CSP. A container that sent its list only under that spelling makes the proxy
relax. Because the proxy repeats the list under the real name, the browser
still applies it: in Chromium 145 through both proxies, `https://mask.example`
rendered `/embed` and `https://evil.example` was refused. Without the repeat,
that response would have had no framing protection at all. nginx's
`$upstream_http_*` and `$sent_http_*` variables treat `_` and `-` alike, and
nginx has no setting that refuses underscores in upstream response headers, so
nginx alone cannot relax only for the real spelling; the alternative would be
not to relax at all. The client image does not send that spelling: its unit
test pins the exact header lines it writes.

**What the proxy refuses.** An earlier draft of this change accepted any token
of letters, digits and `:/.'-`, which includes `'self'`. An upstream sending
`frame-ancestors 'self'` on `/embed` would then have made the panel frameable
by same-origin pages through these proxies. (`.github/cfp_headers` sends
`'self'` on every path; the `blackout-web` image sends it only on static files
that exist, and nothing at all on `/embed`: see F2.) The test now accepts only
what the start-up script writes: `'self'`, wildcards, paths, upper case, other
directives and (on nginx 1.23 or later) several headers keep the proxy's own
headers. The guard pins the test byte for byte; the strings it must and must
not accept document it and are run against the pinned value.

**What the proxy still trusts.** On the two panel locations the client
container decides. Whatever list it sends in that form, in a complete header
block, the browser applies. That is the same trust the container already has
when it is served directly.

**Verification** (the configs as finally committed; the scripts and their
output are in the working scratchpad, not in the repository):

-   `nginx -t` passes for both configs on 1.24.0, 1.27.5 and 1.22.1 in every
    mode below, and for the client config on 1.24.0 and 1.29.5. As in the
    2026-10-11 Semgrep triage, the runs replace `user www-data;` with
    `user root;`; the single-server compose image still has no `www-data` user
    (that triage's "found along the way" item 1), which this change does not
    touch.
-   The #958 header harness, unmodified, develop against this change: 64 of
    64 (`infra/nginx`) and 81 of 81 (single-server) responses identical in
    status and headers on nginx 1.24.0, and 81 of 81 for the single-server
    stack on 1.27.5. It requests no panel path; its stub upstream sends no
    CSP. The
    copy extended with the panel paths and look-alikes (`/embed`, `/embed/`,
    `/embed/x/y`, `/embed?x=1`, `/embedded`, `/embed.js`, `/%65mbed/`,
    `//embed/`, `/EMBED/`, `/embed/../`, `/embed/%2e%2e/`, `/embed%2F`,
    `/embed%3Fx`) on the apex and chat hosts, with the web upstream down as
    well: 168 of 168 and 185 of 185 identical. That stub sends no CSP either,
    so this is the fail-safe path everywhere.
-   A matrix with the proxy in front of the real client-image config, its
    start-up script run (on the client image's own busybox `sh` in the
    `nginx:1.29.5-alpine` runs): variable unset, a valid list
    (`https://mask.example chrome-extension://abcdefghijklmnopabcdefghijklmnop`),
    an invalid list; the client config from before #954; stubs sending no
    framing headers, a CSP without `frame-ancestors`, the list under the
    underscore spelling, two CSP headers in each order, `frame-ancestors *`,
    the list plus another directive, the list on a 404, and `SAMEORIGIN` +
    `frame-ancestors 'self'`; the upstream down (502) and never accepting the
    connection (504 after the 5 s connect timeout). GET and HEAD on `/`,
    `/embed`, `/embed/`, `/embed/x/y`, `/embed?x=1`, `/embedded`, `/embed.js`,
    `/%65mbed/`, `//embed/`, `/EMBED/`, `/embed/../`, `/v1/health`, `/i/x`,
    `/c/x`, `/embed/%2e%2e/`, `/embed%2F` and `/embed/%2e%2e/embed/` on the
    apex host (the last is the panel: nginx and browsers both normalise it to
    `/embed/`) and `/`, `/embed`, `/embed/x/y` and `/%65mbed/` on the chat
    host, for develop and this change, on both stacks. Three runs: nginx
    1.24.0 for proxy and client; the proxy on 1.27.5 and on 1.22.1 with the
    client on 1.29.5. Each gave 2,520 responses, no request errors and no
    assertion failures. With the valid list, the panel paths
    (`/embed`, `/embed/`, `/embed/x/y`, `/embed?x=1`, `/embed/%2e%2e/embed/`)
    allowed exactly the two listed origins and carried no `X-Frame-Options`.
    With the list on a 404, or only under the underscore spelling, they allowed
    exactly that one origin, as did the two-header case with the list first on
    1.22.1. With the variable unset or invalid, the panel paths stayed
    unframeable but did change: the proxy's `X-Frame-Options` and its
    `frame-ancestors` gave way to its repeat of the container's `'none'`, and
    the container's own `DENY` and `'none'` stayed. Every other response of
    this change was unframeable, in every mode, and every response outside
    these relaxed panel cases had the same status and headers as develop. On
    the relaxed ones, the only differences from develop were the proxy's
    `X-Frame-Options: DENY` and full CSP gone, and the relaxed CSP and the
    repeated list added. No develop response was frameable.
-   Header blocks that fail after the list: a raw-socket stub sent the status
    line and `Content-Security-Policy: frame-ancestors https://mask.example`,
    then closed; or sent an invalid header line; or sent a 20 kB header; or
    never finished. On nginx 1.24.0, 1.27.5 and 1.22.1, both stacks, every
    response to the first three on `/embed`, `/embed/`, `/embed/x/y`,
    `/embed?x=1` and chat `/embed` (GET and HEAD) is byte-identical to
    develop's; the first version of this change had relaxed every one of them
    (reproduced on 1.24.0 and 1.27.5, both stacks).
    The last gave nginx's 504 after the 300 s read timeout with the usual
    headers (1.24.0, both stacks). In the same runs the list, the list on a
    404 and the underscore spelling still relaxed, to the listed origin only,
    and so did the two `X-Accel-Redirect` cases above.
-   Real Chromium 145 through the proxies (HTTP/2), parent pages on
    `https://mask.example` (listed) and `https://evil.example` (not listed),
    served with a throwaway CA added to an NSS database. TLS verification
    stayed on. With the valid list (both stacks on 1.24.0, and the
    single-server stack on 1.27.5), mask.example rendered `/embed` and was
    refused `/`, and evil.example was refused both. With the variable unset,
    the client config from before #954, two CSP headers on 1.24.0, or a
    header block cut off after the list, nothing rendered. With the list only
    under the underscore spelling (both stacks), or two CSP headers with the
    list first on 1.22.1, only mask.example rendered `/embed`. On the first
    version of this change, the cut-off header block let mask.example render
    nginx's `502 Bad Gateway` page inside its frame of `/embed`; on the final
    configs it was refused. Every refusal was Chromium's `frame-ancestors`
    refusal.
-   Semgrep 1.36.0 (CI's version) with `p/security-audit` and `p/secrets`,
    full tree: no findings on develop and none with this change (5,387 and
    5,389 files; the same 47 files that 1.36.0 cannot parse on both, none of
    them touched here), and none in the files this change touches. The new
    `add_header` lines carry the per-line
    `nosemgrep` of #958. 1.36.0 does not report them even without it
    (`--disable-nosem`): the header-redefinition rule reports `add_header`
    lines of other kinds (`Access-Control-*`, `Cache-Control`,
    `Content-Length`) in the other server blocks of these files. The panel
    lines keep the annotation to follow #958's convention, so that a rule or
    engine change that starts reporting them shows the reason next to them.
-   Restart versus recreate: with Docker Compose 5.1.1, a container built from
    the client image's nginx files kept its creation-time environment through
    `docker compose restart` and `docker restart`, so a rollback by restart
    left `/embed` sending the old list; `docker compose up -d` and
    `--force-recreate` applied the change both ways.

**Review findings and what changed** (later on 2026-10-11). Three independent
reviews (a header matrix, an adversarial review and a docs review) reported
these; each was reproduced again before it was changed.

-   **Cut-off header blocks: fixed.** After a container header line carrying
    the list, a header block that was cut off, invalid or too large made nginx
    answer 502 (504 on a read timeout) itself with the proxy relaxed, so the
    listed origins could frame nginx's error page (also reproduced in
    Chromium). This record and the config comments had said nginx's own error
    pages always get the usual headers. Fixed with
    `$black_mask_panel_upstream_complete`; the `X-Accel-Redirect` case above
    is what remains.
-   **Guard bypasses: fixed.** The guard's variable check was case-sensitive
    and saw neither `${...}` nor regex capture names, it collected only
    lower-case map outputs, it ignored a newly included file, and it checked
    the upstream regex by running samples through it in JavaScript. A second,
    upper-case map (`$BLACK_MASK_PANEL_UPSTREAM_FRAMES` with `default 1`)
    passed it and made `/embed` frameable by any origin behind a client image
    that sends no framing headers. So did a `set` or `geo` for the raw-URI
    flag, the panel headers moved into a newly included snippet, a `\Q…\E` or
    `| 'self'` alternative in the upstream regex, a `~*` key, and a
    `${...}` or upper-case use elsewhere. All of these now fail. Of 16 such
    mutations, each made on a copy of the real files, the old guard caught one
    (a lower-case `set`) and the new one catches all 16; nginx accepts every
    one of them.
-   **`blackout-web` on `/embed`: corrected.** This record said that image
    sends `frame-ancestors 'self'`, so the earlier draft would have made its
    `/embed` frameable by same-origin pages. On `/embed` it sends no framing
    header at all (F2, updated above); the `'self'` concern is about any
    upstream that sends `'self'` there. The message of the commit that made
    the proxy change (e072990) repeats the mistake; it is left as it is.
-   **Restart versus recreate: corrected** in the panel spec and the
    single-server RUNBOOK (measured above). The docs now say to recreate the
    container and to check `/embed` after a rollback.
-   **Matrix result: corrected.** The earlier text said every response outside
    the relaxed panel cases matched develop, which missed the unset and
    invalid modes (see the matrix bullet).
-   **Underscore spelling: kept**, for the reasons under "Header names".
-   **Wording.** "Everything" now means the web client's host (the API, Matrix
    and TURN hosts get neither framing header from the proxy); browser
    outcomes here name the runs done in Chromium; the panel spec names the
    paths that were requested; the `hsts.conf` descriptions mention the panel
    locations; the comment above the panel `add_header` lines no longer says
    Semgrep's rule flags them.

**Still not done.** Nothing is deployed: the proxies change behaviour only when
their site config is, and the panel is frameable only once
`BLACK_MASK_FRAME_ANCESTORS` is set on the client container and the container
recreated. Anything in front of the proxies (the live host sits behind
Cloudflare) has not been checked for what it does with these headers. The
panel has not been tested inside a real Black Mask extension. F2 and F3 are
unchanged: the `blackout-web` image, Railway, Vercel, Netlify and Cloudflare
Pages do not implement the allow-list, and on the `blackout-web` image and the
three static hosts any site can frame the panel.
