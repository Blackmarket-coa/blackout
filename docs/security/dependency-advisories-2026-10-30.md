# Dependency advisory triage — 2026-10-30

On 2026-10-30 CI's **Dependency audit (no un-triaged advisories, any severity)**
(`ci.yml`, osv-scanner v2.3.3 on `pnpm-lock.yaml`) went red on a PR that
changes no lockfile. It reported 4 advisories in 3 packages:

| Advisory            | CVSS | Package              | Version | Fixed |
| ------------------- | ---- | -------------------- | ------- | ----- |
| GHSA-rmxm-3fg6-px4f | 5.3  | @hono/node-server    | 2.0.10  | 2.1.3 |
| GHSA-gcqx-w48m-w2h4 | 5.3  | deepmerge            | 4.3.1   | none  |
| GHSA-3cmx-xjww-583x | 3.7  | i18next-http-backend | 4.0.2   | 4.0.4 |
| GHSA-9jhj-wvmw-cfx5 | 3.1  | i18next-http-backend | 4.0.2   | 4.0.3 |

`develop` (`ff7d08b`) failed the same way: the same scanner, run locally on
develop's `pnpm-lock.yaml` and `osv-scanner.toml` on 2026-10-30, printed those
four rows and nothing else (ten rows by 00:04Z on 10-31; see Result).
`security.yml`'s **Dependency vulnerability audit** job runs the same
osv-scanner step on the same lockfile, so it fails too wherever it runs
(its `pull_request` trigger is path-filtered; see
[the react-router section](#react-router-7180--7182-appsblackout-client)).

Three of the advisories were published on 2026-10-28 between 21:05 and 21:10
UTC. deepmerge's is older: NVD published it on 2026-09-18, but GitHub reviewed
it only at 2026-10-27T21:34Z, and its OSV record changed at 21:45Z. All four
are Low or Moderate, so neither Trivy's CRITICAL/HIGH gate nor
`pnpm audit --prod --audit-level high` can fail on them.

**Result:**

-   **@hono/node-server 2.0.10 → 2.1.3** and **i18next-http-backend 4.0.2 →
    4.0.4**: bumps to the smallest fixed release on each line. Neither advisory
    is reachable here, but both have a fix, so the house rule applies: bump,
    don't triage.
-   **deepmerge has no fixed release.** It runs only at build time, on
    repo-authored objects and dependency constants, and none of it ships in the
    client bundle. It gets one `[[IgnoredVulns]]` entry with
    `ignoreUntil = 2027-01-28` (90 days).
-   **react-router 7.18.0 → 7.18.2**, and its ignore removed from
    `osv-scanner.toml`, `.trivyignore` and `pnpm.auditConfig.ignoreGhsas`.
    This was added after the third review. The entry's `reason` said the fix
    "requires React 19 migration". It does not: react-router 7.18.2 fixes the
    advisory and peers `react >=18`. Between 7.18.0 and 7.18.2 only the RSC
    server entry changes, and the client never loads it. The entry would have
    stopped applying at 2026-10-31T00:00Z on CI, not on 2026-11-01 (measured),
    turning `ci.yml`'s audit red on every push and PR. See
    [the react-router section](#react-router-7180--7182-appsblackout-client).
-   **So this branch's OSV result no longer depends on that date.** At 21:46
    UTC on 2026-10-30 the scan exited 0 in UTC, UTC+3 and UTC+14, and CI's
    audit passed on `71548f0` at 21:55 (Verification). The next `ignoreUntil`
    to lapse is image-size's, at 2026-11-30T00:00Z on CI (item 8 of "Found
    outside the gates").
-   **Two newer advisories turned the OSV gates red again.**
    GHSA-3g3m-2fjr-6pw4 (glob, fixed in 14.0.2) and GHSA-g3hv-75wg-m249
    (minimatch, fixed in 11.0.1), both Moderate, were published at 23:09Z on
    2026-10-30, after the runs above. At 00:04Z on 10-31 the scan of this
    branch exited 1 with five rows: glob 11.1.0 and 13.0.6, minimatch 3.1.5,
    5.1.9 and 10.2.5. develop's scan has the same five, besides the four rows
    CI reported and react-router's, whose ignore lapsed at 00:00Z as
    predicted. `pnpm audit` picked up minimatch later: `guard:audit-clean`
    exited 0 in the fourth-review run and 1 at 00:58Z, on minimatch 3.1.5.
    Neither advisory is triaged or changed in this record.
    [The 2026-10-31 record](dependency-advisories-2026-10-31.md) does both.

This record's changes move exactly those three packages in the lockfile.
They add nothing to `.trivyignore` or `pnpm.auditConfig.ignoreGhsas`, and
react-router's entry left both. `.trivyignore`'s header now says which
accepted advisories are mirrored where. The glob and minimatch change moves
more of the lockfile and adds minimatch's GHSA to `ignoreGhsas` (its record).

---

## Method

**Advisory text and ranges.** Each ID came from two sources:

-   the OSV API (`api.osv.dev/v1/vulns/<id>`);
-   GitHub's own record in `github/advisory-database`, fetched from
    `raw.githubusercontent.com`.

The affected events (`introduced`, `fixed`, `last_affected`) and the withdrawal
state are identical in both, for all five IDs including GHSA-qwww-vcr4-c8h2.
The only difference is that GitHub labels the ranges `ECOSYSTEM` where OSV says
`SEMVER`. Every candidate version was then queried through OSV `/v1/query`.

**Versions and code.** The npm registry gave the versions, publish times and
tarball integrity. Every tarball read for this triage was checked against the
registry's `sha512`. For @hono/node-server I also read the commit log between
the `v2.0.10` and `v2.1.3` tags, from a clone of `honojs/node-server`. GitHub's
release pages could not be reached from this session (HTTP 403), so the commit
log and the tarball diff stand in for the release notes. i18next-http-backend
ships a `CHANGELOG.md`.

**Scanner.** osv-scanner **v2.3.3**, the version `osv-scanner-action@v2.3.3`
runs, from the GitHub release binary, checked against the release's
`osv-scanner_SHA256SUMS`. It was run as CI runs it:
`osv-scanner --lockfile=pnpm-lock.yaml` from the repo root, which loads
`osv-scanner.toml` from beside the lockfile.

**Reachable** means the vulnerable code runs, in something this repo deploys,
on input an attacker controls. Where I ran a proof of concept, the section says
so.

---

## Summary

| Advisory                              | Package              | GHSA severity | Was    | Now    | Reachable here                                                      |
| ------------------------------------- | -------------------- | ------------- | ------ | ------ | ------------------------------------------------------------------- |
| GHSA-rmxm-3fg6-px4f (CVE-2026-118663) | @hono/node-server    | Moderate      | 2.0.10 | 2.1.3  | No: no `serveStatic` anywhere                                       |
| GHSA-3cmx-xjww-583x (CVE-2026-118258) | i18next-http-backend | Low           | 4.0.2  | 4.0.4  | No: `{{lng}}` is in the path, not the query (PoC run)               |
| GHSA-9jhj-wvmw-cfx5 (CVE-2026-115730) | i18next-http-backend | Low           | 4.0.2  | 4.0.4  | No: no `{{ns}}` in the template (PoC run)                           |
| GHSA-gcqx-w48m-w2h4 (CVE-2026-93753)  | deepmerge            | Low           | 4.3.1  | 4.3.1  | No: build time only, repo objects and dependency constants; ignored |
| GHSA-qwww-vcr4-c8h2 (existing ignore) | react-router         | High          | 7.18.0 | 7.18.2 | No: RSC mode only, the client uses library mode; ignore removed     |

OSV `/v1/query` returns no advisories for @hono/node-server 2.1.3, 2.1.4 or
2.1.5, for i18next-http-backend 4.0.4 through 4.0.7, or for react-router
7.18.2 or 7.18.5. It still returns GHSA-gcqx-w48m-w2h4 for deepmerge 4.3.1, and
GHSA-qwww-vcr4-c8h2 for react-router 7.18.0.

---

## @hono/node-server: 2.0.10 → 2.1.3 (packages/api)

-   **What:** GHSA-rmxm (Moderate). The adapter's own `serveStatic` decodes the
    request path a second time after Hono has decoded it for routing. A
    malformed percent-encoding can be routed as one path and served as another,
    so middleware mounted on a static prefix does not run. Files stay inside the
    configured root. Affects 1.19.10 up to 2.1.3. It is the same flaw as hono's
    GHSA-5r4p, fixed on 2026-10-23
    ([record](dependency-advisories-2026-10-23.md#hono-4137--41311)), in the
    Node adapter's copy of `serveStatic`.
-   **Our tree:** not reachable.
    -   `packages/api` is the only consumer (`pnpm why -r`). It imports only `serve`
        (`src/index.ts:1`, called at `:509`).
    -   No tracked file imports `@hono/node-server/serve-static` or hono's
        `serveStatic`.
-   **Why the rest of the diff matters more than the fix:** `serve()` is the
    production HTTP adapter for every API request. So I read everything that
    changed between 2.0.10 and 2.1.3, in the commit log and in the shipped
    `dist`:
    1. **The fix** (2.1.3): `serveStatic` refuses a routed path that still
       contains `%`, unless the new `allowPercentInPath` option is set. Not used.
    2. **Request headers** (#389, 2.1.1). `c.req.raw.headers` is now a lazy
       `Headers` subclass:
        - A single `get()` / `has()` reads Node's parsed `incoming.headers`.
        - It reads the raw pairs instead, joined as Fetch joins them, for the
          headers where Node keeps only the first copy (`authorization`,
          `content-type`, `user-agent` and others), and for `set-cookie`.
        - Iterating or changing it builds a real `Headers`.
        - `instanceof Headers` is still true. Values are trimmed of HTTP
          whitespace as before, and `\0`, `\r` and `\n` still fall back to the
          real `Headers`.
    3. **Response `Content-Length`** (#402, 2.1.2). When a response has no
       headers, or a plain header object, node-server now sets Node's internal
       `_contentLength`, so Node writes the header itself. Before, it added
       `Content-Length` to the caller's object. It falls back to the old way for
       HEAD, 204, 304, a response with `Transfer-Encoding` or `Trailer`, and
       HTTP/2. Before the 500 fallback response it now clears a length left over
       from the failed write.
    4. **A `fetch()` response as `init`** (#382, 2.0.12):
       `new Response(body, upstreamResponse)` now copies the upstream headers.
       Before, it shared the upstream's immutable `Headers`, so setting a header
       on it threw. The API returns no `fetch()` response; `giphy.ts` and
       `tenor.ts` build their own.
    5. **Force-closing a non-standard socket** (#383, 2.1.0): uses `destroy()`
       when the socket has no `destroySoon()`.
    6. **`PATCH` and `QUERY` method fast paths** (#380, #376): performance only;
       the method string is the same.
    7. **New `@hono/node-server/early-hints` export** (#378): not used.
    -   Unchanged: request-body reading, the abort signal, the incoming-body
        drain (apart from item 5), `engines` (`node >=20`), the `hono ^4`
        peer, and no dependencies. node-server has no body limit of its own. The
        API's 16 MiB cap is hono's `bodyLimit` (`middleware/body-limit.ts`),
        which does not change.
-   **Only one API test runs node-server, and it sends one request.**
    -   `test/production-app-sigterm.integration.test.ts` runs
        `deploy/docker/backend/bin/start-app`, which ends in
        `exec node --import tsx src/index.ts`. The test sets
        `NODE_ENV=development`, so the real `serve()` at `src/index.ts:509`
        listens.
    -   It waits for `serve()`'s `blackout-server listening` log, sends one
        `GET /health` over HTTP and expects 200, then checks the SIGTERM drain.
    -   Both CI API gates run it (`test:integration` and the post-merge `test`).
        On this branch, with 2.1.3, it passed in both runs below and once more
        on its own.
    -   Every other API suite dispatches through `app.fetch` / `app.request`.
        No test drives request headers, bodies, streaming or aborts through
        the adapter. So a green API suite shows that `serve()` starts, answers
        one GET and shuts down with 2.1.3, and nothing more about this bump.
-   **So the adapter was run on the wire.** A scratch harness (not committed) did
    the following, once per version (2.0.10 and 2.1.3, both from
    integrity-checked tarballs, sharing the installed hono 4.13.11):
    -   It imported the real app from `src/index.ts` (`BLACKOUT_DB_MODE=memory`,
        `BLACKOUT_API_SKIP_LISTEN=1`), served it with `serve({ fetch: app.fetch })`
        as `src/index.ts` does, and sent raw HTTP/1.1 over a socket.
    -   **21 cases:**
        -   `GET` and `HEAD /health`, `GET /metrics`, an unknown path (404), and a
            percent-encoded path;
        -   CORS preflights from an allowed and a foreign origin;
        -   register with malformed JSON, valid JSON, and a chunked body, and a
            failed login;
        -   an authenticated `GET /v1/auth/account/export` with a normal, a
            lower-case-and-padded, a duplicated and a missing `Authorization`;
        -   an issue report with duplicated `X-Forwarded-For` and `Cookie`;
        -   a 17 MiB body declared by `Content-Length`, and one sent chunked;
        -   two pipelined requests on one keep-alive connection;
        -   a lower-case method.
    -   **Result:** identical in all 21 cases: status line, every response
        header (name, value and order), framing, and the masked body. The only
        differences are latency values in `/metrics` and a random per-user key in
        the export.
    -   Both versions return 413 for both oversized bodies, closing the
        connection before the upload finishes. The client sees `EPIPE` on both.
    -   On both, each of the 17 responses with a body carries a lower-case
        `content-length` ahead of Node's own `Date`, from the header object. So
        none took item 3's new path: hono hands node-server a `Headers` object,
        not a plain record. HEAD and 204 responses carry no length on either.
    -   A second harness read duplicated `Cookie`, `X-Forwarded-For`,
        `Authorization`, `User-Agent`, `Content-Type`, `Set-Cookie` and a padded
        custom header through `c.req.header(name)` and `c.req.header()`. The two
        versions return the same strings, including `a=1; b=2` for two `Cookie`
        headers, and `203.0.113.7, 198.51.100.9`, which is what the API's
        `x-forwarded-for` split reads (`routes/diagnostics.ts`,
        `middleware/rate-limit.ts`).
-   **Later releases, not taken:**
    -   2.1.4 only widens the hono peer to `^4 || ^5.0.0-0`.
    -   2.1.5 restricts `serveStatic` to GET and HEAD, and aborts the request
        signal when an HTTP/2 client resets the stream. The API serves HTTP/1
        only and has no `serveStatic`.
    -   2.1.3 is the smallest fix.
-   **Outcome:** `packages/api`'s pin `2.0.10` → **`2.1.3`**, an exact pin, kept
    as it was (`2.0.10` was exact). There is one path, so no override.
-   **Source:** OSV and GitHub advisory files; node-server 2.0.10 / 2.1.3 /
    2.1.4 / 2.1.5 tarballs (diffed); `honojs/node-server` commits
    `v2.0.10..v2.1.5`; harness runs.

## i18next-http-backend: 4.0.2 → 4.0.4 (apps/blackout-client)

-   **What:** two Low advisories, both about building the translation URL from
    a language (`lng`) or namespace (`ns`) value that an attacker controls.
    -   **GHSA-3cmx** (fixed 4.0.4): `&`, `=` and `;` were not rejected. With a
        template that puts `{{lng}}` or `{{ns}}` in the query string (the README's
        multiload shape, `/locales/resources.json?lng={{lng}}&ns={{ns}}`), such a
        value adds or overrides query parameters on the request.
    -   **GHSA-9jhj** (fixed 4.0.3): with a template that puts `{{ns}}` right
        after a leading `/` (`/{{ns}}/{{lng}}.json`), an `ns` of `/evil.example`
        forms the protocol-relative URL `//evil.example/en.json`, which a browser
        fetches from another origin.
-   **Our tree:** not reachable.
    -   The one consumer is `apps/blackout-client/src/app/i18n.ts` (`pnpm why -r`).
        Its template is
        `${trimTrailingSlash(import.meta.env.BASE_URL)}/public/locales/{{lng}}.json`.
        `base` is `'/'` (`build.config.ts`), so the template is
        `/public/locales/{{lng}}.json`.
    -   `{{lng}}` sits in the path, after fixed segments. There is no `{{ns}}`,
        no `addPath` and no `saveMissing`.
    -   The language value is attacker-influenced: i18next-browser-languagedetector
        reads `?lng=`, a cookie, `localStorage` and the browser's languages.
-   **PoC, both versions:** a harness drove `Backend.read()` with a capturing
    `request` option. Origins are resolved against `https://app.example/`.

    | Template                                             | lng / ns                   | 4.0.2                                                         | 4.0.4   |
    | ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------- | ------- |
    | ours: `/public/locales/{{lng}}.json`                 | `de`                       | `/public/locales/de.json`                                     | same    |
    | ours                                                 | `de&ns=private&admin=true` | `/public/locales/de&ns=private&admin=true.json` (same origin) | refused |
    | ours                                                 | `de;x=1`                   | `/public/locales/de;x=1.json` (same origin)                   | refused |
    | ours                                                 | lng `/evil.example`        | refused                                                       | refused |
    | ours                                                 | ns `/evil.example`         | `/public/locales/de.json` (ns unused)                         | same    |
    | advisory's: `…/resources.json?lng={{lng}}&ns={{ns}}` | `de&ns=private&admin=true` | `?lng=de&ns=private&admin=true&ns=common`                     | refused |
    | advisory's: `/{{ns}}/{{lng}}.json`                   | ns `/evil.example`         | `//evil.example/en.json` (origin `https://evil.example`)      | refused |

    On our template, the 4.0.2 rows stay on our origin and name a file that does
    not exist. The two positive controls reproduce both advisories on 4.0.2.

-   **Behaviour change:** 4.0.4 makes no request for a `lng` containing `&`,
    `=` or `;`. Where 4.0.2 asked the static host for a missing file and got a
    404, 4.0.4 asks for nothing; either way i18next falls back to `en`. Between
    4.0.2 and 4.0.4 only `lib/utils.js` changes: the stricter value check and the
    whole-URL `//` check. `lib/index.js` and `lib/request.js` do not change.
    The `esm/index.js` bundle that vite takes (the `import` export) has the same
    two changes and no others, and the built client's main chunk contains
    4.0.4's `/[?#%:&=;\s]/` check.
-   **Versions:** 4.0.3 and 4.0.4 are the two security releases. 4.0.5 to 4.0.7
    are bug fixes this config does not reach:

    -   4.0.5: a `loadPath` function whose promise rejects;
    -   4.0.6: an `XMLHttpRequest` that throws synchronously;
    -   4.0.7: `queryStringParams` placed before a `#fragment`.

    4.0.7 was published at 09:20 UTC on the day of this change. **4.0.4** is the
    smallest release with both fixes.

-   **Outcome:**
    -   The override `i18next-http-backend@2.5.2` moves from `^4.0.2` to
        **`^4.0.4`**, the same mechanism as the 2026-10-06 bump (`1554e05`). The
        client manifest still says `2.5.2`; the override rewrites that
        specifier, and the lockfile's importer records `^4.0.4`. A caret range
        that intersects `2.5.2` cannot resolve below the fix.
    -   pnpm resolved `^4.0.4` to 4.0.7, the highest match. To take 4.0.4, the
        override was set to `4.0.4` for one `pnpm install`, then back to
        `^4.0.4` for a second. pnpm keeps the locked 4.0.4 because it satisfies
        the range. The lockfile was not edited by hand. A later `pnpm update` may
        take 4.0.5 or above, which is fine.
-   **Source:** OSV and GitHub advisory files; i18next-http-backend 4.0.2 through
    4.0.7 tarballs (diffed) and `CHANGELOG.md`; PoC runs.

## deepmerge 4.3.1: no fixed version, build time only — ignored

-   **What:** GHSA-gcqx (CVE-2026-93753; GitHub Low, CVSS 3.1 5.3).
    `mergeObject()` lets a source object poison the prototype of an object in
    the merged result. Run against the installed 4.3.1, with a source `src`
    parsed from `{"__proto__":{"polluted":"yes"}}`:
    -   **The top level of the result is safe.** `deepmerge({}, src)`,
        `deepmerge.all([src])`, and the top level of any `deepmerge.all(...)`,
        which starts from `{}`, are not poisoned. `'__proto__' in {}` is true,
        so the key is skipped as unsafe.
    -   **A nested key can be poisoned.** An earlier source holds a primitive
        or `null` at a key, and a later one holds an object with an own
        `__proto__` there. The merged value at that key then inherits
        `polluted`. `deepmerge.all([{ a: 'str' }, { a: src }], { arrayMerge })`
        is poisoned at `.a`, and so are the same call with `1` or `null` in
        place of `'str'`. So is `deepmerge(Object.create(null), src)` itself.
        The `in` check throws, or is false, on a primitive, null or
        null-prototype target, so the key is written.
    -   An earlier object at that key, or no earlier value, is safe.
    -   `Object.prototype` is never touched.
-   **Versions:** both sources say `introduced 4.2.0`, `last_affected 4.3.1`.
    4.3.1 (2023-03-16) is the latest release. **There is no fix to bump to.**
-   **Paths** (`pnpm why deepmerge -r`; all deepmerge 4.3.1):
    -   **@vanilla-extract/css 1.20.1.** It is a dependency of
        `apps/blackout-client`, of `packages/ui` (used only by the archived
        `legacy/blackout-web`), and of `folds` and `@vanilla-extract/recipes` as
        a peer. It is also reached through `@vanilla-extract/vite-plugin` →
        `@vanilla-extract/compiler` / `@vanilla-extract/integration`.
    -   **workbox-build 7.4.0 → @rollup/plugin-node-resolve 15.3.1**, under
        `vite-plugin-pwa` (a devDependency of the client).
-   **Our tree:** not reachable. Both paths run at build time, on repo-authored
    objects and dependency constants. Neither is attacker input.
    -   **vanilla-extract.** The one call is
        `deepmerge.all(styleRules, { arrayMerge })` in `composedStyle()`
        (`dist/vanilla-extract-css.esm.js:386`), which backs `style([...])`. It
        runs when `@vanilla-extract/vite-plugin` evaluates our `.css.ts` /
        `.css.tsx` files in Node, during `vite build` or `vite dev`.
    -   That call can hit the nested case above. The top-level rule it returns
        is not poisoned. A nested key can be, but only by the style objects it
        is given. Those are repo-authored objects and dependency constants. Of
        the 118 tracked `.css.ts` / `.css.tsx` files, 116 import from
        `@vanilla-extract/css`, 69 use constants from `folds` (`config`,
        `color`, `toRem`, `DefaultReset` and others), and 21 import from
        `@blackout/design` (`packages/design`, in this repo). None of the 118
        contains `__proto__`, `JSON.parse` or `fetch(`, so nothing parsed or
        fetched reaches the merge.
    -   **The shipped client bundle has no deepmerge code.** I checked the
        production build (`pnpm --filter @blackout/client build` on this branch):
        -   None of the 163 `.js` / `.mjs` files in `dist` contains deepmerge's
            error string (`first argument should be an array`),
            `isMergeableObject`, or the word `deepmerge`.
        -   161 of them have source maps, and no map lists a deepmerge or
            `@vanilla-extract/css` source. The two without maps are rolldown's
            runtime and the pdf.js worker.
        -   The only vanilla-extract code that ships is
            `@vanilla-extract/recipes`' `createRuntimeFn`, and `folds`'
            prebuilt `dist/index.js`, which imports only `classnames` and React.
    -   The mobile (Capacitor) and desktop (Tauri) apps ship the same client
        build. `legacy/blackout-web` is archived and not deployed.
    -   **@rollup/plugin-node-resolve** calls deepmerge once:
        `deepMerge({}, defaults)` on its own constant defaults
        (`dist/es/index.js:1059`). That is build time too, and the client's PWA
        config uses `strategies: 'injectManifest'`.
-   **Why not option (a), removing the dependent:**
    -   @vanilla-extract/css **1.21.3** (2026-10-08) replaced deepmerge with
        **deepmerge-ts `^8.0.2`**, a different merge library. A bump would
        remove the first path, but bring in a new merge implementation, not a
        patched deepmerge. OSV `/v1/query` returns nothing for deepmerge-ts
        8.0.2 (its latest release, 2026-08-21) today.
    -   It would not clear the advisory. @rollup/plugin-node-resolve 16.0.3, the
        latest, still depends on deepmerge, and workbox-build 7.4.1 requires
        `^16.0.3`.
    -   It is also not small. It is a minor bump of the CSS compiler across the
        client and `packages/ui`, and `folds` already peers exactly
        `@vanilla-extract/css 1.9.2`. Its effect on generated CSS needs a visual
        check.
-   **Outcome:** one `[[IgnoredVulns]]` entry in `osv-scanner.toml`, in the
    image-size entry's style: what, why it does not apply, the paths, and the
    plan. `ignoreUntil = 2027-01-28`, 90 days out, which the scanner treats as
    lapsing at local midnight starting that day on the scanning host, 00:00Z on
    CI (see the next section).
    -   It is not mirrored in `.trivyignore` or `pnpm.auditConfig.ignoreGhsas`.
        Trivy's gate is CRITICAL/HIGH with `ignore-unfixed`, and
        `pnpm audit --prod --audit-level high` reports it as "1 low" and passes.
        `.trivyignore`'s header now names it as an OSV-only entry, so the header
        no longer claims all three lists hold the same set.
    -   An entry in either would silence nothing today. If GitHub ever re-rates
        the advisory, those gates should fail and prompt a fresh look.
-   **Plan:**
    1. Move `@vanilla-extract/css` to ≥ 1.21.3 in its own change, with a visual
       check of the client. That swaps deepmerge for deepmerge-ts `^8.0.2` on
       this path, so that change should also look at deepmerge-ts's own
       `__proto__` handling and advisories.
    2. Watch `@rollup/plugin-node-resolve` / `workbox-build` for a release
       without deepmerge, and deepmerge for a fix.
    3. Re-check by 2027-01-28. The entry should be deleted once neither path
       resolves deepmerge ≤ 4.3.1.
-   **Source:** OSV and GitHub advisory files; deepmerge 4.3.1 source; PoC
    runs (top level and nested); `@vanilla-extract/css` 1.20.1 `dist`; the
    npm registry for
    `@vanilla-extract/css`, `deepmerge-ts`, `@rollup/plugin-node-resolve` and
    `workbox-build`; the client build's `dist`.

## react-router: 7.18.0 → 7.18.2 (apps/blackout-client)

**Bumped after the third review, and the ignore removed from all three
lists.** The first three versions of this record left the entry alone as the
operator's decision. But its stated reason was false, a patch release fixes the
advisory without changing any code the client runs, and the entry was hours
from lapsing on CI. So this change takes the fix (choice 1 at the end of this
section) rather than renewing a false reason or letting every PR go red.

-   **The advisory.** GHSA-qwww-vcr4-c8h2, "RSC Mode CSRF Bypass Allows Action
    Execution Before 400 Response", High (CVSS 7.1). OSV (record modified
    2026-09-10) and GitHub list two fixed ranges: **7.12.0 → 7.18.2** and
    8.0.0 → 8.3.0.
-   **Not reachable here, before or after.** The client uses react-router in
    library mode only: 129 `from 'react-router'` imports across
    `apps/blackout-client/src` and `tests`, no subpath import and no
    `@react-router/*` package. The vulnerable code is the RSC server entry,
    `dist/*/index-react-server.{js,mjs}`, which the package's `exports` serve
    only under the `react-server` condition. Vite's browser build does not set
    that condition.
-   **The entry's reason was false.** The entry's comment, its `reason` ("Fix
    requires React 19 migration"), the matching `.trivyignore` comment and
    `docs/migrations/react-19-and-react-router-8.md` all said the fix is
    react-router 8, whose whole line requires React ≥ 19.2.7. But react-router
    **7.18.2** (2026-07-28) fixes it and peers `react >=18` /
    `react-dom >=18`, as do 7.18.3 to 7.18.5 (7.18.5, of 2026-10-27, is npm's
    `version-7` tag). GitHub's advisory file was last modified 2026-08-07, two
    weeks after the ignore was written (2026-07-25). I did not check when the
    7.x range was added. While the entry applied, every OSV scan printed the
    false `reason` in its "filtered out because" line.
-   **What 7.18.2 changes.** Its changelog has one entry, "Harden RSC CSRF
    codepaths" (#15353), the PR the advisory cites. 7.18.1's says "No
    changes". Both tarballs match the registry's `sha512`. Each has 70 files
    under `dist/`, 10 of them hash-named chunks (`chunk-XXXXXXXX.{js,mjs}`).
    The version string, the chunk names and their CommonJS variables
    (`_chunkXXXXXXXX`) were normalised, and each chunk was paired with its
    7.18.0 counterpart by content. Then **66 of the 70 files are
    byte-identical**, all 10 chunks among them. The four that differ are
    `index-react-server.{js,mjs}` in `development/` and `production/`. In their
    action path, a failed origin check now turns the request into a `GET`
    inside the `catch`, so the action does not run.
-   **What the client loads is unchanged.** The browser build takes
    `dist/development/index.mjs`, which only re-exports. It imports two
    chunks, `chunk-62JRHF6Z.mjs` and `chunk-ZA36QIGN.mjs`, and the second
    imports the first (read from the installed 7.18.2). The package sets
    `sideEffects: false`. Only the first chunk contributes code: the build's
    161 source maps list one react-router source, `chunk-62JRHF6Z.mjs`,
    which is 7.18.0's `chunk-4ZMWKKQ3.mjs`. Vitest loads
    `dist/development/index.js` and its three CommonJS chunks (traced with
    `strace` on one router test). All of these are among the 66.
-   **Why 7.18.2 and not 7.18.5.** The same rule as the other two bumps: the
    smallest fixed release. 7.18.3 to 7.18.5 change code the client does run.
    7.18.3 adds URL validation on client-side navigations and redirects and
    changes route matching for long paths. 7.18.4 changes when
    `document.startViewTransition` is called. 7.18.5 changes turbo-stream
    decoding and route-manifest processing. Some of that is hardening worth
    having, but it changes behaviour, so it belongs in its own change, with a
    run of the client's navigation (item 1 of "Found outside the gates").
-   **The lockfile** moves only react-router, 7.18.0 → 7.18.2: the
    `apps/blackout-client` importer entry, the `packages:` entry and the
    snapshot, whose dependencies (`cookie`, `set-cookie-parser`) are
    unchanged. The lockfile's integrity for 7.18.2 is the registry's.
-   **Removed:** the `[[IgnoredVulns]]` entry in `osv-scanner.toml`, the line
    in `.trivyignore` and the entry in `pnpm.auditConfig.ignoreGhsas`, each
    with its comment. `docs/migrations/react-19-and-react-router-8.md` now
    says the advisory no longer depends on that migration.
-   **When the entry would have lapsed (measured before the bump).**
    osv-scanner v2.3.3 treats `ignoreUntil` as the moment the date begins, not
    the end of that day, in the local time of the host that runs the scan.
    -   In a scratch copy of this branch, at 20:01 UTC on 2026-10-30, the entry
        with `ignoreUntil = 2026-10-30` no longer applied. The scan exited 1 and
        printed `osv-scanner.toml has unused ignores: GHSA-qwww-vcr4-c8h2` plus
        the row react-router 7.18.0, CVSS 7.1, fixed version 7.18.2.
    -   With `2026-10-31`, the entry's real value, it still applied.
    -   **The date begins at local midnight.** At 21:19 UTC on 2026-10-30, on
        the unmodified branch, the scan exited 0 with `TZ=UTC` and with
        `TZ=America/Los_Angeles`. It exited 1, with the unused-ignore line and
        the react-router row, with `TZ=Etc/GMT-3` (UTC+3, local time 00:19 on
        10-31) and with `TZ=Pacific/Kiritimati` (UTC+14).
    -   So **the entry would have stopped applying at 2026-10-31T00:00Z on
        CI**, a few hours after this record was first written, not on
        2026-11-01. GitHub's hosted
        runners use UTC, and neither `ci.yml` nor `security.yml` sets `TZ`.
    -   A developer's scan east of UTC failed before that moment, and one
        west of UTC would have passed for some hours after it. So near the date
        a local scan can disagree with CI.
-   **What would have happened without a change.** From 2026-10-31T00:00Z,
    `ci.yml`'s **Dependency audit** would have failed on every push and every
    PR, since `ci.yml` runs on all pushes and on PRs to any branch.
    `security.yml`'s **Dependency vulnerability audit** (its osv-scanner step)
    would have failed wherever that workflow runs: pushes to `develop`,
    `master` or `main`, merge-group checks, and PRs that touch its
    `pull_request.paths` (`apps/**`, `packages/**`, `infra/**`, `deploy/**`,
    `pnpm-lock.yaml`, `package.json`, `osv-scanner.toml` and a few others).
    Neither Trivy nor `pnpm audit` would have reported it, because
    `.trivyignore` and `pnpm.auditConfig.ignoreGhsas` listed the GHSA with no
    expiry. Only the OSV gates enforced the deadline.
-   **The choices** this record's third version listed were: (1) bump to
    ≥ 7.18.2 and delete the three ignores; (2) renew the ignore with a new date
    and a corrected reason; (3) do nothing and let the OSV gates go red. This
    change takes (1), at exactly 7.18.2.

---

## Found outside the gates (not changed here)

1. **react-router 7.18.3 to 7.18.5 are not taken.** They add client-side URL
   validation on navigations and redirects and change route matching, view
   transitions and turbo-stream decoding (react-router section). Moving to
   7.18.5 is a separate change that should run the client's navigation, not
   only its unit suite. (This item used to say a 7.x fix existed and the
   decision was open; this change took 7.18.2.)
2. **`ignoreUntil` lapses at the start of its date.** The image-size entries
   (`2026-11-30`) stop applying at 2026-11-30T00:00Z on CI. The cutoff is
   local midnight on the host that runs the scan, which is 00:00Z on CI, so a
   scan east of UTC sees an entry lapse hours early (measured in the
   react-router section). The header of `osv-scanner.toml` ("after that date
   the scanner reports the finding again") is a day late. Anyone setting a
   date should count to the day before.
3. **Only one API test runs `@hono/node-server`, with one request.**
   `production-app-sigterm` starts the real `serve()` through `start-app`,
   sends one `GET /health` and checks the SIGTERM drain. Every other suite goes
   through `app.fetch` / `app.request`. A change to how the adapter handles
   request headers, bodies, streaming or aborts passes every API gate without
   those paths running. This is a narrower form of the gap the 2026-10-23
   record found for nodemailer (its item 9). A test that sends header, body
   and abort cases to `serve()` on a free port, like the harness above, would
   close it. Not added here.
4. **No client test loads translations through i18next-http-backend.**
   `src/app/i18n.ts` is imported only by `main.tsx`, and no unit test imports
   it. The client build includes the module (its source map lists
   `i18next-http-backend/esm/index.js`), but nothing runs it except a real
   browser session.
5. **The client manifest still declares `i18next-http-backend` `2.5.2`.** The
   override supplies the real range. This is the stale-manifest pattern the
   2026-10-23 record fixed for sanitize-html. It is left alone so that this
   change stays the override bump, as `1554e05` did.
6. **`folds` peers `@vanilla-extract/css` 1.9.2 exactly**, and pnpm warns
   about it. The vanilla-extract bump in the deepmerge plan widens that gap.
7. **The brace-expansion mirrors are dead.** `osv-scanner.toml` removed its
   GHSA-mh99-v99m-4gvg entry when the overrides cleared it. `.trivyignore`
   (GHSA-mh99 and CVE-2026-14257) and `pnpm.auditConfig.ignoreGhsas` still
   list it, and the `.trivyignore` comment names versions (1.1.16 / 2.1.2 /
   5.0.8) the lockfile no longer has (1.1.21 / 2.1.7 / 5.0.12). Neither
   scanner reports it without the entry. Trivy 0.69.3 on this branch's
   `pnpm-lock.yaml` with no ignore file, with and without
   `--include-dev-deps`, reports only deepmerge, image-size ×2 and
   react-router (measured before the react-router bump). `pnpm audit --json`
   over the whole tree (1,520 packages), with GHSA-mh99 taken out of
   `ignoreGhsas`, reports only deepmerge (low) and the three highs ignored at
   the time. Both entries are left in place, and
   `.trivyignore`'s header now says so. While they stay, a regression below
   the override pins is hidden from Trivy and `pnpm audit`, and only the OSV
   gates would still catch it. That is the reason `osv-scanner.toml` gives for
   removing its own copy. Removing them is a separate change.
8. **The image-size entries' premise is out of date too.** Their comments and
   `reason` say no fixed version exists. OSV now lists both advisories as
   fixed in **2.0.3** (records modified 2026-09-24). image-size 2.0.3 and
   2.0.4 were published on 2026-09-14, and Trivy's row shows `2.0.3` as fixed.
   The lockfile has image-size 1.2.1, from metro 0.83.5 (`image-size ^1.0.2`).
   `pnpm why image-size -r` traces it to `legacy/blackout-web` and
   `packages/ui`, through react-native 0.82.1 →
   `@react-native/community-cli-plugin` 0.82.1 → metro.
    - On the registry, metro **0.83.8** (2026-08-19, the `0.83-stable` tag)
      declares no image-size dependency.
    - Neither do the 13 metro-\* packages it pulls in, directly or through
      each other, all at 0.83.8: babel-transformer, cache, cache-key, config,
      core, file-map, minify-terser, resolver, runtime, source-map,
      symbolicate, transform-plugins and transform-worker. None of the 14
      manifests lists image-size in `dependencies`, `optionalDependencies` or
      `peerDependencies`.
    - 0.83.8 is inside `@react-native/community-cli-plugin` 0.82.1's
      `^0.83.1`.
    - So a metro update should remove image-size, and both ignores with it,
      before they lapse at 2026-11-30T00:00Z. The update was not tried here,
      so whether the resolved tree then loses image-size is not verified.
    - Until then, every OSV scan prints the false "No fixed version exists"
      `reason` for both entries, as it printed react-router's until this
      change.

## Corrected after review

The first version of this record (`79b2791`) said four things that were not
true. They are corrected above. The commit messages of `a147f5c` and `79b2791`
repeat the first and third, and this section is their correction.

1. **"No API test runs node-server."** `production-app-sigterm` does: it
   starts the real `serve()` through `start-app` and sends one `GET /health`.
   The gap is the adapter's header, body, streaming and abort handling, not
   `serve()` as a whole (the node-server section, and item 3 of "Found
   outside the gates").
2. **"Exact like the rest of that manifest (`.npmrc` has
   `save-exact=true`)."** `packages/api/package.json` has 11 caret ranges among
   its 25 entries, among them `hono`, `ws`, `zod`, `pg` and `nodemailer`. The
   repo's only `.npmrc` is `apps/blackout-client/.npmrc`, which does not apply
   to `packages/api`. The pin is exact because `2.0.10` was.
3. **"`deepmerge.all([src])` (vanilla-extract's call shape): not
   poisoned."** Only the top level of that call is safe. A nested key can be
   poisoned (deepmerge section). The conclusion, not reachable, stands: the
   inputs are repo-authored objects and dependency constants (see the second
   list below). The `osv-scanner.toml` comment,
   which said deepmerge sets the prototype of "the object deepmerge returns",
   now says the merged object at that position.
4. **`.trivyignore`'s header** said it mirrors the accepted-risk set in
   `osv-scanner.toml` and `pnpm.auditConfig`. The lists already differed (the
   Twisted entries, the brace-expansion entries), and the deepmerge entry
   widened the gap. The header now says what is mirrored where, and why.

A second review, of `26e6ce5`, found five more statements that were
inaccurate or incomplete. They are corrected above. The commit message of
`79b2791` repeats the second, third and fourth, and that of `26e6ce5` the
fourth; this list is their correction:

1. **"Both osv-scanner gates are red on every branch"** and **"fail on every
   PR"** were true only of `ci.yml`'s audit, which runs on every push and PR.
   `security.yml`'s `pull_request` trigger is path-filtered. At `1ba075a` the
   Result section and the react-router section named that filter. Since
   `71548f0` the opening paragraph and the react-router section do.
2. **"The entry stops applying at 2026-10-31T00:00 UTC"** is the moment on
   CI. The cutoff is local midnight on the scanning host (measured in the
   react-router section; item 2 of "Found outside the gates").
3. **"@vanilla-extract/css 1.21.3 dropped deepmerge."** It replaced it with
   deepmerge-ts `^8.0.2`. The deepmerge section, its plan and the
   `osv-scanner.toml` comment now say so.
4. **"On input written in this repo."** The merged style objects also take
   constants from `folds`. Neither is attacker input, so the conclusion
   stands. The record, the `osv-scanner.toml` comment and the entry's
   `reason` now say "repo-authored objects and dependency constants" or the
   equivalent.
5. **The react-router entry's premise was called "out of date".** Its reason
   was false, and every OSV run printed it. At `1ba075a` the record said so
   and the entry was unchanged. `71548f0` removed it (Changed after the third
   review). Item 7 (what the dead brace-expansion entries hide)
   and item 8 (all 14 metro manifests checked) of "Found outside the gates"
   were also completed.

## Changed after the third review

A third review, of `1ba075a`, found no error in the record but one problem it
had left in place: the branch passed the OSV gates only until
2026-10-31T00:00Z, on an ignore whose reason was false, while a fix that needs
no React 19 existed. This change takes that fix (react-router section): 7.18.2,
the three ignores removed, and `docs/migrations/react-19-and-react-router-8.md`
updated. The record's Result, Summary, react-router section, items 1, 7 and 8
of "Found outside the gates" and Verification now describe the tree after the
bump. The measurements made before it are kept and marked as such.

A fourth review, of `71548f0`, found statements that change had got wrong or
left stale. They are corrected above. The commit message of `71548f0` repeats
the first, and says Verification describes the tree after the bump, which the
second shows was incomplete. This list is their correction:

1. **"60 of the 64 files under `dist/` are byte-identical."** Each tarball has
   70 files under `dist/`. 64 is the number of distinct names once the 10
   chunk hashes are normalised, so a comparison keyed on that name checked 4
   of the 10 chunks. Paired by content, 66 of the 70 are identical, all 10
   chunks among them, and the same 4 files differ. The list of what the
   client loads also named `dom-export`, which it does not load.
2. **The Gates preamble** still said three commits follow `a147f5c` and change
   only documents and comments. It now names the fourth.
3. **The migration doc's rollback sentence** said 7.18.2 "or later" keeps the
   advisory fixed. 8.0.0 to 8.2.x are later and affected (OSV's second range,
   8.0.0 → 8.3.0). Its step 5, option C and audit gate still treated the
   deferral as current. They are dated or reworded.
4. **Appendix B of `docs/audits/pre-launch-readiness-audit-2026-07.md`** still
   called the advisory the H8 remainder, silenced until 2026-10-31. It now
   has a dated note.
5. **Items 1 and 5 of the second list above** read as true at HEAD. They are
   now dated to `1ba075a`.
6. **The bump's re-runs** were dated "21:46 to 21:56", after the commit
   (21:53:26); they ended at 21:53. Only UTC+14 was marked as already on
   10-31, but UTC+3 was too.
7. **Verification** said its commands are as in `ci.yml`. The client unit
   rows ran `test:unit`'s command, not `ci.yml`'s `test:coverage`, which also
   enforces the coverage floors. "Not verified" said CI had not run, and
   described one Chromium check where there are two.

After midnight UTC two more things were measured. develop's react-router
ignore lapsed at 00:00Z, as the react-router section predicted. Two
advisories published at 23:09Z made the OSV gates red again (Result).

A fifth review, of `741f903`, found the glob and minimatch rows untriaged and
five statements wrong or stale. They are corrected above. The commit message
of `741f903` repeats item 3 ("index.mjs and one chunk in the build"). This
list is their correction:

1. **The glob and minimatch rows were disclosed, not triaged.** On the next
   push they would have turned `ci.yml`'s Dependency audit and
   `security.yml`'s OSV step red. The 2026-10-31 record triages them, and its
   change moves glob and two of the three minimatch versions and ignores
   3.1.5. Result and "Not verified" now point there.
2. **`guard:audit-clean` went red after the fourth-review run.** That table's
   "exit 0 both, unchanged" held in its window, 23:50Z to 00:11Z. At 00:58Z
   the same script exited 1 on minimatch 3.1.5. The row now says so.
3. **The browser build's react-router entry imports two chunks, not one.**
   Only the first contributes code. Both are among the 66.
4. **The Gates preamble's count was off by one again.** "Four commits follow
   it" was five at `741f903`, which is itself one of them, and item 2 of the
   fourth list called the count fixed. The preamble now gives no count.
5. **"CI ran them"** said CI ran the API suites. On `71548f0` it ran the PR
   gate (`test:integration`) and launch smoke. The post-merge suite runs only
   in `turborepo-ci.yml`, which this PR does not trigger. The Verification
   preamble now lists that row and the `--offline` install as exceptions,
   with the two client unit rows.
6. **Security checks had a second red step.** The CI paragraph said they stay
   red until the six Trivy findings are fixed (`-v48`). From 23:09Z the OSV
   step would also fail on `71548f0` and `741f903`, and `-v48` does not fix
   that. The paragraph now says so.

## Verification

Runs are local and on this branch unless the row or section says otherwise,
with Node 22.22.0 and pnpm 9.15.4 (the pinned `packageManager`). Commands are
as in `ci.yml` and `security.yml`, or in the workflow a row names, with three
exceptions:

-   The two client unit rows ran `vitest run tests/unit src`, which is
    `test:unit` (`mobile_contract_tests.yml` runs it), not `ci.yml`'s
    `test:coverage`, which also enforces the coverage floors.
    `test:coverage` is in the fourth-review table.
-   The API post-merge row ran `@blackout/api`'s `test` script. In CI only
    `turborepo-ci.yml` runs it (`pnpm turbo run test`), on pushes to `main`
    and `develop` and on PRs to `main`, so not on this PR.
-   The install row's first command adds `--offline`, which CI does not pass.

The suites ran one at a time. CI's own runs on `71548f0` are in "CI on
`71548f0`" below.

**Scans before the react-router bump** (osv-scanner v2.3.3,
`--lockfile=pnpm-lock.yaml`, 2026-10-30; the scans after it are in the
react-router re-runs table and the last table):

| Tree                                                         | Result                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| develop `ff7d08b` (`pnpm-lock.yaml` + `osv-scanner.toml`)    | exit 1: 4 vulns in 3 packages, the four rows CI reported; 3 filtered                                   |
| this branch, bumps only (no deepmerge entry)                 | exit 1: 1 row, deepmerge 4.3.1                                                                         |
| this branch                                                  | exit 0: "No issues found", 4 filtered, no unused-ignore line                                           |
| this branch, react-router `ignoreUntil` set to today (probe) | exit 1: unused ignore GHSA-qwww-vcr4-c8h2; 1 row, react-router 7.18.0 (what CI sees from 10-31 00:00Z) |

Before the react-router bump, that exit 0 held only until
**2026-10-31T00:00Z** on a UTC host such as CI's runners (earlier on a host
east of UTC). From then on, a scan of that tree gives the probe's result.

`pnpm audit --prod --audit-level high` (security.yml), before the
react-router bump: exit 0, "4 vulnerabilities found, 1 low | 3 high (3
ignored)". The low one is deepmerge (`--json`); the three ignored were
image-size ×2 and react-router. The root `guard:audit-clean` script
(`--audit-level moderate`) also exited 0. After the bump: see "Re-runs after the react-router bump".

**Gates:**

The gates below ran on the tree committed as `a147f5c`, the dependency commit.
The commits after it up to `1ba075a` change only this document, comments and
one entry in `osv-scanner.toml`, and the header comment of `.trivyignore`.
Only the scans read those two files. `71548f0` moves react-router in the
client manifest and the lockfile and removes its three ignores. Its gates are
in "Re-runs after the react-router bump". `741f903` changes only documents.
The glob and minimatch change that follows has its gates in the 2026-10-31
record. Each review's re-runs are in a table after this one.

| Gate                     | Command                                                                                                                             | Result                                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install                  | `pnpm install --frozen-lockfile --offline`; `pnpm install --frozen-lockfile --ignore-scripts` (`actions-node24-compat.yml`)         | pass                                                                                                                                                                                                                                                             |
| lockfile diff            | resolved `packages:` of develop's lockfile against this branch's                                                                    | 2 packages changed at `a147f5c`, 3 after `71548f0` (Result); 1,496 `name@version` on both sides; no other importer, override or snapshot moved                                                                                                                   |
| API lint                 | `pnpm --filter @blackout/api lint`                                                                                                  | pass                                                                                                                                                                                                                                                             |
| API types                | `pnpm --filter @blackout/api typecheck`                                                                                             | pass                                                                                                                                                                                                                                                             |
| API, PR gate             | `BLACKOUT_DB_MODE=memory BLACKOUT_API_SKIP_LISTEN=1 NODE_ENV=test pnpm --filter @blackout/api test:integration`                     | 1971 / 1971, 0 skipped                                                                                                                                                                                                                                           |
| API, post-merge          | `pnpm --filter @blackout/api test`                                                                                                  | 2091 / 2091, 0 skipped                                                                                                                                                                                                                                           |
| API, launch smoke        | same env as the PR gate, `test:launch-smoke`                                                                                        | 14 / 14                                                                                                                                                                                                                                                          |
| workspace builds         | `pnpm --filter @blackout/core run build`, `… @blackout/design run build`                                                            | pass                                                                                                                                                                                                                                                             |
| client types             | `pnpm --filter @blackout/client typecheck`                                                                                          | pass                                                                                                                                                                                                                                                             |
| client unit              | `pnpm --filter @blackout/client exec vitest run tests/unit src`                                                                     | 516 files; 3504 passed, 3 skipped. develop `ff7d08b`, run the same way: 3504 passed, 3 skipped                                                                                                                                                                   |
| client build + size      | `pnpm --filter @blackout/client build`; `du -sk --exclude='*.map' dist`                                                             | pass; 25,308 KB ≤ `MAX_BUNDLE_KB` 29,696                                                                                                                                                                                                                         |
| client in Chromium       | scratch script: the built `dist` under `vite preview`, headless Chromium, a fresh context per case                                  | `/` loads `en.json`; `?lng=de` loads `de.json` and `en.json`; `?lng=de%26ns%3Dprivate%26admin%3Dtrue` and `?lng=de%3Bx%3D1` load only `en.json`; app mounts, no page errors                                                                                      |
| node-server on the wire  | scratch harness (node-server section)                                                                                               | 21 / 21 cases identical between 2.0.10 and 2.1.3                                                                                                                                                                                                                 |
| i18next-http-backend PoC | scratch harness (i18next-http-backend section)                                                                                      | as in the table there                                                                                                                                                                                                                                            |
| pnpm audit               | `pnpm audit --prod --audit-level high` (`security.yml`)                                                                             | exit 0 (above)                                                                                                                                                                                                                                                   |
| Trivy                    | v0.69.3, `security.yml`'s flags, on `git archive` exports of develop and of this branch                                             | exit 1 on **both**, with the same 6 findings and none in `pnpm-lock.yaml`: authlib ×3 and twisted in `apps/blackout-server/poetry.lock`, zip ×2 in `blackout-desktop/src-tauri/Cargo.lock`. They predate this change and are outside it. DB of 2026-10-30T19:07Z |
| gitleaks                 | 8.21.2, `gitleaks git --log-opts="origin/develop..HEAD" --no-banner --redact .`; `gitleaks dir` on this file and `osv-scanner.toml` | no leaks                                                                                                                                                                                                                                                         |

**Re-runs after the corrections** (2026-10-30, 20:53 to 21:01 UTC, on the
corrected tree):

| Gate                        | Command                                                                                                                                       | Result                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| OSV scan                    | osv-scanner v2.3.3, `--lockfile=pnpm-lock.yaml`                                                                                               | exit 0: "No issues found", 4 filtered. Holds until 2026-10-31T00:00Z                          |
| OSV probe                   | the same, with the react-router `ignoreUntil` set to `2026-10-30`                                                                             | exit 1: unused ignore GHSA-qwww-vcr4-c8h2; 1 row, react-router 7.18.0, CVSS 7.1, fixed 7.18.2 |
| Trivy                       | v0.69.3, `security.yml`'s flags, on an export of the corrected tree, same DB                                                                  | exit 1 with the same 6 findings as before, none in `pnpm-lock.yaml`; the new header parses    |
| real `serve()` test         | `tsx --import ./test/_setup/blocking-stdio.mjs --test --test-force-exit --test-concurrency=1 test/production-app-sigterm.integration.test.ts` | 1 / 1 pass, with node-server 2.1.3                                                            |
| deepmerge PoC               | scratch script, installed deepmerge 4.3.1                                                                                                     | as in the deepmerge section                                                                   |
| brace-expansion, image-size | Trivy with no ignore file; `pnpm audit --json` without GHSA-mh99; OSV; the npm registry                                                       | as in items 7 and 8 of "Found outside the gates"                                              |
| gitleaks                    | `gitleaks dir` on this file, `osv-scanner.toml` and `.trivyignore`                                                                            | no leaks                                                                                      |

`pnpm audit` was not re-run: `package.json` and the lockfile did not change.
The API and client suites were not re-run either, apart from the one test
above. No code, manifest or lockfile changed.

**Re-runs after the second review** (2026-10-30, 21:18 to 21:30 UTC). The
change is to this document, the deepmerge entry's comment and `reason` in
`osv-scanner.toml`, and the header comment of `.trivyignore`:

| Gate             | Command                                                                                              | Result                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| OSV scan         | osv-scanner v2.3.3 (sha256 matches `osv-scanner_SHA256SUMS`), `TZ=UTC`                               | exit 0: "No issues found", 4 filtered, the new deepmerge `reason` printed                     |
| OSV, UTC+3       | the same, `TZ=Etc/GMT-3`                                                                             | exit 1: unused ignore GHSA-qwww-vcr4-c8h2; 1 row, react-router 7.18.0, CVSS 7.1, fixed 7.18.2 |
| OSV probe        | `TZ=UTC`, scratch copy with the react-router `ignoreUntil` set to `2026-10-30`                       | exit 1, the same row                                                                          |
| OSV, time zones  | unmodified tree at 21:19 UTC, `TZ` = `UTC`, `America/Los_Angeles`, `Etc/GMT-3`, `Pacific/Kiritimati` | exit 0, 0, 1, 1 (react-router section)                                                        |
| Trivy            | v0.69.3, `security.yml`'s flags, on a copy of the tracked files, DB of 2026-10-30T19:07Z             | exit 1 with the same 6 findings, none in `pnpm-lock.yaml`; the edited header parses           |
| registry and OSV | react-router, `@vanilla-extract/css`, deepmerge-ts, metro and 13 metro-\* manifests, image-size      | as in the sections above                                                                      |
| prettier         | `prettier --check` (lint-staged runs `prettier --write` on commit)                                   | pass                                                                                          |
| gitleaks         | `gitleaks dir` on the three files; `gitleaks git --log-opts="origin/develop..HEAD"`                  | no leaks                                                                                      |

The OSV exit 0 again held only until 2026-10-31T00:00Z in UTC, before the
react-router bump.

**Re-runs after the react-router bump** (2026-10-30, 21:46 to 21:53 UTC, on
the tree with react-router 7.18.2 and the three ignores removed):

| Gate                | Command                                                                                                    | Result                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lockfile            | `pnpm install --lockfile-only --ignore-scripts`, then `pnpm install --frozen-lockfile --ignore-scripts`    | only react-router moves (react-router section); installed version 7.18.2; the lockfile's integrity is the registry's                                                    |
| OSV scan            | osv-scanner v2.3.3, `--lockfile=pnpm-lock.yaml`, with `TZ=UTC`, `TZ=Etc/GMT-3` and `TZ=Pacific/Kiritimati` | exit 0 in all three, UTC+3 and UTC+14 already on 10-31: "No issues found", 3 filtered (deepmerge, image-size ×2), no unused-ignore line                                 |
| OSV query           | `/v1/query` for react-router 7.18.2                                                                        | no advisories                                                                                                                                                           |
| pnpm audit          | `pnpm audit --prod --audit-level high`; `pnpm run guard:audit-clean`                                       | exit 0 both: "3 vulnerabilities found, 1 low \| 2 high (2 ignored)"; the two are image-size                                                                             |
| Trivy               | v0.69.3, `security.yml`'s flags, on a copy of the tracked files, DB of 2026-10-30T19:07Z                   | exit 1 with the same 6 findings as develop, none in `pnpm-lock.yaml` (0): authlib ×3 and twisted in `poetry.lock`, zip ×2 in the desktop `Cargo.lock`                   |
| workspace builds    | `pnpm --filter @blackout/core run build`, `… @blackout/design run build`                                   | pass                                                                                                                                                                    |
| client types        | `pnpm --filter @blackout/client typecheck`                                                                 | pass                                                                                                                                                                    |
| client unit         | `pnpm --filter @blackout/client exec vitest run tests/unit src`                                            | 516 files; 3504 passed, 3 skipped (develop `ff7d08b`: the same)                                                                                                         |
| client smoke        | `pnpm --filter @blackout/client test:integration`                                                          | 3 files; 13 / 13                                                                                                                                                        |
| client build + size | `pnpm --filter @blackout/client build`; `du -sk --exclude='*.map' dist`                                    | pass; 25,308 KB ≤ `MAX_BUNDLE_KB` 29,696; the vendor chunk sets `__reactRouterVersion` to `7.18.2` and no chunk contains `7.18.0`                                       |
| client in Chromium  | scratch script: the built `dist` under `vite preview`, headless Chromium 1243, a fresh context per route   | `/`, `/login`, `/register`, `/home/`, `/messages/`, `/communities`, an unknown path and `/embed`: each stays on its path, `#root` mounts, router 7.18.2, no page errors |
| prettier            | `prettier --check` on the changed files                                                                    | pass                                                                                                                                                                    |

The API suites were not re-run locally: react-router is a client dependency
only, and nothing under `packages/` resolves it. CI ran the PR gate
(`test:integration`) and launch smoke on `71548f0` (below). The post-merge
suite runs only in `turborepo-ci.yml`, which this PR does not trigger, so for
this record it ran only in the Gates table, on `a147f5c`'s tree.

**CI on `71548f0`** (pushed 2026-10-30 at 21:53Z; read from the Actions API):

| Workflow (event)                                                                                                               | Run                                                             | Result                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Blackout CI (push)                                                                                                             | 41134368053                                                     | success, 23 of 23 jobs                                                                                                                                                                     |
| Blackout CI (pull_request)                                                                                                     | 41134501169                                                     | success, 23 of 23 jobs, among them Dependency audit (exit 0, 3 filtered, at 21:55Z), Unit tests (`test:coverage`, `test:integration`), Client e2e smoke and Launch-smoke gate              |
| Security checks (pull_request)                                                                                                 | 41134501175                                                     | **failure**: Trivy filesystem scan exit 1 with the same 6 findings as the local runs, none in `pnpm-lock.yaml`. Dependency vulnerability audit, Gitleaks, Semgrep, Hardening guards passed |
| Centralized CI Parity, Visual regression, Mobile Contract Tests, Actions Node 24 compatibility check, Pull Request Base Branch | 41134501148, 41134501203, 41134501113, 41134501207, 41134501176 | success                                                                                                                                                                                    |

So PR #994's Security checks stay red until the six Trivy findings are fixed
(the `-v48` branch) or the operator decides otherwise. develop's last Security
checks run (40419066923, on `ff7d08b`, 2026-10-26) was green. A local Trivy run
on develop's tree gives the same 6 (Gates table), so develop's next run should
fail the same way; that was not run on a runner. Both OSV jobs passed before
the glob and minimatch advisories were published (23:09Z). From then the local
scan of `71548f0`'s lockfile, which `741f903` does not change, exited 1
(Result), so a re-run of either job on those commits should have failed. None
was re-run. That is a second red step in Security checks, and `-v48` does not
fix it: at `05dfc10` it changes no `pnpm-lock.yaml`, `package.json` or
`osv-scanner.toml`. The 2026-10-31 change does; its scans exit 0.

**Re-runs after the fourth review** (2026-10-30 23:50 to 2026-10-31 00:11
UTC). The change is to this document, `docs/migrations/react-19-and-react-router-8.md`
and Appendix B of `docs/audits/pre-launch-readiness-audit-2026-07.md`. No
manifest or lockfile changed:

| Gate                   | Command                                                                                                                                               | Result                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| tarball diff           | react-router 7.18.0 and 7.18.2 fetched again, `sha512` equal to the registry's; scratch script, each chunk paired by content                          | 70 files under `dist/` in each; 66 identical, all 10 chunks among them; 4 differ: `index-react-server.{js,mjs}` in `development/` and `production/` |
| build sources          | `sources` of every `.map` in the client build of `71548f0`'s tree (21:50Z)                                                                            | 161 maps; one react-router source, `dist/development/chunk-62JRHF6Z.mjs`                                                                            |
| Vitest load            | `strace -f -e trace=openat` on `vitest run tests/unit/components/BackRouteHandler.test.tsx`                                                           | 4 / 4 pass; opens `dist/development/index.js` and `chunk-{HHGH3NKS,7XGYIT3M,3UVS743K}.js`, no other file under `dist/`                              |
| advisory ranges        | `api.osv.dev/v1/vulns/GHSA-qwww-vcr4-c8h2`, GitHub's advisory file, `/v1/query`                                                                       | both: 7.12.0 → 7.18.2 and 8.0.0 → 8.3.0; OSV returns it for 8.0.0 and 8.2.0, not for 7.18.2 or 8.3.0                                                |
| client unit (`ci.yml`) | `pnpm --filter @blackout/client run test:coverage`                                                                                                    | 516 files; 3504 passed, 3 skipped; statements 45.31, branches 36.38, functions 36.24, lines 46.37 against floors 41.3, 32.2, 32.5, 42.3             |
| OSV scan               | osv-scanner v2.3.3 (sha256 matches `osv-scanner_SHA256SUMS`), 00:04Z on 10-31, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`, `America/Los_Angeles` | exit 1 in all four: 3 filtered, no unused-ignore line, 5 rows from GHSA-3g3m-2fjr-6pw4 (glob) and GHSA-g3hv-75wg-m249 (minimatch) (Result)          |
| OSV, develop           | the same, `TZ=UTC`, on develop's `pnpm-lock.yaml` and `osv-scanner.toml`                                                                              | exit 1: unused ignore GHSA-qwww-vcr4-c8h2; 10 rows: the four CI reported, the same five, and react-router 7.18.0                                    |
| pnpm audit             | `pnpm audit --prod --audit-level high`; `pnpm run guard:audit-clean`                                                                                  | exit 0 both, unchanged: "3 vulnerabilities found, 1 low \| 2 high (2 ignored)". At 00:58Z `guard:audit-clean` exited 1 on minimatch 3.1.5 (Result)  |
| prettier               | `prettier --check` on the three changed files                                                                                                         | pass                                                                                                                                                |
| gitleaks               | `gitleaks dir` on the three changed files                                                                                                             | no leaks                                                                                                                                            |

**Re-runs after the fifth review** (2026-10-31, 02:45 to 02:55 UTC, on the
tree with the 2026-10-31 change). The change is to this document only:

| Gate              | Command                                                                                                               | Result                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| react-router load | `grep` for `from "./chunk-` in the installed 7.18.2's `dist/development/index.mjs` and chunks; its `package.json`     | `index.mjs` imports `chunk-ZA36QIGN.mjs` and `chunk-62JRHF6Z.mjs`; the first imports the second; `sideEffects: false`           |
| workflows         | `grep` of `.github/workflows/` for the API `test` script, `turbo run test` and `--offline`                            | only `turborepo-ci.yml` runs `pnpm turbo run test` (PRs to `main`; pushes to `main`, `develop`); no workflow passes `--offline` |
| CI runs           | the Actions API: the branch's runs; the jobs of 41134501169                                                           | 8 runs, all on `71548f0`, none of them Turborepo CI; API smoke + integration and Launch-smoke gate passed                       |
| `-v48`            | `git diff --name-only ff7d08b 05dfc10`                                                                                | 19 files; not `pnpm-lock.yaml`, `package.json` or `osv-scanner.toml`                                                            |
| OSV scan          | osv-scanner v2.3.3 (sha256 matches `osv-scanner_SHA256SUMS`), 02:50Z, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati` | exit 0 in all three: "No issues found", 4 filtered, no unused-ignore or multiple-ignore line                                    |
| pnpm audit        | `pnpm audit --prod --audit-level high`; `pnpm run guard:audit-clean`, 02:50Z                                          | exit 0 both: "4 vulnerabilities found, 1 low \| 1 moderate (1 ignored) \| 2 high (2 ignored)"                                   |
| prettier          | `prettier --check` on this file                                                                                       | pass                                                                                                                            |
| gitleaks          | `gitleaks dir` on this file; `gitleaks git --log-opts="741f903442..HEAD"`                                             | no leaks                                                                                                                        |

**Not verified:**

-   That GitHub's hosted runners scan in UTC was not checked on a runner;
    neither workflow sets `TZ`.
-   The metro 0.83.8 update was not tried, so it is not shown that the
    resolved tree then drops image-size. Only the 14 manifests were read.
-   deepmerge-ts was checked only against OSV, not read.
-   The react-router bump was checked locally by the tarball diff, the
    client's unit and smoke suites, its build and the 7.18.2 route check, all
    while signed out. No signed-in navigation was driven. What CI's e2e smoke
    and navigation audit drive was not read.
-   The client e2e smoke (`CI=1 pnpm e2e`) was not run locally. Playwright
    1.58.2 expects Chromium build 1208, and this machine has 1243. CI ran it
    on `71548f0` and it passed (above). The two local Chromium checks drove
    1243 directly through `playwright-core`, both signed out. The one on
    `a147f5c` looked at the translation requests, mounting and page errors.
    The one on 7.18.2 looked at the path, mounting, `__reactRouterVersion` and
    page errors.
-   Trivy's red result is not addressed here. CI confirmed it on `71548f0`
    (above).
-   The glob and minimatch advisories were not triaged here: not which
    packages pull those versions in, nor whether the code is reachable. The
    2026-10-31 record does that.
-   The node-server harness covers HTTP/1.1 only, without TLS, a proxy in
    front, slow clients, SSE streams, or the WebSocket upgrade shims
    (`/twitch-irc`, `/obs-ws/`, `/se-overlay/`) that attach to the same server.
    The 500 fallback path (an error while writing a response) was not
    triggered.
-   The vanilla-extract `vite dev` path was not inspected beyond the call site.
    It runs the same `composedStyle` on the same objects.
