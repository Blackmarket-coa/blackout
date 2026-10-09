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
