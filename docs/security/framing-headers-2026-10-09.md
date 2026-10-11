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
    pages that matter, go out with neither framing header.
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
Http-level `map` blocks decide two values per request:

-   `$black_mask_panel_uri`: `1` when `$request_uri` matches the client image's
    own tests, `^/embed(\?|$)` or `^/embed/`. nginx normalises `/%65mbed/`
    into the panel locations; its raw URI fails this, so it keeps the proxy's
    headers.
-   `$black_mask_panel_upstream_frames`: `1` when
    `$upstream_http_content_security_policy` is exactly
    `frame-ancestors 'none'` or `frame-ancestors` followed by lower-case
    `scheme://host[:port]` origins, which is all
    `40-black-mask-frame-ancestors.sh` writes.

Only when both are `1` do the panel locations send no `X-Frame-Options`, the
proxy's CSP without its `frame-ancestors` directive, and a second CSP header
repeating the container's list. In every other case the maps' defaults
produce exactly the `security-headers.conf` values: same headers, same order,
same bytes. The panel locations restate that set because declaring any
`add_header` drops the inherited ones (HSTS from `hsts.conf`, the rest
inline). The CSP string therefore exists twice more in each site config (the
map's default and relaxed values). `tools/ci/check-embed-proxy-framing.mjs`
fails CI if either drifts from `security-headers.conf` other than by the
`frame-ancestors` directive, and on every other way this can fail open (the
panel locations or raw-URI rule lost, a default changed, the condition or the
upstream test loosened, the variables used anywhere else). Its test breaks
each case on purpose.

**Why maps, and when nginx evaluates them.** nginx computes a map value the
first time a request uses it and keeps it for the rest of that request. Only
the panel locations' `add_header` lines use these maps, and nginx evaluates
`add_header` values when it sends the response header, after the upstream's
headers have been read. A response nginx makes itself (502, 504, any error
page) has no upstream headers, so the maps fall to their defaults. A future
use of these variables in a directive that runs before the upstream answers
(`proxy_set_header`, for one) would fix them at the defaults: the proxy would
stop relaxing, which is the safe direction.

**Repeated headers depend on the nginx version** (measured, not inferred):

-   nginx 1.24.0 (local) and 1.27.5 (`nginx:1.27-alpine`, the single-server
    proxy image) join repeated `Content-Security-Policy` headers with ", ".
    Two CSP headers therefore never match, in either order: the proxy keeps
    its own headers and the panel stays unframeable.
-   nginx 1.22.1 (`nginx:1.22.1-alpine`) reads only the first header. With the
    container's `frame-ancestors` list first and another CSP second, the proxy
    relaxes; the browser still enforces both headers, so only the listed
    origin could frame the panel. With the other CSP first, the proxy keeps
    its own headers. Hosts that install nginx from a distribution may run
    1.22 or older (Debian 12 ships 1.22; Ubuntu 22.04 ships 1.18).

**Header names.** nginx's `$upstream_http_content_security_policy` also
matches a header spelled with underscores (`Content_Security_Policy`), and
browsers do not treat that as a CSP. Measured: a stub that sent only that
spelling made the proxy relax. Because the proxy repeats the list under the
real name, the browser still applied it (only the listed origin could frame
the panel). Without that repeat, the response would have had no framing
protection at all. The client image does not send that spelling: its unit
test pins the exact header lines it writes.

**What the proxy refuses.** An earlier draft of this change accepted any
token of letters, digits and `:/.'-`, which includes `'self'`. The `blackout-web`
image (`deploy/docker/nginx-templates/default.conf.template`) and
`.github/cfp_headers` send exactly `frame-ancestors 'self'`, so that image
behind these proxies would have made `/embed` frameable by same-origin pages.
The test now accepts only what the start-up script writes. `'self'`,
wildcards, paths, other directives and (on nginx 1.23 or later) several
headers keep the proxy's own headers. The guard checks the test against both
lists.

**What the proxy still trusts.** On the two panel locations the client
container decides. Whatever list it sends in that form, the browser applies.
That is the same trust the container already has when it is served directly.

**Verification.**

-   `nginx -t` passes for both configs on 1.24.0, 1.27.5 and 1.22.1, and for
    the client config on 1.24.0 and 1.29.5 in every mode below. As in the
    2026-10-11 Semgrep triage, the runs replace `user www-data;` with
    `user root;`; the single-server compose image still has no `www-data` user
    (that triage's "found along the way" item 1), which this change does not
    touch.
-   The #958 header harness, extended with the panel paths and look-alikes
    (`/embed`, `/embed/`, `/embed/x/y`, `/embed?x=1`, `/embedded`, `/embed.js`,
    `/%65mbed/`, `//embed/`, `/EMBED/`, `/embed/../`, `/embed/%2e%2e/`,
    `/embed%2F`, `/embed%3Fx`) on the apex and chat hosts, and with the web
    upstream down as well: develop and this change give identical status and
    headers on all 168 (`infra/nginx`) and 185 (single-server) responses. Its
    stub upstream sends no CSP, so this is the fail-safe path everywhere.
-   A matrix with the proxy in front of the real client-image config, its
    start-up script run (on the client image's own busybox `sh` in the
    `nginx:1.29.5-alpine` runs): variable unset, a valid list
    (`https://mask.example chrome-extension://abcdefghijklmnopabcdefghijklmnop`),
    an invalid list; the client config from before #954; stubs sending no
    framing headers, a CSP without `frame-ancestors`, the list under the
    underscore spelling, two CSP headers in each order, `frame-ancestors *`,
    the list plus another directive, the list on a 404, and the `blackout-web`
    image's `SAMEORIGIN` + `frame-ancestors 'self'`; the upstream down (502)
    and never accepting the connection (504 after the 5 s connect timeout).
    GET and HEAD on `/`, `/embed`, `/embed/`, `/embed/x/y`, `/embed?x=1`,
    `/embedded`, `/embed.js`, `/%65mbed/`, `//embed/`, `/EMBED/`, `/embed/../`,
    `/v1/health`, `/i/x`, `/c/x`, `/embed/%2e%2e/`, `/embed%2F` and
    `/embed/%2e%2e/embed/` on the apex host (the last is the panel: nginx and
    browsers both normalise it to `/embed/`) and four of them on the chat
    host, for develop and this change, on both stacks. Three runs: nginx 1.24.0
    for proxy and client; the proxy on 1.27.5 and on 1.22.1 with the client on
    1.29.5. Each gave 2,520 responses and no request errors. With the valid
    list, the panel paths (`/embed`, `/embed/`, `/embed/x/y`, `/embed?x=1`,
    `/embed/%2e%2e/embed/`) allowed exactly the two listed origins and carried
    no `X-Frame-Options`. With the list on a 404, or only under the underscore
    spelling, they allowed exactly that one origin, as did the two-header case
    with the list first on 1.22.1. Every other response of this change was
    unframeable, in every mode. Every response outside those relaxed panel
    cases had the same status and headers as develop. On the relaxed ones, the
    only differences from develop were the proxy's `X-Frame-Options: DENY` and
    full CSP gone, and the relaxed CSP and the repeated list added. No develop
    response was frameable.
-   Real Chromium 145 through each proxy (HTTP/2), parent pages on
    `https://mask.example` (listed) and `https://evil.example` (not listed),
    served with a throwaway CA added to an NSS database. TLS verification
    stayed on. With the valid list, mask.example rendered `/embed` and was
    refused `/`, and evil.example was refused both. With the variable unset,
    and with the client config from before #954, nothing rendered. Each
    refusal was Chromium's `frame-ancestors` refusal of a 200 response.
-   Semgrep 1.36.0 (CI's version) with `p/security-audit` and `p/secrets`, full tree: no findings on develop and none with this change (5,387 and 5,389 files; the same 47 files that 1.36.0 cannot parse on both, none of them touched here). The new
    `add_header` lines carry the per-line `nosemgrep` of #958. Neither 1.36.0
    nor 1.180.0 reports them even without it; the annotation is there because
    the same rule reports identical lines elsewhere in these files.

**Still not done.** Nothing is deployed: the proxies change behaviour only when
their site config is, and the panel is frameable only once
`BLACK_MASK_FRAME_ANCESTORS` is set on the client container. Anything in front
of the proxies (the live host sits behind Cloudflare) has not been checked
for what it does with these headers. The panel has not been tested inside a
real Black Mask extension. F2 and F3 are unchanged: the `blackout-web` image,
Railway, Vercel, Netlify and Cloudflare Pages do not implement the allow-list.
