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
    nothing for it. Since B3 the panel also asks how long the sign-in lasts
    and keeps its own session, separate from the full app's (section 3).
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

### 2. Framing policy

**Status 2026-10-09: built for the web client's nginx image; off by default**
(B2). Nothing has been set in any deployed environment.

**What actually serves the web client's HTML.** The anchor this step started
from, `packages/api/src/middleware/security-headers.ts`, is the Hono API's
middleware. It sets `frame-ancestors 'none'`, `frame-src 'none'` and
`X-Frame-Options: DENY` on API responses only. The API never serves the web
client, so it is unchanged and keeps `'none'` everywhere.

| Deployment                                                                                                                     | Serves the client HTML                                                                                                                                               | Framing headers before this change                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.theblackout.app` (live)                                                                                                  | Appears to be the `apps/blackout-client/Dockerfile` image (`docker-nginx.conf`) behind Cloudflare: `/healthz` answers `ok`, `/health/ready` falls through to the SPA | **None at all.** `curl -I https://chat.theblackout.app/` on 2026-10-09 returned no `X-Frame-Options` and no CSP, so any site could frame the full client. This change makes that image send `DENY` / `frame-ancestors 'none'` on every route                                            |
| `infra/single-server-baseline` (compose on one host)                                                                           | `reverse-proxy` nginx → `frontend` container built from `apps/blackout-client/Dockerfile`                                                                            | `snippets/security-headers.conf` at server level: `X-Frame-Options: DENY`, CSP with `frame-ancestors 'none'`                                                                                                                                                                            |
| `infra/nginx` (host nginx)                                                                                                     | Proxies `/` to `127.0.0.1:8080`                                                                                                                                      | Same snippet, same values                                                                                                                                                                                                                                                               |
| `deploy/docker/Dockerfile` and `Dockerfile.blackout` (`ghcr.io/blackmarket-coa/blackout-web`)                                  | nginx with `deploy/docker/nginx-templates/default.conf.template`                                                                                                     | Server level `SAMEORIGIN` / `frame-ancestors 'self'`, but `location = /`, `= /index.html`, `/home`, `/sites`, `/config`, `/i18n` and `= /version` set their own `add_header`, which drops both (nginx inheritance). Not changed here; see `docs/security/framing-headers-2026-10-09.md` |
| `deploy/docker/blackout-backend` nginx                                                                                         | Proxies `/` to `blackout-app:80`                                                                                                                                     | HSTS only at its own level; whatever the upstream sends                                                                                                                                                                                                                                 |
| Railway (`railway.json`, root `index.js`), Vercel (default of `deploy-web.yml`), Netlify (`apps/blackout-client/netlify.toml`) | Node static server / static hosts                                                                                                                                    | None. `deploy-web.yml` has never run (0 runs; it triggers on `main`, which does not exist)                                                                                                                                                                                              |
| `.github/cfp_headers`                                                                                                          | Nothing uses it                                                                                                                                                      | Upstream leftover (`SAMEORIGIN` / `'self'`)                                                                                                                                                                                                                                             |
| Desktop (Tauri), mobile (Capacitor)                                                                                            | The built client bundled into the app (`tauri://`, `https://localhost`)                                                                                              | Not served over the network; framing headers do not apply                                                                                                                                                                                                                               |

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
    `infra/single-server-baseline/nginx` add `X-Frame-Options: DENY` and a CSP
    with `frame-ancestors 'none'` to everything at server level. Browsers
    enforce every CSP they receive, so behind either proxy the panel stays
    unframeable even with the variable set. That fails closed, but turning the
    panel on there needs an `/embed` location in the proxy that re-includes the
    rest of its header set without those two. Not done here; it needs its own
    `nginx -t` and `curl -I` per location on that proxy.
-   **Other images:** the `blackout-web` image, Railway, Vercel and Netlify do
    not implement the allow-list. On those the panel is never framed by
    Black Mask: `'self'` or `DENY` on the `blackout-web` image, no protection
    at all on the static hosts (as for the whole client there today).
-   **Storage partitioning:** whether a browser partitions an
    extension-embedded frame's storage is still not verified, but since B3 it
    no longer matters to the session: the panel keeps its own session, API
    token and stores either way, so it never shares the full app's session
    (section 3). It signs in as a separate device, and older encrypted
    messages may not be readable there (see BO-1).

**Turning it on** (operator, after the panel is deployed): set
`BLACK_MASK_FRAME_ANCESTORS` on the web client container to Black Mask's
origins, restart it, then check `curl -I https://<host>/embed` (expect
`frame-ancestors <your list>` and no `X-Frame-Options`) and
`curl -I https://<host>/` (expect `DENY` and `frame-ancestors 'none'`).
**Rollback:** unset the variable and restart. The panel route itself stays
reachable as a normal page, which is harmless.

### 3. Sign-in inside the sandbox

**Status 2026-10-11: built, not deployed; off by default** (B3). Nothing has
been set in any deployed environment.

Blackout login happens inside the panel. The user picks the session length (a
timeframe or indefinitely; nothing preselected). The chosen TTL is enforced
server-side on the session, not only remembered by the client.

**What "the session" is.** A panel sign-in holds these credentials:

| Credential                      | Minted by                                                                                    | Lifetime before B3                                                                                                                                                                             | Renewed by                                                                     | Checked by                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Matrix access token             | Synapse `POST /_matrix/client/v3/login` (password and account-number sign-in) or `/register` | No expiry. The client asks for a refresh token, but no in-repo homeserver template sets `refreshable_access_token_lifetime`, so Synapse issues a token that never expires and no refresh token | —                                                                              | Synapse, on every request (`valid_until_ms` in `synapse/api/auth/internal.py`)                             |
| Matrix refresh token            | Same, only if the homeserver sets `refreshable_access_token_lifetime`                        | Whatever `refresh_token_lifetime` / `session_lifetime` say                                                                                                                                     | `POST /_matrix/client/v3/refresh`                                              | Synapse `AuthHandler.refresh_token` (`expiry_ts`, `ultimate_session_expiry_ts`)                            |
| Blackout API access token (JWT) | API `POST /v1/auth/matrix/exchange`, given the Matrix token (checked with Synapse `whoami`)  | 24 hours                                                                                                                                                                                       | The client exchanges its Matrix token again when the JWT expires or gets a 401 | API `authMiddleware` → `verifyJwt` (signature, `exp`), the jti denylist and the per-user revocation cutoff |
| Blackout API refresh token      | The same exchange response                                                                   | 30 days, reset to 30 days on every rotation                                                                                                                                                    | `POST /v1/auth/token/refresh`                                                  | API `rotateRefreshToken`                                                                                   |

The client keeps the first three in localStorage. It discards the API refresh
token, but the exchange returns it, so a modified client could keep and use it.
The service worker gets no token from this sign-in (it reads legacy keys that
this sign-in never writes). LiveKit voice tokens are not part of a panel
session: the panel is text only and never asks for one.

**How each is bounded now** (feature on, timed length):

-   **Matrix access token:** the homeserver caps `valid_until_ms` on every
    token of the panel's device at the session end. Synapse refuses the token
    after that (401 `M_UNKNOWN_TOKEN`, `soft_logout: true`) on every endpoint
    except logout.
-   **Matrix refresh token** (if the homeserver issues one): `expiry_ts` and
    `ultimate_session_expiry_ts` are capped at the end, so `/refresh` refuses
    after it (403) and every access token it mints before then still expires
    at the end. Upstream Synapse already enforces both columns; the module
    only sets them per device.
-   **The device:** a sweep on the main Synapse process deletes the device at
    the end (every 60 seconds by default). That is Synapse's normal sign-out of
    a device: its access and refresh tokens, its end-to-end encryption keys
    and its pushers go. Until the sweep runs, the caps above already refuse
    every request.
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

**"Until I sign out"** adds no expiry: the session lasts until the device
signs out or the homeserver's own token settings end it. The panel now has a
Sign out button: it asks the API to refuse the panel's API token at once
(`POST /v1/auth/sign-out`), then signs the device out on the homeserver and
deletes its stores in the browser.

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
While signed in, the panel shows when the session ends and a Sign out button.

The API never takes a length from the client. With `BLACKOUT_SESSION_LENGTHS`
on, the exchange asks the homeserver when that Matrix session ends
(`GET /_synapse/client/blackout/session/length`, with the user's own token)
and refuses with 503 if it cannot find out. A homeserver without the feature
(404) has no session with a length, so the exchange issues what it always did.

**When it is offered.** Timed lengths are offered only when both the
homeserver (`GET /_synapse/client/blackout/session/lengths`) and the API
(`GET /v1/auth/session-lengths`) answer. Otherwise only "Until I sign out" can
be chosen, and the panel says the server can't end panel sessions on a timer
yet. Nothing is preselected, and Sign in / Create account stay disabled until
a choice is made. The full app's sign-in is unchanged.

**Panel and full app keep separate sessions.** The panel keeps its session, its
API token and its IndexedDB stores under its own names
(`apps/blackout-client/src/client/storageNamespace.ts`), whether or not the
browser partitions an extension-framed panel's storage. It never runs on the
full app's session (which has no chosen length), never overwrites it, and
neither side's pruning of stale stores deletes the other's encryption keys.
The panel's Rust crypto store is per device. The cost: someone already signed
in to Blackout in a tab signs in again in the panel, as a separate device.

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
   migrations when it starts unless `BLACKOUT_DB_MIGRATE_ON_START=0`. Never
   turn the flag on without 100: the Postgres store silently skips a field
   that has no column, so a refresh-token family's end would be lost at the
   next API restart, and a refresh before the end would then mint a
   successor with no end.
3. Check that `curl https://<homeserver>/_synapse/client/blackout/session/lengths`
   and `curl https://<chat-host>/v1/auth/session-lengths` both answer 200.

**Rollback:** unset both. A session already given an end keeps it: the token
caps sit in Synapse's tables, and the API enforces the ends already stored on
its tokens whatever its flag says. What rollback loses: with the module flag
off the sweep stops, so the devices of ended sessions stay in the account's
device list, unusable, until removed; and with either flag off the API stops
asking for the end, so a panel that exchanges its Matrix token again before
the end gets an ordinary 24-hour API token, which can outlive the end by up
to a day. The panel still signs itself out on that device at the end, but a
copy of that API token taken before then stays valid until it expires.

**Not enforced, stated plainly:**

-   **Under MAS** (`experimental_features.msc3861`), access tokens live in MAS,
    not in Synapse's tables. The module does not switch itself on there, so
    only "Until I sign out" is offered.
-   **Between the end and the sweep** (up to the sweep interval) the device
    still exists but its tokens are refused. A new token for the same device,
    obtained by signing in again with its device ID (which needs the
    password), is not capped until the sweep deletes the device.
-   **What the session did while it was valid is not undone:** messages sent,
    rooms joined, and anything it created through the API that is meant to
    outlive a session (widget-alert tokens, outbound webhooks, OBS passwords
    and similar), or a LiveKit voice token of up to 15 minutes that a modified
    client asked for.
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
-   **Sign out of an "Until I sign out" session** does not revoke an API
    refresh token that a modified client kept from the exchange: the API never
    hears about Matrix sign-outs (the full app's sign-out has the same gap).
    Timed sessions are not affected; their refresh family ends at the session
    end.
-   **A device with no length:** if the panel is closed between sign-in and
    the bind, or the bind fails and signing the device out fails too, the new
    device keeps no length. The panel never stored its tokens, so nothing
    holds them, but the device shows in the account's device list until
    removed.
-   **Not verified against a deployed homeserver.** What was run: the
    homeserver tests in-process (trial, on SQLite and on Postgres 16), the API
    tests in-process (including a Postgres-backed store restart), and
    end-to-end runs of real processes in the build sandbox — this fork's
    Synapse (SQLite) with the module on, the API with the flag on and off, and
    the production client build, driven in Chromium: the choice, the bind, the
    capped API token, Sign out (the device and the panel's API token), an
    ended session found at load, the flag-off case, and the sweep deleting a
    device in the running homeserver (its end moved into the past in the
    database rather than waiting an hour). Not run:
    a deployed homeserver behind the production proxies, a real extension
    frame, a running homeserver on Postgres. This repository's CI runs no
    `apps/blackout-server` tests at all, so the homeserver tests
    (`tests/blackout_runtime/test_session_length.py`) were run locally only.

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
