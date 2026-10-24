# Black Mask chat panel and account link — Blackout's part of the launch plan

Recorded 2026-10-04 from the operator's Black Mask spec of 2026-10-03. The
whole plan, with the FBM billing steps and the Black Mask fork's own phases, is
in the free-black-market repo at `docs/BLACK_MASK_LAUNCH_PLAN.md`. This file
holds the steps that land in **this** repository. Anything marked
**placeholder** is an assumption, not a decision.

## Decided

-   The Blackout chat panel is **free** for anyone with the Black Mask extension
    and a Blackout account.
-   It is a **minimal sandbox** showing only Canopies (communities and channels),
    dens and DMs. No Town Square, Coliseum, Market or feeds. A link to anything
    else opens in a normal Blackout tab.
-   The panel gets **unread indicators and push notifications**, and **both are
    on by default** (operator, 2026-10-06). A push travels through Apple's or
    Google's push service, which learns when a message arrived even when it
    cannot read it; the panel must not describe push as private, and the
    content of a push must not include message text. Being on by default does
    not relax either constraint.
-   A Blackout account can **accept a Black Mask registration**, or **link to a
    Black Mask account**, on request. The user picks how long the link lasts: a
    timeframe or indefinitely, nothing preselected.
-   Unlinking or expiry ends the chat session and signs that device out. **The
    Blackout account is never deleted.**

## Placeholder or proposed

-   Building the panel as a sandboxed embed of the live Blackout client (as
    opposed to a purpose-built mini client). Proposed; not decided.
-   Phase 3 extras: delivery of dead drops or vault items into a den; Matrix
    check-in reminders and M-of-N governance approval for a dead man's switch; an
    encrypted Matrix channel for breach and phishing alerts.

## Preconditions — fix the house first

| #   | Precondition                                                                                                                                                                                                                                                               | Where                                                                   | Status 2026-10-04                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| P1  | **BO-1** key-backup `DecryptionError` / unable-to-decrypt history. BO-1 gates anything that routes trust through Blackout, so no vault extra (recovery key in the vault, device verification, dead drops into dens) may depend on Blackout's encryption until it is fixed. | `KNOWN_ISSUES.md` BO-1, `docs/audits/2026-08-10-encryption-audit.md`    | Instrumenting, not fixed               |
| P2  | Rotate the Blackout bot token.                                                                                                                                                                                                                                             | Operator secret rotation                                                | Pending                                |
| P3  | Clear the unmerged upstream security-advisory PRs.                                                                                                                                                                                                                         | PRs #927–#941, one per day of advisories, all open with unstable checks | Ten open                               |
| P4  | LiveKit voice was failing at the last audit; the panel starts with **text chat only**.                                                                                                                                                                                     | `KNOWN_LIMITATIONS.md` (LiveKit runtime binding carved to Phase 5)      | Text-only is the plan                  |
| P5  | The Squarespace page served at theblackout.app with broken federation delegation at the last audit.                                                                                                                                                                        | Hosting / `.well-known/matrix` delegation                               | Confirm and fix before the panel ships |
| P6  | Anubis (AI-scraper firewall, MIT) and CrowdSec (MIT) in front of Blackout.                                                                                                                                                                                                 | Infra configs in this repo                                              | Not started                            |

## Steps in this repository

### 1. Embed route

**Status 2026-10-09: built, not deployed** (B1). Push notifications are not part
of this step.

What the panel is. Everything lives under `/embed` (constants in
`apps/blackout-client/src/app/pages/paths.ts`, code in
`apps/blackout-client/src/app/features/black-mask-embed/`):

| Path                                    | Shows                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/embed`                                | Your canopies, dens that sit in no canopy, and direct messages, each with its unread indicator |
| `/embed/canopies/:canopyId`             | That canopy's text dens and sub-canopies                                                       |
| `/embed/canopies/:canopyId/dens/:denId` | One den: its timeline and composer, nothing else                                               |
| `/embed/dens/:denId`                    | A den with no parent canopy                                                                    |
| `/embed/dms/:roomId`                    | One direct message                                                                             |
| `/embed/elsewhere?to=<path>`            | "That part of Blackout isn't shown in the chat panel", with an "Open in Blackout" button       |

-   **Shown:** joined canopies (Matrix spaces), joined `text` and
    `announcement` dens, joined DMs (`m.direct`). One rule decides this,
    `classifyEmbedRoom` in `embedScope.ts`, and it is applied both to the lists
    and again on each room page, since a panel URL can name any room id.
-   **Not shown:** Town Square, Coliseum, Market, feeds, Explore, settings and
    every other app surface (the panel has no route for them); voice, stage
    and forum dens (listed on the canopy page under "Open in Blackout" with
    their unread counts); rooms of any custom room type; invites; DM creation;
    calls, the threads panel, member lists and room settings. Text only, per
    precondition P4.
-   **Unread indicators are on by default** (operator, 2026-10-06), with no
    switch to turn them off in the panel. They read the same live unread map
    as the full app's room list, so a canopy's count includes activity in its
    voice and forum dens. They are counts this session already syncs from the
    homeserver; nothing is sent to the host page.
-   **Links never navigate the panel's frame.** A link to another den or DM
    stays in the panel; a link to any other Blackout page opens a normal
    Blackout tab; a link to another site opens a new tab. New tabs open with
    `noopener,noreferrer` (checked in a real browser: no `window.opener`, empty
    `document.referrer`). A navigation started by code rather than a click
    lands on `/embed/elsewhere`, so the frame's URL stays under `/embed`.
-   **External links are not checked.** Black Mask's phishing check (B6) is not
    built, and the panel does not claim any link protection. An external link
    opened from the panel is exactly as safe as the same link opened from
    Blackout.
-   **Signed out:** the app's existing sign-in renders inside the panel, with
    two differences: the tabs do not rewrite the URL to `/login`, and single
    sign-on is not offered (it redirects the whole frame to the identity
    provider). The panel says so and offers to open Blackout in a tab instead.
    Today's Blackout homeserver offers password sign-in only, so this changes
    nothing for it. With B3's client switch on (off by default), the panel also
    asks how long the sign-in lasts and keeps its own session, separate from
    the full app's (section 3).
-   **How it mounts:** `main.tsx` decides "panel or full app" once, from the
    path the page loaded on, and renders `EmbedApp` instead of the full app's
    bootstrap: no AppShell, no main router, none of the app's hydrators. It is
    imported statically on purpose: as a lazy chunk it made Rolldown split
    `MessageComposer`/`RoomTimeline` into a chunk that imports the main chunk
    back, and that production build crashed on boot for every page (caught by
    loading the build in a browser; the chunk set is now identical to
    `develop`'s, at +23 KB raw / +5 KB gzipped on the main bundle).
-   **No feature-registry row.** `pnpm guard:feature-registry` checks
    `features/*/manifest.ts` modules and the registry JSON; the panel is a
    pre-router surface like the invite landing page, not a registry feature,
    so it has no manifest and needs no row. The guard passes.
-   **For the Black Mask side:** if the extension frames the panel with an
    iframe `sandbox`, it needs `allow-scripts allow-same-origin allow-forms
allow-popups allow-popups-to-escape-sandbox` for the panel to run and its
    "Open in Blackout" tabs to open, and should not grant
    `allow-top-navigation`. Not yet tried in a real extension.

Verified: unit tests for the scoping rule, the link rule and the routes (with
the timeline and composer stubbed), deliberately broken once each to confirm
they fail; and a real Chromium loading the production build through the
nginx image, signed out. **Not verified:** the signed-in panel against a real
homeserver (none was reachable from the build sandbox). The timeline and
composer are the same components the full app uses.

**Defaults for canopies and dens made from the panel (operator, 2026-10-17;
built 2026-10-18).** The panel has no control to create a canopy or a den yet.
The forms it will reuse from the full app (`CreateSpaceForm`,
`CreateRoomForm`, the playbook reveal and `createDenInCanopy`) already ask one
table, `apps/blackout-client/src/app/components/create-room/newRoomDefaults.ts`,
which knows the surface the page booted as (a `/embed` path, decided once at
load like `main.tsx`'s "panel or full app"):

| New…                       | Blackout app                                                             | Black Mask panel                                                                      |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| canopy                     | Public; listed in the Blackout canopy directory                          | Private (invite-only); not listed; "List in the Blackout directory" toggle shown, off |
| den with no canopy         | Public; not end-to-end encrypted                                         | Private; encrypted                                                                    |
| den in a public canopy     | Public; not encrypted                                                    | Restricted to the canopy (Private if the room version cannot); encrypted              |
| den in a non-public canopy | Restricted to the canopy (Private if the room version cannot); encrypted | same                                                                                  |
| category (sub-space)       | follows the canopy's kind; the client asks for no encryption             | same                                                                                  |

The access chooser stays at the top of both forms on both surfaces, and its
copy says what each choice means (a Public den is not end-to-end encrypted; a
Private or Restricted den is, by default). A public canopy is listed in the
directory without asking; any other canopy only when the toggle is on (the
toggle also says that voice rooms and app installs need the listing).
Building the client with `VITE_BLACKOUT_NEW_ROOM_DEFAULT=private`
(`apps/blackout-client/.env.example`) makes the app use the panel column; the
panel column never changes. Paths with their own explicit choice keep it: Form
a party (restricted, encrypted), streaming kits (per kit), the Discord import's
canopy (private) and DMs. Nothing enforces any of this on a server: the
homeserver accepts the join rule it is sent and the API accepts a listing from
any admin of the canopy (`KNOWN_LIMITATIONS.md`, "New canopy and den defaults").
The panel's "Not shown" list above still holds; a New control and the routes
behind it are a separate step.

### 2. Framing policy

**Status 2026-10-09: built for the web client's nginx image; off by default**
(B2). Nothing has been set in any deployed environment. **2026-10-11:** the
`infra/nginx` and single-server-baseline proxies now pass the panel's policy
through instead of blocking it (see "Behind the front proxies" below). Nothing
is deployed there either.

**What actually serves the web client's HTML.** The anchor this step started
from, `packages/api/src/middleware/security-headers.ts`, is the Hono API's
middleware. It sets `frame-ancestors 'none'`, `frame-src 'none'` and
`X-Frame-Options: DENY` on API responses only. The API never serves the web
client, so it is unchanged and keeps `'none'` everywhere.

| Deployment                                                                                                                     | Serves the client HTML                                                                                                                                               | Framing headers before this change                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.theblackout.app` (live)                                                                                                  | Appears to be the `apps/blackout-client/Dockerfile` image (`docker-nginx.conf`) behind Cloudflare: `/healthz` answers `ok`, `/health/ready` falls through to the SPA | **None at all.** `curl -I https://chat.theblackout.app/` on 2026-10-09 returned no `X-Frame-Options` and no CSP, so any site could frame the full client. This change makes that image send `DENY` / `frame-ancestors 'none'` on every route                                                                                                                                    |
| `infra/single-server-baseline` (compose on one host)                                                                           | `reverse-proxy` nginx → `frontend` container built from `apps/blackout-client/Dockerfile`                                                                            | `snippets/security-headers.conf` at server level: `X-Frame-Options: DENY`, CSP with `frame-ancestors 'none'`                                                                                                                                                                                                                                                                    |
| `infra/nginx` (host nginx)                                                                                                     | Proxies `/` to `127.0.0.1:8080`                                                                                                                                      | Same snippet, same values                                                                                                                                                                                                                                                                                                                                                       |
| `deploy/docker/Dockerfile` and `Dockerfile.blackout` (`ghcr.io/blackmarket-coa/blackout-web`)                                  | nginx with `deploy/docker/nginx-templates/default.conf.template`                                                                                                     | Server level `SAMEORIGIN` / `frame-ancestors 'self'`, but `location = /`, `= /index.html`, `/home`, `/sites`, `/config`, `/i18n` and `= /version` set their own `add_header`, which drops both (nginx inheritance); every path that falls back to `index.html`, `/embed` included, ends in `= /index.html`. Not changed here; see `docs/security/framing-headers-2026-10-09.md` |
| `deploy/docker/blackout-backend` nginx                                                                                         | Proxies `/` to `blackout-app:80`                                                                                                                                     | HSTS only at its own level; whatever the upstream sends                                                                                                                                                                                                                                                                                                                         |
| Railway (`railway.json`, root `index.js`), Vercel (default of `deploy-web.yml`), Netlify (`apps/blackout-client/netlify.toml`) | Node static server / static hosts                                                                                                                                    | None. `deploy-web.yml` has never run (0 runs; it triggers on `main`, which does not exist)                                                                                                                                                                                                                                                                                      |
| `.github/cfp_headers`                                                                                                          | Nothing uses it                                                                                                                                                      | Upstream leftover (`SAMEORIGIN` / `'self'`)                                                                                                                                                                                                                                                                                                                                     |
| Desktop (Tauri), mobile (Capacitor)                                                                                            | The built client bundled into the app (`tauri://`, `https://localhost`)                                                                                              | Not served over the network; framing headers do not apply                                                                                                                                                                                                                                                                                                                       |

**What changed** (only the `apps/blackout-client/Dockerfile` image):

-   `docker-nginx.conf` includes `nginx/frame-deny.conf` (`X-Frame-Options:
DENY`, `Content-Security-Policy: frame-ancestors 'none'`) at server level,
    and again in `/healthz`, the one location with its own `add_header`.
-   `location = /embed` and `location ^~ /embed/` are the only locations that
    include `nginx/embed-frame.conf`. The image ships that file denying framing
    too. At container start,
    `nginx/docker-entrypoint.d/40-black-mask-frame-ancestors.sh` rewrites it
    from **`BLACK_MASK_FRAME_ANCESTORS`**.
-   Those two locations answer `404` with the deny headers when the raw request
    URI does not literally start with `/embed` (`/%65mbed/`, `//embed/`), which
    nginx would otherwise normalise into them. The browser's
    `location.pathname` is the raw path, so without this the panel's framing
    policy could be served to a page the client does not treat as the panel.
-   The header is CSP `frame-ancestors` only; it does not restrict what the
    page loads. COOP/CORP are not sent by this image, before or after.

**`BLACK_MASK_FRAME_ANCESTORS`**, set on the web client container:

-   Origins separated by spaces and/or commas. Empty or unset (the default):
    the panel gets `frame-ancestors 'none'` like every other route.
-   Each entry must be exactly one of: `https://<hostname>[:port]` (dotted
    letters/digits/hyphens), `http://localhost[:port]` or
    `http://127.0.0.1[:port]` (local testing), `chrome-extension://<32 letters
a–p>`, `moz-extension://<uuid>`, `safari-web-extension://<uuid>`. Scheme and
    host are lower-cased; duplicates are dropped.
-   Rejected: `*` or any wildcard, any path (even a trailing `/`), query,
    fragment or user-info, keywords such as `'self'`, plain-`http` hosts other
    than loopback, IP addresses over `https`, a port outside 1–65535, non-ASCII
    hosts (use punycode), quotes, `;`, `$` or anything else that is not part of
    an origin.
-   **One bad entry rejects the whole list** and the panel stays `'none'`; the
    container log names the rejected entries. The script always exits 0, so a
    typo cannot stop the chat app from serving.
-   With a valid list, `/embed` and `/embed/*` send
    `Content-Security-Policy: frame-ancestors <list>` and **no**
    `X-Frame-Options`: it cannot express an allow-list (`ALLOW-FROM` is
    obsolete and ignored), and `DENY` next to an allow-list would contradict it
    in any browser that still reads it. Browsers that support
    `frame-ancestors` ignore `X-Frame-Options` when both are present.

**Verified** against `nginx:1.29.5-alpine` (the image's base, pulled from a
registry mirror) running the repository's config with a real `pnpm build` of
the client. The one deviation: this sandbox has no IPv6, so the verification
copy dropped `listen [::]:8080;`. `nginx -t` passed with the variable unset,
valid and invalid. `curl -I` on `/`, `/index.html`, `/home/`, `/coliseum`,
`/market`, `/config.json`, `/manifest.json`, `/sw.js`, `/trust`, `/assets/…`,
`/public/…`, `/healthz`, `/embedded` and `/embed-x` returned `DENY` /
`frame-ancestors 'none'` in every mode. `/embed`, `/embed/`, `/embed?x=1` and
`/embed/dms/…` returned the allow-list only when it was valid. In a real
Chromium, a page on an allow-listed origin rendered the panel in an iframe and
was refused `/`; a page on any other origin was refused both.

**Behind the front proxies (2026-10-11).** In the server block for
`theblackout.app` and `chat.theblackout.app` (the web client's host),
`infra/nginx` and `infra/single-server-baseline/nginx` add
`X-Frame-Options: DENY` and a CSP ending in `frame-ancestors 'none'` to every
response (`snippets/security-headers.conf`). Browsers enforce every CSP a
response carries, so until this change the panel could not be framed behind
either proxy, whatever the container allowed. Each proxy now has the client
image's two panel locations, `location = /embed` and `location ^~ /embed/`,
proxied exactly as `location /`. On those two, and nowhere else, the proxy
leaves out its own `X-Frame-Options` and the `frame-ancestors` directive of
its own CSP when all three of these hold:

1. the raw request URI is the panel's, by the client image's own test
   (`/embed`, `/embed?…`, `/embed/…`; not `/%65mbed/`, `//embed/`, `/EMBED/`
   or `/embedded`);
2. the container's `Content-Security-Policy`, as nginx reads it, is exactly
   one `frame-ancestors` list in the form the start-up script writes: `'none'`
   alone, or lower-case `scheme://host[:port]` origins. A `'self'`, a
   wildcard, a path, upper case or another directive does not count, and on
   nginx 1.23 or later neither does a second CSP header (older nginx reads
   only the first);
3. nginx read the container's whole response header block. When that block
   is cut off, carries an invalid line, is too large or does not finish within
   the proxy's read timeout, nginx answers 502 or 504 itself, and that answer
   keeps the proxy's usual headers.

The proxy then repeats the container's list in a `Content-Security-Policy`
header of its own. In every other case (the container sends no CSP or one
without `frame-ancestors`, is down, does not answer in time or sends an
incomplete header block, or the client image predates the panel) the two
locations send exactly the proxy's usual headers. The proxy's other headers on
the panel, including the rest of its CSP, are unchanged, so a framed panel
runs under the same CSP as the full app behind that proxy.

Two cases relax although the container's own CSP header does not carry the
list to the browser, and both stay limited to the container's list:

-   nginx's variable for that header also matches a header spelled
    `Content_Security_Policy`, which browsers ignore. A container that sent its
    list only under that spelling would still make the proxy relax. The
    proxy's repeated header is then the only framing policy the browser
    applies, so exactly the listed origins could frame the panel and no
    others. nginx cannot tell the two spellings apart, so the only alternative
    would be not to relax at all. The client image never sends that spelling
    (its unit test pins the header lines it writes).
-   After a complete header block that carries the list, a response nginx
    makes itself because of that block (its 404 for an `X-Accel-Redirect` it
    refuses, its 500 when one loops) also goes out under the list. The client
    image sends no `X-Accel-Redirect`.

`tools/ci/check-embed-proxy-framing.mjs` (the Hardening guards job) compares
the six maps and the two panel locations with their pinned form, checks both
CSP strings against `security-headers.conf`, and fails if a
`black_mask_panel_` name appears anywhere else in either proxy's files (in any
case) or if those files include a file it does not know. It does not run
nginx, and it cannot see files a host adds outside the repository or anything
in front of the proxy. Design notes and version behaviour:
[framing-headers-2026-10-09.md](security/framing-headers-2026-10-09.md),
"Follow-up 2026-10-11".

What that means in practice:

-   Deploying the proxy change makes nothing frameable on its own. With
    `BLACK_MASK_FRAME_ANCESTORS` unset or invalid, the container sends
    `X-Frame-Options: DENY` and `frame-ancestors 'none'` on the panel. That
    `'none'` passes the proxy's test, so the proxy swaps its own two framing
    headers for a repeat of `'none'`: through the proxy `/embed` carries one
    `X-Frame-Options: DENY` (the container's) and three CSP headers (the
    container's `'none'`, the proxy's CSP without `frame-ancestors`, and the
    proxy's repeat of `'none'`). Nothing can frame it, but these are not the
    same headers as before this change.
-   With a valid list on the container, `/embed` and `/embed/*` can be framed
    through the proxy by exactly those origins. Every other path keeps `DENY`
    and `frame-ancestors 'none'`.
-   Rolling the client image back to one without the framing policy leaves
    every path unframeable behind the proxy: that image sends no CSP, so the
    proxy keeps its own headers.

Checked with local nginx 1.24.0, and with the proxy on `nginx:1.27-alpine`
(1.27.5, the single-server image) and on `nginx:1.22.1-alpine` in front of
the client config on `nginx:1.29.5-alpine` (the client image's base): the
real client-image config with its start-up script run (variable unset, a
valid list, an invalid list), the client config from before the panel, and
stub upstreams, including ones whose header block is cut off, invalid or too
large after the list. GET and HEAD on `/`, `/embed`, `/embed/`, `/embed/x/y`,
`/embed?x=1`, `/embedded`, `/embed.js`, `/%65mbed/`, `//embed/`, `/EMBED/`,
`/embed/../`, `/embed/%2e%2e/`, `/embed%2F`, `/embed/%2e%2e/embed/`,
`/v1/health`, `/i/x` and `/c/x` on the apex host and four of them on the chat
host; the follow-up lists the rest. In a real Chromium (145, HTTP/2 through
the proxy), a page on an allow-listed origin rendered `/embed` and was refused
`/`, a page on another origin was refused both, and with the variable unset,
the older client config or a cut-off header block nothing rendered. **Not
checked:** a deployed proxy, anything in front of it (the live host sits
behind Cloudflare), and the panel inside a real Black Mask extension.

**Constraints, stated plainly:**

-   **Firefox:** a `moz-extension://` origin is a random UUID generated per
    installation, so a fixed server-side list cannot name "the Black Mask
    extension" for Firefox users. It can name one install (useful for
    testing), and the script warns when it does. Firefox users will need
    another approach: a hosted `https://` page of Black Mask's that frames the
    panel, or opening the panel as a top-level tab.
-   **Chromium browsers:** the `chrome-extension://` id comes from the
    extension's key. The Chrome Web Store and Edge Add-ons listings get
    different ids unless the extension pins the same `key`, so list each one.
-   **Safari:** whether `safari-web-extension://` ids are stable across
    installs has not been checked.
-   **Desktop and mobile apps:** if Black Mask loads the panel as a top-level
    page in a native webview, `frame-ancestors` does not apply and nothing
    needs listing. If it frames the panel inside its own web UI, that UI's
    origin must be listed, and an opaque origin (`file://`, `null`) cannot be.
-   **Reverse proxies in front:** `infra/nginx` and
    `infra/single-server-baseline/nginx` pass the panel's policy through since
    2026-10-11 (above); the site config must be deployed for that, and until it
    is, those proxies still block the panel. Any other proxy or CDN in front of
    the client image must pass `Content-Security-Policy` through unchanged and
    must not add its own `frame-ancestors` or `X-Frame-Options` on `/embed`.
    The live host sits behind Cloudflare, and what Cloudflare does with these
    headers there has not been checked.
-   **Other images and hosts:** the `blackout-web` image, Railway, Vercel,
    Netlify and Cloudflare Pages (`.github/cfp_headers`, which nothing deploys
    today) do not implement the allow-list. On the `blackout-web` image,
    `/embed` goes through `location /` to `location = /index.html`, whose own
    `add_header` drops the server-level `SAMEORIGIN` and `'self'`, so the
    panel there carries no framing header at all and any site can frame it,
    as it can `/` and `/index.html` (checked 2026-10-11 with that template on
    nginx 1.24.0: `/embed`, `/embed/`, `/embed?x=1` and `/embed/dms/x` sent
    only `Cache-Control`; F2 in the
    [framing triage](security/framing-headers-2026-10-09.md)). Railway, Vercel
    and Netlify send no framing headers either (as for the whole client there
    today), and `cfp_headers` would send `SAMEORIGIN` and `'self'`. Behind the
    front proxies, the `blackout-web` image's `/embed` would be unframeable:
    it sends no CSP there, so the proxy keeps its own headers.
-   **Storage partitioning:** whether a browser partitions an
    extension-embedded frame's storage is still not verified. With B3's
    client switch off (the default) it decides, as before B3, whether the
    panel shares the browser's Blackout session or signs in separately; if it
    shares, the panel and an open Blackout tab run two clients on one
    session, and the client has no cross-tab lock. With
    the switch on it no longer matters to the session: the panel keeps its
    own session, API token and stores either way, so it never shares the full
    app's session (section 3). It then signs in as a separate device, and
    older encrypted messages may not be readable there (see BO-1).

**Turning it on** (operator, after the panel is deployed): set
`BLACK_MASK_FRAME_ANCESTORS` on the web client container to Black Mask's
origins and recreate the container. The variable is read when the container
is created, so `docker restart` and `docker compose restart` keep the old
value. In the single-server stack the variable goes on the `frontend`
service, for example in the `environment:` of the host's
`docker-compose.override.yml`, followed by `docker compose up -d frontend` (or
`docker compose up -d --force-recreate frontend`, as `deploy.sh` does). Then
check `curl -sI https://<host>/embed` (expect `frame-ancestors <your list>` and
no `X-Frame-Options`) and `curl -sI https://<host>/` (expect `DENY` and
`frame-ancestors 'none'`). Behind `infra/nginx` or the single-server proxy,
deploy this repository's site config first (no new snippet; run `nginx -t`
before reloading). Through the proxy, `/embed` then shows no
`X-Frame-Options`, the proxy's CSP without `frame-ancestors`, and
`frame-ancestors <your list>` twice (the container's header and the proxy's
copy). `/` still shows `DENY` and `frame-ancestors 'none'`.

**Rollback:** remove the variable and recreate the container the same way
(`docker compose up -d frontend`); a restart keeps the list. Then run
`curl -sI https://<host>/embed`: it must show `X-Frame-Options: DENY` and
`frame-ancestors 'none'`. If it still shows your list, the container was not
recreated. The proxies need no change: they pass the container's `'none'` and
its `DENY` through. The panel route itself stays reachable as a normal page,
which is harmless.

### 3. Sign-in inside the sandbox

**Status 2026-10-11: built, not deployed; off by default** (B3). Nothing has
been set in any deployed environment. Three switches, all off by default:
the homeserver module's `session_lengths_enabled`, the API's
`BLACKOUT_SESSION_LENGTHS`, and the web client's build-time
`VITE_BLACKOUT_PANEL_SESSION_LENGTHS`.

Blackout login happens inside the panel. The user picks the session length (a
timeframe or indefinitely; nothing preselected). The chosen TTL is enforced
server-side on the session, not only remembered by the client.

**What "the session" is.** A panel sign-in holds these credentials:

| Credential                      | Minted by                                                                                              | Lifetime before B3                                                                                                                                                                                                                                                                                                                                                     | Renewed by                                                                     | Checked by                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matrix access token             | Synapse `POST /_matrix/client/v3/login` (password and account-number sign-in) or `/register` (sign-up) | Sign-in: 5 minutes. The client asks for a refresh token, and this fork's Synapse defaults `refreshable_access_token_lifetime` to `5m` (`synapse/config/registration.py`); nothing in this repository changes it. Sign-up: no expiry. The client's `/register` request does not ask for a refresh token, and `nonrefreshable_access_token_lifetime` is unset by default | Sign-in: `POST /_matrix/client/v3/refresh`. Sign-up: never                     | Synapse, on every request (`valid_until_ms` in `synapse/api/auth/internal.py`)                                                                        |
| Matrix refresh token            | The same sign-in (not sign-up), because the client asks and `refreshable_access_token_lifetime` is set | No expiry: `refresh_token_lifetime` and `session_lifetime` are unset by default. Each refresh issues a new one                                                                                                                                                                                                                                                         | `POST /_matrix/client/v3/refresh`                                              | Synapse `AuthHandler.refresh_token` (`expiry_ts`, `ultimate_session_expiry_ts`)                                                                       |
| Blackout API access token (JWT) | API `POST /v1/auth/matrix/exchange`, given the Matrix token (checked with Synapse `whoami`)            | 24 hours                                                                                                                                                                                                                                                                                                                                                               | The client exchanges its Matrix token again when the JWT expires or gets a 401 | API `authMiddleware` → `verifyJwt` (signature, `exp`), the jti denylist and the per-user revocation cutoff                                            |
| Blackout API refresh token      | The same exchange response                                                                             | 30 days, reset to 30 days on every rotation                                                                                                                                                                                                                                                                                                                            | `POST /v1/auth/token/refresh`                                                  | API `rotateRefreshToken`                                                                                                                              |
| Matrix OpenID token             | Synapse `POST /_matrix/client/v3/user/{userId}/openid/request_token`, given a valid access token       | 1 hour (`synapse/rest/client/openid.py`). Stored against the user ID only (`open_id_tokens`), not the device                                                                                                                                                                                                                                                           | Ask for another                                                                | Synapse's federation `GET /_matrix/federation/v1/openid/userinfo`. lk-jwt-service, which both in-repo deployments run, trades one for a LiveKit token |

The client keeps the first three in localStorage. It discards the API refresh
token, but the exchange returns it, so a modified client could keep and use it.
No code in this client asks for a Matrix OpenID token (there is no call to the
OpenID endpoint in `apps/blackout-client/src`); a modified client, or someone
holding a copied access token, can. The service worker gets no token from this
sign-in (it reads legacy keys that this sign-in never writes). LiveKit voice
tokens are not part of a panel session: the panel is text only and never asks
for one.

**How each is bounded now** (all three switches on, timed length):

-   **Matrix access token:** the homeserver caps `valid_until_ms` on every
    token of the panel's device at the session end, including one minted to
    last longer. Synapse refuses the token after that (401 `M_UNKNOWN_TOKEN`,
    `soft_logout: true`), except on the few endpoints that accept an expired
    token (see "Not enforced" below).
-   **Matrix refresh token** (sign-in issues one by default): `expiry_ts` and
    `ultimate_session_expiry_ts` are capped at the end, so `/refresh` refuses
    after it (403) and every access token it mints before then still expires
    at the end. Upstream Synapse already enforces both columns; the module
    only sets them per device.
-   **The device:** a sweep on the main Synapse process deletes the device at
    the end (every 60 seconds by default). That is Synapse's normal sign-out of
    a device: its access and refresh tokens, its end-to-end encryption keys
    and its pushers go. Until the sweep runs, the caps above refuse the
    device's tokens everywhere except on those few endpoints.
-   **Blackout API access token:** `exp` is capped at the session end, and the
    token carries the end as `sxp`, which verification refuses from that
    second on.
-   **Blackout API refresh token:** the refresh-token family carries the end
    (`session_expires_at`, API migration 100); each token's own expiry is
    capped at it, and a refresh at or after it is refused (401
    `session_expired`) and revokes the family.
-   **A fresh exchange after the end:** refused. The homeserver refuses the
    Matrix token, and the API refuses (401 `matrix_session_expired`) if the
    homeserver reports the session over.
-   **Matrix OpenID token:** not bounded. See "Not enforced" below.

**"Until I sign out"** adds no expiry: the session lasts until the device
signs out or the homeserver's own token settings end it. With the client
switch on, the panel has a Sign out button: it asks the API to refuse the
panel's API token at once (`POST /v1/auth/sign-out`), then signs the device
out on the homeserver and deletes its stores in the browser. If an API
exchange is still running when the panel's session ends (Sign out, the end,
or the homeserver dropping it), its result is not kept: the panel asks the API
to refuse that token and its refresh token instead.

**How the length gets onto the session.** The panel signs in with the
ordinary `/login` or `/register`, so rate limits and flows are unchanged.
Before it stores or uses the new tokens it calls
`POST /_synapse/client/blackout/session/length` with the new access token and
`{"session_length": "1h" | "1d" | "7d" | "30d" | "until_sign_out"}`
(`apps/blackout-server/blackout_runtime/session_length.py`). The homeserver
accepts exactly that body (another value, type, case or field: 400), records
the length once (a device's length can never be replaced, extended or
cleared: 409), and caps the device's tokens in the same database transaction.
If the call fails, the panel signs the new device out again and keeps nothing.
The panel never keeps or starts a session without a chosen length: a sign-in
that reaches the client with none is signed out again, and a stored panel
session with no length, or a timed one with no end, is ended instead of
started. While signed in, the panel shows when the session ends and a Sign out
button.

The API never takes a length from the client. With `BLACKOUT_SESSION_LENGTHS`
on, the exchange asks the homeserver when that Matrix session ends
(`GET /_synapse/client/blackout/session/length`, with the user's own token)
and refuses with 503 if it cannot find out. A homeserver without the feature
(404) has no session with a length, so the exchange issues what it always did.
If the API's store cannot keep a session's end (the Postgres store without
migration 100's column), `GET /v1/auth/session-lengths` answers 503
`{"enforced": false, "code": "session_end_storage_missing"}` and the exchange
refuses a timed session (503); a session with no end is issued as before.

**When it is offered.** Only with the client switch on: with it off the panel
shows no choice and looks nothing up. Timed lengths are offered only when both
the homeserver (`GET /_synapse/client/blackout/session/lengths`) and the API
(`GET /v1/auth/session-lengths`) answer. Otherwise only "Until I sign out" can
be chosen, and the panel says the server can't end panel sessions on a timer
yet. Nothing is preselected, and Sign in / Create account stay disabled until
a choice is made. The full app's sign-in is unchanged either way.

**Panel and full app keep separate sessions** (client switch on only). The
panel keeps its session, its API token and its IndexedDB stores under its own
names (`apps/blackout-client/src/client/storageNamespace.ts`), whether or not
the browser partitions an extension-framed panel's storage. It never runs on
the full app's session (which has no chosen length), never overwrites it, and
neither side's pruning of stale stores deletes the other's encryption keys.
The panel's Rust crypto store is per device. The cost: someone already signed
in to Blackout in a tab signs in again in the panel, as a separate device.
With the switch off the panel uses the full app's names, as before B3.

**Turning it on** (operator; nothing has been set anywhere):

1. Load the module with the flag in the homeserver config:

    ```yaml
    modules:
        - module: blackout_runtime.module.BlackoutRuntimeModule
          config:
              persistence_path: /data/blackout_runtime.sqlite3
              session_lengths_enabled: true
              # session_length_sweep_interval_s: 60 # clamped to 5–3600
    ```

    No in-repo homeserver template loads `blackout_runtime` today (only
    `apps/blackout-server/docs/homeserver.blackbox.yaml` does), and no in-repo
    Synapse image contains it: the fork's image
    (`apps/blackout-server/docker/Dockerfile`, which
    `infra/single-server-baseline` runs) installs only the `synapse` package,
    and `deploy/docker/blackout-backend` runs upstream Synapse. The homeserver
    needs `blackout_runtime` on its Python path first. Loading it also
    turns on the module's other behaviour — governance and reputation
    endpoints and its room and event rules — which needs its own review.

2. Set `BLACKOUT_SESSION_LENGTHS=1` on the API and run its migrations
   (100 adds `refresh_tokens.session_expires_at`). The API applies pending
   migrations when it starts unless `BLACKOUT_DB_MIGRATE_ON_START=0`. Without
   100 the Postgres store cannot keep a session's end, so the API reports the
   lengths as not enforced and refuses timed sessions (above).
3. Build the web client with `VITE_BLACKOUT_PANEL_SESSION_LENGTHS=1` (see
   `apps/blackout-client/.env.example`) and deploy that build. It is read at
   build time; no build in this repository sets it.
4. Check that `curl https://<homeserver>/_synapse/client/blackout/session/lengths`
   and `curl https://<chat-host>/v1/auth/session-lengths` both answer 200 (a
   503 from the second names what is missing).

**Rollback by switch.** Unset any of the three. Turning the client switch
off sends the panel back to the full app's session and names, as before B3.
The panel then no longer reads its own names, so it neither uses nor signs
out a session stored under them, and it has no Sign out button. That
session's tokens and stores stay in the browser until cleared (the panic
wipe's prefixes cover its localStorage keys, not its IndexedDB stores), and
clearing them does not sign the device out on the homeserver. The servers
still end a timed session on time. An "Until I sign out" session has no end
on either server, and the homeserver's default token settings never end it
(no in-repo config sets `session_lifetime` or `refresh_token_lifetime`), so
its device stays signed in until it is removed from the account's device
list (Settings, Devices, in the full app). A session already given an end
keeps it: the token caps sit in Synapse's tables, and the API enforces the
ends already stored on its tokens whatever its flag says. What it loses:
with the module flag off the sweep stops, so the devices of ended sessions
stay in the account's device list until removed, and their tokens are still
accepted by the few endpoints that take an expired token (below); and with
either server flag off the API no longer learns the end (with the module
flag off the homeserver answers 404, which the API reads as a session with
no end), so a panel that exchanges its Matrix token again before the end
gets an ordinary 24-hour API token, which can outlive the end by up to a
day, and an ordinary 30-day refresh token with no end, which only a
modified client keeps. The panel still signs itself out on that device at
the end, but a copy of that API token taken before then stays valid until
it expires.

**Rollback by reverting the code** (redeploying a build without B3) loses
more:

-   **API:** develop's code ignores `session_expires_at`. A timed refresh-token
    family refreshed before its end gets a successor with no end (30 days, reset
    on every rotation), and the refresh route mints 24-hour JWTs with no `sxp`.
    JWTs already issued keep their capped `exp`. Only a modified client holds
    an API refresh token (the panel discards it). Revert migration 100 first,
    while this code is still deployed; it drops the column and the stored ends
    with it:

    ```sh
    DATABASE_URL=... pnpm --filter @blackout/api migrate:down -- --target 99
    ```

    Develop has no file for 100, and its boot-time checksum audit treats an
    applied migration with no file as drift, which stops a production boot
    unless `BLACKOUT_DB_VERIFY_CHECKSUMS=0`. Checked against PostgreSQL 16:
    with 100 applied and its file gone the audit reports it missing; after the
    down it passes.

-   **Homeserver:** the bind and lengths endpoints go (404) and the sweep stops.
    Synapse keeps enforcing the caps already written to its own tables. Ended
    devices stay in device lists until removed, with the same expired-token
    endpoints still open to their tokens. The `blackout_session_lengths` table
    stays in the main database until dropped by hand.
-   **Client:** the same as turning the client switch off.

**Not enforced, stated plainly:**

-   **Under MAS** (`experimental_features.msc3861`), access tokens live in MAS,
    not in Synapse's tables. The module does not switch itself on there, so
    only "Until I sign out" is offered.
-   **A Matrix OpenID token outlives the session.** While the panel's access
    token is valid, a modified client (or someone holding a copy of the token)
    can ask for one. It lasts an hour and belongs to the user, not the device,
    so neither the end of the session nor the sweep revokes it: one minted just
    before the end works for up to an hour after it. lk-jwt-service, which both
    in-repo deployments run as the MatrixRTC bridge, trades such a token for a
    LiveKit token. The panel itself never asks for one.
-   **Between the end and the sweep** (normally up to the sweep interval: 60
    seconds by default, up to an hour if configured; longer when more than 500
    sessions end within one interval, since each sweep handles 500; without
    limit if the module is turned off or the device cannot be deleted) the
    device still exists.
    Synapse refuses its tokens except on the endpoints that accept an expired
    token: `POST /logout` (signs that device out), `POST /logout/all` (signs
    every device of the account out and deletes their end-to-end encryption
    keys) and `POST /account_validity/send_mail` (403 unless the server renews
    accounts by email). A new token for the same device, obtained by signing in
    again with its device ID (which needs the password), is not capped until
    the sweep deletes the device.
-   **What the session did while it was valid is not undone:** messages sent,
    rooms joined, and anything it created through the API that is meant to
    outlive a session (widget-alert tokens, outbound webhooks, OBS passwords
    and similar), or a LiveKit voice token of up to 15 minutes, or an OpenID
    token (above), that a modified client asked for.
-   **What stays in the browser:** at the end the panel deletes the device's
    sync cache and encryption stores (and, if the device still exists, signs
    it out on the server) — at once if it is open, otherwise the next time it
    opens. If it is never opened again in that browser, those stores stay on
    disk (the session itself is over on the servers). Drafts and settings the
    composer keeps in localStorage are shared with the full app on the same
    origin and are not deleted.
-   **Clocks:** the panel's own sign-out timer uses the device clock, counted
    from just before the length was bound; the servers use theirs. A wrong
    device clock changes when the panel notices, not when the servers refuse.
-   **Sign out does not revoke an API refresh token that a modified client
    kept from the exchange.** The panel never stores that refresh token, so its
    Sign out cannot send it, and the API never hears about Matrix sign-outs.
    A kept refresh token keeps working after Sign out: for a timed session
    until the session end (up to 30 days), for "Until I sign out" for as long
    as it is used within 30 days of the last rotation. The full app's sign-out
    has the same gap. (The refresh token of an exchange that finishes after
    the panel's session ended is refused along with its JWT.)
-   **An API exchange made before the length is set is not bounded.** Until
    the bind, the homeserver reports no length for the new device, so the API
    issues its usual tokens to an exchange made before it: a 24-hour JWT and
    a 30-day refresh token, neither tied to the session's end. When both
    servers enforce lengths, the panel binds before it stores or uses any
    token, so only a modified client could do this.
-   **A device with no length:** if the panel is closed between sign-in and
    the bind, or the bind fails and signing the device out fails too, the new
    device keeps no length. The panel never stored its tokens, so nothing
    holds them, but the device shows in the account's device list until
    removed.
-   **No CI runs the homeserver tests.** This repository's CI runs no
    `apps/blackout-server` tests at all, so
    `blackout_runtime/session_length.py` and its tests
    (`tests/blackout_runtime/test_session_length.py`) are tested only when
    someone runs them by hand. A regression there, or an upstream change to the
    Synapse columns and calls it relies on (`apps/blackout-server/PATCHES.md`),
    would merge green.
-   **Not verified against a deployed homeserver.** What was run: the
    homeserver tests in-process (trial, on SQLite and on PostgreSQL 16), the
    API tests in-process (including a Postgres-backed store restart and the
    store without migration 100), the API process against PostgreSQL 16 with
    and without migration 100, and end-to-end runs of real processes in the
    build sandbox — this fork's Synapse (SQLite) with the module on, the API
    with the flag on and off, and the production client build, driven in
    Chromium: the choice, the bind, the capped API token, Sign out (the device
    and the panel's API token), an ended session found at load, the flag-off
    case, and the sweep deleting a device in the running homeserver (its end
    moved into the past in the database rather than waiting an hour). Those
    runs predate the client switch. After it was added, both production builds
    were loaded at `/embed` in Chromium with the homeserver stubbed: with the
    switch off the panel showed the old sign-in, started a session stored
    under the full app's key and made no session-length requests; with it on
    it ignored that session, showed the choice (only "Until I sign out", the
    stubbed servers answering 404) and asked both servers. Not run: a
    deployed homeserver behind the production proxies, a real extension
    frame, a running homeserver on PostgreSQL.

### 4. Optional account link

-   A **signed handshake**, like the existing FBM↔Blackout bridge (FBM's side is
    `backend/src/api/v1/integrations/blackout/link/route.ts`: service token or
    JWT, Blackout user id plus a target id), creates a **link record** on
    Blackout's side.
-   The user picks the link duration (a timeframe or indefinitely). **Expiry is
    enforced on the server.** The link is **revocable any time** from a
    **link-status screen** that shows what is linked, since when, and until when.
-   Blackout also **accepts a Black Mask registration** (creating the Blackout
    account from the handshake) or **links an existing account**, on request.
-   On unlink or expiry: end the chat session, sign that device out, and notify
    the vault side so it deletes any Blackout recovery key it stored. Never
    delete the Blackout account.

### 5. Capacity

Free chat users load Synapse, not the vault server. Watch the DL360's headroom
as the panel rolls out.

### 6. Phase 3 hooks (after the paid launch)

-   Dead drops delivered into a den: the `apps/deaddrop-appservice` exists; the
    dead-drop spec was not among the confirmed-live features at the last audit, so
    treat it as unverified until exercised.
-   Dead man's switch: Matrix check-in reminders; optional M-of-N approval through
    the governance engine. Blackout's encryption is not a dependency until BO-1 is
    fixed.
-   Matrix alerts: an encrypted channel for breach and phishing alerts instead of
    email.

## Legal checkpoint

**L31 — age-verification laws and COPPA.** Check whether they reach Blackout as
it grows; the "no ID needed" hook is a positioning claim that depends on the
answer. Needs counsel; surfaced, not resolved. Mirrored in the FBM repo's
`docs/legal/checkpoints.md`.

## Open decisions touching this repo

-   [x] Unread indicators or push notifications in the chat panel. **Add
        both, on by default** (2026-10-06). A push must never carry message
        text, and the panel must never call push private.
-   [x] Confirm the 3% fee on Blackout creator transactions (a revenue-model
        assumption, not a Blackout decision). **Confirmed** (2026-10-05).
-   [x] Dead drops or the dead man's switch first, and the audience each is built
        for (whistleblower-style versus inheritance-style continuity). **Dead
        drops first** (2026-10-05); the audience is still to be written down.
