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

`develop` (`ff7d08b`) fails the same way: the same scanner, run locally on
develop's `pnpm-lock.yaml` and `osv-scanner.toml`, prints those four rows and
nothing else. `security.yml`'s **Dependency vulnerability audit** job runs the
same osv-scanner step on the same lockfile, so it fails too wherever it runs
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
-   **So this branch's OSV result no longer depends on that date.** The scan
    exits 0 in UTC, UTC+3 and UTC+14 (Verification). The next `ignoreUntil` to
    lapse is image-size's, at 2026-11-30T00:00Z on CI (item 8 of "Found outside
    the gates").

The lockfile moves exactly those three packages. Nothing was added to
`.trivyignore` or `pnpm.auditConfig.ignoreGhsas`, and react-router's entry
left both. `.trivyignore`'s header now
says which accepted advisories are mirrored where.

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
    changes". Both tarballs match the registry's `sha512`. With the version
    string and the hash-named chunk files and their CommonJS variables
    (`chunk-XXXXXXXX`, `_chunkXXXXXXXX`) normalised, **60 of the 64 files under
    `dist/` are byte-identical**. The four that differ are
    `index-react-server.{js,mjs}` in `development/` and `production/`. In their
    action path, a failed origin check now turns the request into a `GET`
    inside the `catch`, so the action does not run. Every module the client
    loads (`index`, `dom-export` and the shared chunks) is the same code as
    before.
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
   `security.yml`'s `pull_request` trigger is path-filtered. The Result
   section and the react-router section now name that filter.
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
   is false, and every OSV run prints it. The record now says so. The entry
   is still unchanged. Item 7 (what the dead brace-expansion entries hide)
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

## Verification

All runs are local, on this branch unless the row says otherwise, with Node
22.22.0 and pnpm 9.15.4 (the pinned `packageManager`). Commands are as in
`ci.yml` and `security.yml`. The suites ran one at a time.

**Scans before the react-router bump** (osv-scanner v2.3.3,
`--lockfile=pnpm-lock.yaml`, 2026-10-30; the scans after it are in the last
table):

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
(`--audit-level moderate`) also exited 0. After the bump: see the last table.

**Gates:**

The gates below ran on the tree committed as `a147f5c`, the dependency commit.
The three commits after it change only this document, comments and one entry in
`osv-scanner.toml`, and the header comment of `.trivyignore`. Only the scans
read those two files. The re-runs after each review are in the tables after
this one.

| Gate                     | Command                                                                                                                             | Result                                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install                  | `pnpm install --frozen-lockfile --offline`; `pnpm install --frozen-lockfile --ignore-scripts` (`actions-node24-compat.yml`)         | pass                                                                                                                                                                                                                                                             |
| lockfile diff            | resolved `packages:` of develop's lockfile against this branch's                                                                    | 2 packages changed (above); 1,496 `name@version` on both sides; no other importer, override or snapshot moved                                                                                                                                                    |
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

**Re-runs after the react-router bump** (2026-10-30, 21:46 to 21:56 UTC, on
the tree with react-router 7.18.2 and the three ignores removed):

| Gate                | Command                                                                                                                    | Result                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lockfile            | `pnpm install --lockfile-only --ignore-scripts`, then `pnpm install --frozen-lockfile --ignore-scripts`                    | only react-router moves (react-router section); installed version 7.18.2; the lockfile's integrity is the registry's                                                    |
| OSV scan            | osv-scanner v2.3.3, `--lockfile=pnpm-lock.yaml`, with `TZ=UTC`, `TZ=Etc/GMT-3` and `TZ=Pacific/Kiritimati` (already 10-31) | exit 0 in all three: "No issues found", 3 filtered (deepmerge, image-size ×2), no unused-ignore line                                                                    |
| OSV query           | `/v1/query` for react-router 7.18.2                                                                                        | no advisories                                                                                                                                                           |
| pnpm audit          | `pnpm audit --prod --audit-level high`; `pnpm run guard:audit-clean`                                                       | exit 0 both: "3 vulnerabilities found, 1 low \| 2 high (2 ignored)"; the two are image-size                                                                             |
| Trivy               | v0.69.3, `security.yml`'s flags, on a copy of the tracked files, DB of 2026-10-30T19:07Z                                   | exit 1 with the same 6 findings as develop, none in `pnpm-lock.yaml` (0): authlib ×3 and twisted in `poetry.lock`, zip ×2 in the desktop `Cargo.lock`                   |
| workspace builds    | `pnpm --filter @blackout/core run build`, `… @blackout/design run build`                                                   | pass                                                                                                                                                                    |
| client types        | `pnpm --filter @blackout/client typecheck`                                                                                 | pass                                                                                                                                                                    |
| client unit         | `pnpm --filter @blackout/client exec vitest run tests/unit src`                                                            | 516 files; 3504 passed, 3 skipped (develop `ff7d08b`: the same)                                                                                                         |
| client smoke        | `pnpm --filter @blackout/client test:integration`                                                                          | 3 files; 13 / 13                                                                                                                                                        |
| client build + size | `pnpm --filter @blackout/client build`; `du -sk --exclude='*.map' dist`                                                    | pass; 25,308 KB ≤ `MAX_BUNDLE_KB` 29,696; the vendor chunk sets `__reactRouterVersion` to `7.18.2` and no chunk contains `7.18.0`                                       |
| client in Chromium  | scratch script: the built `dist` under `vite preview`, headless Chromium 1243, a fresh context per route                   | `/`, `/login`, `/register`, `/home/`, `/messages/`, `/communities`, an unknown path and `/embed`: each stays on its path, `#root` mounts, router 7.18.2, no page errors |
| prettier            | `prettier --check` on the changed files                                                                                    | pass                                                                                                                                                                    |

The API suites were not re-run: react-router is a client dependency only, and
nothing under `packages/` resolves it.

**Not verified:**

-   CI itself: nothing was pushed. Every result above is a local run. That
    GitHub's hosted runners scan in UTC was not checked on a runner; neither
    workflow sets `TZ`.
-   The metro 0.83.8 update was not tried, so it is not shown that the
    resolved tree then drops image-size. Only the 14 manifests were read.
-   deepmerge-ts was checked only against OSV, not read.
-   The react-router bump was checked by the tarball diff, the client's unit
    and smoke suites, its build and the Chromium route check above, all while
    signed out. No signed-in navigation was driven.
-   The client e2e smoke (`CI=1 pnpm e2e`) was not run. Playwright 1.58.2
    expects Chromium build 1208, and this machine has 1243. The Chromium check
    above drove 1243 directly through `playwright-core` and looked only at the
    translation requests, mounting and page errors.
-   Trivy's red result on develop is not addressed here (see the gates table).
-   The node-server harness covers HTTP/1.1 only, without TLS, a proxy in
    front, slow clients, SSE streams, or the WebSocket upgrade shims
    (`/twitch-irc`, `/obs-ws/`, `/se-overlay/`) that attach to the same server.
    The 500 fallback path (an error while writing a response) was not
    triggered.
-   The vanilla-extract `vite dev` path was not inspected beyond the call site.
    It runs the same `composedStyle` on the same objects.
