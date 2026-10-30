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
same osv-scanner step on the same lockfile, so it fails too.

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
-   **deepmerge has no fixed release.** It runs only at build time, on objects
    written in this repo, and none of it ships in the client bundle. It gets one
    `[[IgnoredVulns]]` entry with `ignoreUntil = 2027-01-28` (90 days).
-   **The react-router ignore was not touched.** It stops applying at
    **2026-10-31T00:00 UTC**, not on 2026-11-01 (measured, below). From then on
    both osv-scanner gates are red on every branch. A react-router 7.x release
    now fixes it without React 19. See
    [the react-router section](#react-router-ignore-ghsa-qwww-vcr4-c8h2-lapses-2026-10-31t0000z).

The lockfile moves exactly those two packages. Nothing was added to
`.trivyignore` or `pnpm.auditConfig.ignoreGhsas`.

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

| Advisory                              | Package              | GHSA severity | Was    | Now    | Reachable here                                        |
| ------------------------------------- | -------------------- | ------------- | ------ | ------ | ----------------------------------------------------- |
| GHSA-rmxm-3fg6-px4f (CVE-2026-118663) | @hono/node-server    | Moderate      | 2.0.10 | 2.1.3  | No: no `serveStatic` anywhere                         |
| GHSA-3cmx-xjww-583x (CVE-2026-118258) | i18next-http-backend | Low           | 4.0.2  | 4.0.4  | No: `{{lng}}` is in the path, not the query (PoC run) |
| GHSA-9jhj-wvmw-cfx5 (CVE-2026-115730) | i18next-http-backend | Low           | 4.0.2  | 4.0.4  | No: no `{{ns}}` in the template (PoC run)             |
| GHSA-gcqx-w48m-w2h4 (CVE-2026-93753)  | deepmerge            | Low           | 4.3.1  | 4.3.1  | No: build time only, repo-authored input; ignored     |
| GHSA-qwww-vcr4-c8h2 (existing ignore) | react-router         | High          | 7.18.0 | 7.18.0 | Not reassessed; ignore lapses 2026-10-31T00:00Z       |

OSV `/v1/query` returns no advisories for @hono/node-server 2.1.3, 2.1.4 or
2.1.5, for i18next-http-backend 4.0.4 through 4.0.7, or for react-router
7.18.5. It still returns GHSA-gcqx-w48m-w2h4 for deepmerge 4.3.1 and
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
-   **No API test runs node-server.** Every API suite dispatches through
    `app.fetch` / `app.request`. The only mention of `@hono/node-server` under
    `test/` is a comment. A green API suite therefore says nothing about this
    bump.
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
-   **Outcome:** `packages/api`'s pin `2.0.10` → **`2.1.3`**, exact like the
    rest of that manifest (`.npmrc` has `save-exact=true`). There is one path, so
    no override.
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
    `mergeObject()` lets a source object poison the prototype of the object
    deepmerge returns. Run against the installed 4.3.1, with a source parsed from
    `{"__proto__":{"polluted":"yes"}}`:
    -   `deepmerge({}, src)`, and `deepmerge.all([src])` (vanilla-extract's call
        shape, which starts from `{}`): not poisoned. `'__proto__' in {}` is true,
        so the key is skipped as unsafe.
    -   `deepmerge({ a: 'str' }, { a: src }).a` and
        `deepmerge(Object.create(null), src)`: the result inherits `polluted`.
        The `in` check throws, or is false, on a primitive or null-prototype
        target, so the key is written.
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
-   **Our tree:** not reachable. Both paths run at build time, on input written
    in this repo.
    -   **vanilla-extract.** The one call is
        `deepmerge.all(styleRules, { arrayMerge })` in `composedStyle()`, which
        backs `style([...])`. It runs when `@vanilla-extract/vite-plugin`
        evaluates our `.css.ts` / `.css.tsx` files in Node, during `vite build`
        or `vite dev`. Its inputs are style objects in our source.
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
    -   @vanilla-extract/css **1.21.3** (2026-10-08) dropped deepmerge, so a bump
        would remove the first path.
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
    lapsing at 00:00 that day (see the next section).
    -   It is not mirrored in `.trivyignore` or `pnpm.auditConfig.ignoreGhsas`.
        Trivy's gate is CRITICAL/HIGH with `ignore-unfixed`, and
        `pnpm audit --prod --audit-level high` reports it as "1 low" and passes.
    -   An entry in either would silence nothing today. If GitHub ever re-rates
        the advisory, those gates should fail and prompt a fresh look.
-   **Plan:**
    1. Move `@vanilla-extract/css` to ≥ 1.21.3 in its own change, with a visual
       check of the client.
    2. Watch `@rollup/plugin-node-resolve` / `workbox-build` for a release
       without deepmerge, and deepmerge for a fix.
    3. Re-check by 2027-01-28. The entry should be deleted once neither path
       resolves deepmerge ≤ 4.3.1.
-   **Source:** OSV and GitHub advisory files; deepmerge 4.3.1 source; PoC run;
    `@vanilla-extract/css` 1.20.1 `dist`; the npm registry for
    `@vanilla-extract/css`, `@rollup/plugin-node-resolve` and `workbox-build`;
    the client build's `dist`.

## react-router ignore (GHSA-qwww-vcr4-c8h2): lapses 2026-10-31T00:00Z

**Not changed here.** Renewing the ignore, or doing the migration it defers, is
the operator's decision. This section records when it lapses, what happens
then, and one fact the entry does not reflect.

-   **When it lapses (measured).** osv-scanner v2.3.3 treats `ignoreUntil` as
    the moment the date begins, not the end of that day.
    -   In a scratch copy of this branch, at 20:01 UTC on 2026-10-30, the entry
        with `ignoreUntil = 2026-10-30` no longer applied. The scan exited 1 and
        printed `osv-scanner.toml has unused ignores: GHSA-qwww-vcr4-c8h2` plus
        the row react-router 7.18.0, CVSS 7.1, fixed version 7.18.2.
    -   With `2026-10-31`, the entry's real value, it still applied.
    -   So **the entry stops applying at 2026-10-31T00:00 UTC**, a few hours
        after this record was written, not on 2026-11-01. I tested only in UTC,
        which is what GitHub's runners use.
-   **What happens if nothing is done:**
    -   From then on, `ci.yml`'s **Dependency audit** and `security.yml`'s
        **Dependency vulnerability audit** (its osv-scanner step) fail on every
        PR and on `develop`. With this branch, the failure is that one row.
    -   Neither Trivy nor `pnpm audit` reports it then: `.trivyignore` and
        `pnpm.auditConfig.ignoreGhsas` list GHSA-qwww-vcr4-c8h2 with no expiry.
        (Trivy is red on develop for other reasons; see Verification.)
    -   So only the OSV gates enforce the deadline.
-   **The entry's premise is out of date.** The entry's comment, its `reason`,
    and `docs/migrations/react-19-and-react-router-8.md` all say the fix is
    react-router 8, whose whole line requires React ≥ 19.2.7. But:
    -   OSV and GitHub now list two fixed ranges: **7.12.0 → 7.18.2** and 8.0.0 →
        8.3.0.
    -   react-router **7.18.2** (2026-07-28) is a patch release whose only
        changelog entry is "Harden RSC CSRF codepaths" (#15353), the PR the
        advisory cites.
    -   7.18.2 through **7.18.5** (2026-10-27, npm's `version-7` tag) peer
        `react >=18`. OSV returns no advisories for 7.18.5.
    -   So a patch bump inside 7.x, without React 19, now clears this advisory.
        The scanner's own row says so (fixed 7.18.2).
    -   GitHub's file was last modified 2026-08-07, two weeks after the ignore was
        written (2026-07-25). I did not check when the 7.x range was added.
-   **The choices** (none taken here):
    1. Bump react-router to ≥ 7.18.2 and delete the three ignores. 7.18.3 to
       7.18.5 also change URL and redirect validation, action-origin validation
       and route matching, so read those before taking 7.18.5.
    2. Renew the ignore, with a new date and a corrected rationale.
    3. Do nothing: both OSV gates are red from 2026-10-31T00:00Z.

---

## Found outside the gates (not changed here)

1. **A react-router 7.x fix exists**, per the section above. The decision is
   open, and `docs/migrations/react-19-and-react-router-8.md` still describes
   React 19 as the only fix.
2. **`ignoreUntil` lapses at the start of its date.** The image-size entries
   (`2026-11-30`) stop applying at 2026-11-30T00:00Z. Anyone setting a date
   should count to the day before.
3. **No API test runs `@hono/node-server`.** Every suite goes through
   `app.fetch` / `app.request`. A change to the adapter, or to how
   `src/index.ts` calls `serve()`, passes every API gate without the adapter
   running. This is the same gap the 2026-10-23 record found for nodemailer. A
   test that starts `serve()` on port 0, like the harness above, would close it.
   Not added here.
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

## Verification

All runs are local, on this branch unless the row says otherwise, with Node
22.22.0 and pnpm 9.15.4 (the pinned `packageManager`). Commands are as in
`ci.yml` and `security.yml`. The suites ran one at a time.

**Scans** (osv-scanner v2.3.3, `--lockfile=pnpm-lock.yaml`, 2026-10-30):

| Tree                                                         | Result                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| develop `ff7d08b` (`pnpm-lock.yaml` + `osv-scanner.toml`)    | exit 1: 4 vulns in 3 packages, the four rows CI reported; 3 filtered                                   |
| this branch, bumps only (no deepmerge entry)                 | exit 1: 1 row, deepmerge 4.3.1                                                                         |
| this branch                                                  | exit 0: "No issues found", 4 filtered, no unused-ignore line                                           |
| this branch, react-router `ignoreUntil` set to today (probe) | exit 1: unused ignore GHSA-qwww-vcr4-c8h2; 1 row, react-router 7.18.0 (what CI sees from 10-31 00:00Z) |

`pnpm audit --prod --audit-level high` (security.yml): exit 0, "4
vulnerabilities found, 1 low | 3 high (3 ignored)". The low one is deepmerge
(`--json`); the three ignored are image-size ×2 and react-router. The root
`guard:audit-clean` script (`--audit-level moderate`) also exits 0.

**Gates:**

The gates below ran on the tree committed as `a147f5c`, the dependency commit.
The next commit adds only this document and the `osv-scanner.toml` entry, which
nothing but the scans reads.

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

**Not verified:**

-   CI itself: nothing was pushed. Every result above is a local run.
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
    It runs the same `composedStyle` on the same repo-authored objects.
