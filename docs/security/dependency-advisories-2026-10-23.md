# Dependency advisory triage — 2026-10-23

PR #965 changed client code only and touched no dependency file. On 2026-10-23
it went red on two checks that `develop` passed on 2026-10-18:

-   **Dependency audit (no un-triaged advisories, any severity)** (`ci.yml`,
    osv-scanner on `pnpm-lock.yaml`): 17 advisories in 6 packages, plus the
    warning `osv-scanner.toml has unused ignores: GHSA-vfj7-8cjw-p6xm`.
-   **Trivy filesystem scan** (`security.yml`, CRITICAL/HIGH, production
    dependencies only): vite 8.0.16 in `pnpm-lock.yaml`, and Pillow 12.3.0 in
    `services/perturbation/requirements.txt`.

Every advisory was published between 2026-10-20 and 2026-10-22. The one
exception is zod's: published on 2026-10-01, but GitHub reviewed it only at
2026-10-23T18:26Z, and its OSV record changed at 18:30Z. Run on `develop`
(`291f593`), both checks fail the same way as on PR #965. Each finding below
is checked against this tree, and where something was not checked, that is
stated.

**Result:** every finding is fixed by a version bump. Three things go beyond
the bumps:

-   **The vite fix broke the client at runtime.** Every fixed vite 8 release
    builds a client that never mounts (e2e smoke 0/8; develop 8/8), and the build
    and bundle-size gates do not catch it. The cause is
    `vite-plugin-top-level-await`, which this bundle does not need. It is
    removed. The same removal is why the shipped bundle shrinks by 3.3 MB: the
    plugin had been un-minifying every chunk and breaking the source maps. See
    [the vite 8.1 section](#vite-81-and-vite-plugin-top-level-await-the-client-did-not-boot).
-   **sanitize-html 2.18.1, not the 2.18.0 the scan suggested.** 2.18.0
    introduced GHSA-c9rx-x947-fp3h, which is reachable with the client's
    sanitizer options.
-   **Eight more advisories landed while this was in progress** (2026-10-23,
    21:36–22:09 UTC), in fast-uri, nodemailer and serialize-javascript. They are
    fixed in separate commits.

One ignore was deleted because GitHub withdrew its advisory. Nothing was added
to `osv-scanner.toml`, `.trivyignore` or `pnpm.auditConfig.ignoreGhsas`.

---

## Method

**Advisory text and ranges.** Each ID came from two sources:

-   the OSV API (`api.osv.dev/v1/vulns/<id>`);
-   GitHub's own record in the `github/advisory-database` repository, fetched
    from `raw.githubusercontent.com`.

A script compared the affected ranges and withdrawal state from both sources.
They are identical for all 22 IDs (the 13 from the brief, GHSA-c9rx, and the 8
published during the work). Every candidate version was then re-queried
through OSV `querybatch` (results below the summary table).

**Versions.** The npm registry gave the versions, publish times and tarball
integrity. PyPI's JSON API gave the same for Pillow. Each tarball read for this
triage was checked against the registry's `sha512` integrity. The Pillow 13
wheel was checked against PyPI's `sha256`.

**Scanners.** CI's own versions, from their GitHub release binaries, each
checked against the release's checksum file:

-   osv-scanner **v2.3.3**, the version `osv-scanner-action@v2.3.3` runs.
-   Trivy **v0.69.3**, the default `version` of `trivy-action@v0.35.0`.

Both were run with CI's arguments: osv-scanner `--lockfile=pnpm-lock.yaml` from
the repo root; Trivy `fs --scanners vuln --severity CRITICAL,HIGH
--ignore-unfixed --pkg-types os,library --skip-dirs apps/blackout-server
--exit-code 1 --ignorefile .trivyignore`. Trivy scanned a `git archive` export
because CI's checkout has no `node_modules`. On `develop` (`291f593`) both
reproduce PR #965 exactly. Results after the fix are in
[Verification](#verification).

**Reachable** means the vulnerable code runs, in something this repo deploys,
on input an attacker controls. Where I ran the advisory's proof of concept,
the section says so. Otherwise the call is from reading the code path, and the
section says that instead.

---

## Summary

| Advisory                                                                                                                                                   | Package                      | GHSA severity                    | Was           | Now          | Reachable here                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------- | ------------- | ------------ | ------------------------------------------------------------- |
| GHSA-587h-7wmj-h5pm (CVE-2026-112942)                                                                                                                      | vite (bundled launch-editor) | High                             | 8.0.16, 7.3.5 | 8.1.6, 7.3.7 | Dev server only; Windows only                                 |
| GHSA-698v-4r3x-3vcv (CVE-2026-112943)                                                                                                                      | vite (bundled launch-editor) | Moderate                         | 8.0.16, 7.3.5 | 8.1.6, 7.3.7 | Dev server only; Windows only                                 |
| GHSA-r825-w8mm-5pxw (CVE-2026-112944)                                                                                                                      | vite (bundled launch-editor) | Moderate                         | 8.0.16, 7.3.5 | 8.1.6, 7.3.7 | Dev server only                                               |
| GHSA-9jrq-w75r-8gcw (CVE-2026-112945)                                                                                                                      | vite                         | Low                              | 8.0.16, 7.3.5 | 8.1.6, 7.3.7 | No: precondition absent                                       |
| GHSA-rq7h-c2jc-7f22 (CVE-2026-112946)                                                                                                                      | vite                         | Moderate                         | 8.0.16, 7.3.5 | 8.1.6, 7.3.7 | Dev server only; one precondition not assessed                |
| GHSA-qxg6-89mg-rqv8 (CVE-2026-112949)                                                                                                                      | @vitest/mocker               | Moderate                         | 4.1.11        | 4.1.12       | No: browser mode not used                                     |
| GHSA-xp26-3454-mjgp (CVE-2026-112950)                                                                                                                      | @vitest/mocker               | Moderate                         | 4.1.11        | 4.1.12       | No: browser mode not used                                     |
| GHSA-5r4p-p66f-jhc7 (CVE-2026-111757)                                                                                                                      | hono                         | Moderate                         | 4.13.7        | 4.13.11      | No: no `serveStatic` anywhere                                 |
| GHSA-x3q4-9hxx-gx8m (CVE-2026-113654)                                                                                                                      | sanitize-html                | Moderate                         | 2.17.7        | 2.18.1       | **Yes** (PoC run, impact bounded by the allowlist)            |
| GHSA-374f-7chj-9948 (CVE-2026-113657)                                                                                                                      | sanitize-html                | Low                              | 2.17.7        | 2.18.1       | No: allowlist drops the tags (PoC run)                        |
| GHSA-cv27-6wvh-8x7j (CVE-2026-113661)                                                                                                                      | sanitize-html                | Moderate                         | 2.17.7        | 2.18.1       | No: allowlist drops `meta` (PoC run)                          |
| GHSA-c9rx-x947-fp3h (CVE-2026-113650)                                                                                                                      | sanitize-html                | Moderate                         | not in tree   | avoided      | Would have been, on 2.18.0 (PoC run)                          |
| GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404)                                                                                                                       | zod                          | High                             | 4.3.6         | 4.6.6        | In principle; routes not mapped (measured)                    |
| 39 OSV records, 27 of them CRITICAL/HIGH in Trivy                                                                                                          | Pillow                       | 4 Critical, 23 High, 12 Moderate | 12.3.0        | 13.0.0       | Yes, for the decoder advisories; see the Pillow section       |
| GHSA-vfj7-8cjw-p6xm (CVE-2026-93687)                                                                                                                       | braces                       | withdrawn                        | 3.0.3         | 3.0.3        | Withdrawn by GitHub; ignore deleted                           |
| GHSA-85x2-q946-cp5h, GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w                                                                                              | nodemailer                   | Moderate ×3                      | 10.0.13       | 10.1.4       | In principle: registration accepts any non-empty email string |
| GHSA-333x-w4r6-6crp (CVE-2026-110725), GHSA-w74x-v6f9-j3xg (CVE-2026-110306), GHSA-wjr9-j795-jxcr (CVE-2026-110180), GHSA-xhq7-xmqj-769h (CVE-2026-110095) | fast-uri                     | Low, Moderate, Moderate, Low     | 3.1.8         | 3.1.9        | Not assessed; build-time and Companion-module ajv only        |
| GHSA-m5mm-p8h7-m29v (CVE-2026-115897)                                                                                                                      | serialize-javascript         | Low                              | 7.0.5         | 7.1.3        | No: build-time (workbox-build's terser plugin)                |

The last three rows were published 2026-10-23 between 21:36 and 22:09 UTC,
after the first clean post-fix scan at about 21:25.

OSV `querybatch` for each version now in the tree returns no advisories: vite
8.1.6 and 7.3.7, vitest, @vitest/mocker and @vitest/spy 4.1.12, hono 4.13.11,
sanitize-html 2.18.1, zod 4.6.6, nodemailer 10.1.4, fast-uri 3.1.9,
serialize-javascript 7.1.3 and Pillow 13.0.0. sanitize-html 2.18.0 returns
GHSA-c9rx-x947-fp3h. braces 3.0.3 now returns nothing.

---

## vite: 8.0.16 → 8.1.6 (client), 7.3.5 → 7.3.7 (legacy/blackout-web)

-   **What:** five advisories against vite's dev server, published 2026-10-20 and
    2026-10-21:
    -   GHSA-587h, GHSA-698v and GHSA-r825 are in launch-editor, which vite bundles
        for its `/__open-in-editor` route. launch-editor's own fix is 2.14.2.
        587h and 698v need Windows (an `existsSync` bypass and missing `%`
        escaping). r825 needs an editor such as Vim or Emacs, plus an attacker who
        can create a file whose name starts with `+` or `-`.
    -   GHSA-rq7h: files outside `server.fs.allow` are served when an imported
        in-root path is also an absolute path on the host.
    -   GHSA-9jrq: cross-origin script execution when custom middleware passes the
        raw request URL to `server.transformIndexHtml`.
-   **Fixed in:** 8.1.6 / 8.2.4 / 8.3.3 / 7.3.7 / 6.4.4. The 8.0 line has no fix
    (8.0.16 is its last release), so **8.1.6** is the lowest fixed 8.x.
    **7.3.7** is the fix on the 7.3 line.
-   **Our tree:**
    -   `/__open-in-editor` is registered only inside vite's `_createServer` (the
        dev server), not in `preview()` or the build. Checked in
        `dist/node/chunks/node.js`.
    -   Production serves the static `dist` from nginx (`deploy/docker/Dockerfile`
        runs `pnpm client:build`), so no deployed component runs vite's server.
        CI's nav-audit job runs `vite preview` on `127.0.0.1` only.
    -   The client's active config is `apps/blackout-client/vite.config.js`. vite
        loads `.js` before `.ts`, and vitest.config.ts says the same. It sets
        `server.host: true` and `server.fs.allow: ['..']`. So a developer's
        `pnpm dev` listens on every interface, which puts the dev-server
        advisories on the developer's network.
    -   GHSA-rq7h has a second precondition: an imported file whose root-relative
        URL is also a readable absolute path on the host. I did not check that.
    -   GHSA-9jrq does not apply. `appType` is `'spa'`, which the advisory exempts.
        The config's only custom middleware serves one fixed wasm path and does not
        call `server.transformIndexHtml`. The SRI plugin, which has a
        `transformIndexHtml` hook, appears only in the unloaded `vite.config.ts`,
        and is `apply: 'build'` in any case.
    -   Trivy counts vite as a production dependency because
        `@vanilla-extract/vite-plugin` is in the client's `dependencies` and
        reaches vite through `@vanilla-extract/compiler`. It is still build-time
        code.
    -   `legacy/blackout-web` (archived, no CI job, not deployed) pinned vite
        7.3.2, lifted to 7.3.5 by an override.
-   **Outcome:**
    -   Direct ranges: the client's `vite` 8.0.16 → **8.1.6**; legacy's `vite`
        7.3.2 → **7.3.7**.
    -   Override floors raised: `vite@5.4.21` `^8.0.16` → `^8.1.6`, and
        `vite@7.3.2` `^7.3.5` → `^7.3.7`.
    -   `vite-node@6.0.0` declares `vite: ^8.0.0`, a range no override matches.
        pnpm still moved it to 8.1.6, and no vite 8.0.x or 7.3.5 is left in the
        lockfile.
    -   8.1 brings rolldown 1.0.3 → 1.1.5 (and its bindings), @oxc-project/types
        0.133 → 0.139 and picomatch 4.0.7.
    -   **Not sufficient on its own.** With `vite-plugin-top-level-await` still in
        the build, every fixed vite 8 release produces a client that does not
        boot. The plugin is removed first (next section).
-   **Source:** OSV and GitHub advisory files; vite 8.0.16 dist.

## vite 8.1 and vite-plugin-top-level-await: the client did not boot

The bumped tree passed the client build and the bundle-size gate. Because vite
is the bundler, I also ran CI's "Client e2e smoke (Playwright / chromium)" job
locally. It failed every test.

-   **What failed:** `CI=1 pnpm e2e`. Chromium was installed into a temp dir via
    `PLAYWRIGHT_BROWSERS_PATH`, and the suite serves `dist` through
    `vite preview`, as CI does.

    | Build                                               | Boots                              | e2e     |
    | --------------------------------------------------- | ---------------------------------- | ------- |
    | develop: vite 8.0.16 with the plugin                | yes                                | 8/8     |
    | vite 8.1.6 with the plugin                          | no: `TypeError: c is not iterable` | 0/8     |
    | vite 8.2.4 or 8.3.5 with the plugin (fresh exports) | no, same error                     | not run |
    | vite 8.0.16 without the plugin                      | yes                                | 8/8     |
    | vite 8.1.6 without the plugin (this branch)         | yes                                | 8/8     |

    The failing statement is the top-level loop in
    `features/room/MessageComposer.tsx` over `emojis` from `plugins/emoji.ts`.
    `emojis` is still `undefined` when that loop runs.

-   **Cause:** a latent bug in `vite-plugin-top-level-await` 1.6.0 (its latest
    release), exposed by rolldown 1.1's chunk graph. A diagnostic plugin ran the
    plugin's own `parseBundleInfo` on the exact bundle it receives:
    -   No chunk contains a top-level await.
    -   Chunks that contain a dynamic `import()` are still transformed. A
        transformed chunk that imports another transformed chunk has its whole body
        deferred behind `Promise.all([__tla_0]).then(async () => {…})`, so its
        exports are assigned asynchronously.
    -   A chunk with neither is left alone, and its top level reads those exports
        synchronously. In the 8.1 build, `joinDenWithCanopy` (MessageComposer)
        statically imports `useProfileActions` (emoji) and is on the boot path.
-   **How widespread** (acorn walk over the built chunks; module-evaluation-time
    reads of bindings that an untransformed chunk imports from a deferred one):
    -   8.1.6 with the plugin: **1**, the crash.
    -   develop: **4**, in `DeveloperSettings`, `HomeFeed`, `ReactPrism` and
        `src-*`, all reading from the deferred entry chunk. They are harmless only
        because those chunks load lazily, after the entry has finished.
    -   This branch: **0**.
    -   So the plugin has always produced these reads; the new chunk graph put one
        on the boot path. rolldown 1.1 now splits dynamic imports that 1.0 kept
        inline (8 `INEFFECTIVE_DYNAMIC_IMPORT` warnings → 1; 169 → 224 files).
-   **Why not keep the plugin and patch MessageComposer:**
    -   A lazy emoji map would cure the one read on the boot path. It would leave
        the mechanism in place, along with develop's four latent reads.
    -   The plugin has no work to do here. The bundle has no top-level await, and
        `build.target` is es2022, which runs top-level await natively.
    -   It also does harm (next bullet).
-   **What else the plugin did (measured):**
    -   Its `config` hook reads `config.build.minify` from the raw user config,
        which never sets it. So it re-prints every chunk through esbuild and SWC
        with `minify: false`. develop ships 264,108 lines (13.7 MB) of
        pretty-printed JS.
    -   A/B on vite 8.1.6, plugin in place, adding only `build.minify: 'oxc'`:
        25,376 KB against 28,548 KB. The remaining 156 KB to the plugin-free
        25,220 KB is its wrapper plumbing and minifier differences.
    -   It replaces chunk code without updating the source maps. 0 of 900 and 1
        of 900 sampled positions resolve on two plugin builds, against 664 of 900
        without it.
    -   Minifying alone does not fix the boot failure
        (`TypeError: Ka is not iterable`).
-   **Outcome:**
    -   `vite-plugin-top-level-await` is removed from
        `apps/blackout-client/vite.config.js`, the config `vite build` loads. The
        comment on `build.target` is corrected.
    -   `vite.config.ts` also lists the plugin, plus an SRI plugin, but no script
        loads it: the built `index.html` has no `integrity` attributes. It and the
        devDependency are left as they are, so the lockfile does not change.
        `tools/ci/check-deployment-readiness.mjs` requires the file to exist, so
        tidying it is a separate change.
    -   vitest uses `vitest.config.ts`, which never had the plugin, so the unit
        suites are unaffected.
-   **Bundle:** develop 28,660 KB → bumps alone (with the plugin) 28,548 KB →
    this branch **25,220 KB**. `MAX_BUNDLE_KB` stays 29696. Lowering it to the
    new size is a separate decision.

## @vitest/mocker: 4.1.11 → 4.1.12 (with vitest 4.1.12)

-   **What:**
    -   GHSA-qxg6: `interceptorPlugin` accepts mock registrations on the dev-server
        WebSocket without authentication, and interpolates the mock URL into
        generated code unescaped.
    -   GHSA-xp26: a Windows-only backslash bypass of the redirect allowlist,
        affecting 4.1.11 only.
    -   Fixed in 4.1.12 and 5.0.3.
-   **Our tree:** not reachable. In node mode, vitest 4.1.11 imports only
    `hoistMocksPlugin` and `automockPlugin` from `@vitest/mocker/node`;
    `interceptorPlugin` is used by browser mode. No `@vitest/browser*` package is
    installed (they are only optional peers in the lockfile). The client and
    legacy vitest setups run in node/jsdom, and their mock registrations come
    from our own test files.
-   **Outcome:** vitest pins each `@vitest/*` package exactly, so the bump goes
    through vitest:
    -   the client's `vitest` 4.1.11 → **4.1.12**; legacy's `^4.1.11` →
        **^4.1.12**;
    -   overrides `vitest@4`, `vitest@3` and `@vitest/mocker` raised to `^4.1.12`.
        4.1.12 is the last 4.x release (npm `V4` tag), so the caret cannot pull in a
        mismatched `@vitest/*` minor. `@vitest/coverage-v8` stays at 4.1.8, which is
        unchanged from `develop`.
-   **Source:** OSV and GitHub advisory files; vitest 4.1.11 `dist`.

## hono: 4.13.7 → 4.13.11

-   **What:** GHSA-5r4p. `serveStatic` decodes the request path a second time, so
    a malformed percent-encoding can route as one path and be served as another.
    That skips middleware mounted on a static prefix. Affects 4.12.4 up to
    4.13.11.
-   **Our tree:** not reachable. No tracked file uses hono's `serveStatic`
    (`hono/serve-static` or `@hono/node-server/serve-static`). The lockfile's
    `serve-static@1.16.3` is Express's unrelated package. hono is used only by
    `packages/api`.
-   **Outcome:**
    -   The generic override `hono` `^4.13.5` → **`^4.13.11`**. It replaces every
        hono specifier, so it decides the version.
    -   `packages/api`'s manifest still said `4.12.34` and is raised to match
        (`^4.13.11`), as was done for nodemailer in `64d86f9`.
    -   4.13.12 and 4.13.13 exist and have no advisories. 4.13.11 is the smallest
        fix. Compared with 4.13.7, 4.13.11's `serveStatic` rejects any path that
        still contains `%` after routing
        (`if (!options.allowPercentInPath && c.req.path.includes("%")) throw`).
        That is the second decode the advisory describes.
-   **Source:** OSV and GitHub advisory files; hono 4.13.7 and 4.13.11 tarballs.

## sanitize-html: 2.17.7 → 2.18.1

Here the attacker controls the input. `RenderBody.tsx` renders every message's
`formatted_body` as `parse(sanitizeCustomHtml(customBody))`. The composer's
`htmlToEditorInput` (`components/editor/input.ts`) also sanitizes HTML before
loading it into the editor. The options are in
`apps/blackout-client/src/app/utils/sanitize.ts`:

-   `disallowedTagsMode: 'discard'`;
-   `nonTextTags` with `noscript` and `mx-reply`;
-   `div` and `img` allowed;
-   `nestingLimit: 100`.

Each PoC below ran with a copy of those exact options against sanitize-html
2.17.7, 2.18.0 and 2.18.1, each with the dependency versions the lockfile
gives it (htmlparser2 12.0.0).

-   **GHSA-x3q4** (fixed 2.18.0): an implied close of an ancestor ends the
    `nonTextTags` discard region early.
    -   **Reachable.** On 2.17.7,
        `<div><noscript></div><img src="mxc://evil.test/beacon"></noscript>`
        comes out as `<div></div><img src="mxc://evil.test/beacon" />`. On 2.18.1
        it comes out as `<div></div>`.
    -   The impact is bounded. Whatever escapes still passes the same allowlist, so
        a sender gets nothing they could not have sent without the `<noscript>`
        wrapper.
    -   The `mx-reply` form behaves the same on every version. `mx-reply` is not a
        raw-text element in browsers, so the fix rightly leaves it alone.
-   **GHSA-374f** (introduced 2.17.7, fixed 2.18.0): a namespace prefix
    (`svg:animate`) bypasses the SMIL check. **Not reachable:** on every version
    the client's allowlist drops `svg` and `svg:animate` and leaves a plain
    `<a href="#safe">`.
-   **GHSA-cv27** (fixed 2.18.0): a `meta http-equiv=refresh` `content` URL is
    never scheme-checked. **Not reachable:** `meta` is not allowed, and the
    output is empty on every version.
-   **GHSA-c9rx-x947-fp3h** (CVE-2026-113650, Moderate; introduced 2.18.0, fixed
    2.18.1): re-sanitizing a discarded `<iframe>`'s fallback recurses without
    bound.
    -   The scan named 2.18.0 as the fix for the three above. Its precondition is
        `disallowedTagsMode: 'discard'` with `iframe` not allowed, which is the
        client's configuration.
    -   With the client's options, **2.18.0 throws
        `RangeError: Maximum call stack size exceeded` on
        `'<iframe>'.repeat(2000)`** (16 KB). It also lets `nestingLimit: 100` reach
        a nesting depth of 600.
    -   On 2.18.1 neither happens: the same inputs return normally, with depth 98.
    -   So 2.18.0 would have let any sender break message rendering with one small
        message, and it would have kept the audit red.
-   **Behaviour change** (2.18.0, sanitize-html #5550): text inside a discarded
    `<iframe>` is now sanitized as HTML instead of escaped.
    `<iframe><b>bold</b></iframe>` renders as **bold** where 2.17.7 showed the
    escaped tags. The output still passes the same allowlist. Past eight nested
    iframes, 2.18.1 escapes the rest as text.
-   **Outcome:**
    -   The client's direct `sanitize-html` `2.12.1` → **`2.18.1`**. The manifest
        was stale; the lockfile already held 2.17.7 through the override.
    -   The `sanitize-html@2.12.1` override is raised from `^2.17.7` to
        `^2.18.1`. pnpm 9 matches a selector against any range that _intersects_
        it (`isIntersectingRange` in `@pnpm/hooks.read-package-hook`), so the key
        still floors any sanitize-html range that includes 2.12.1.
    -   Lockfile side effects: launder 1.7.1 → 1.7.2, plus is-plain-object 5.1.0
        and dayjs 1.11.23.
    -   2.18.1 declares `postcss ^8.5.27`, but the root override
        `"postcss@8": "^8.5.23"` rewrites that range, so the lockfile keeps postcss
        8.5.23. OSV has no advisory for 8.5.23. I left this alone: it is outside
        this change and would move postcss across the whole tree.
-   **Source:** OSV and GitHub advisory files; sanitize-html 2.17.7 / 2.18.0 /
    2.18.1 tarballs (diffed); PoC runs.

## zod: 4.3.6 → 4.6.6

-   **What:** GHSA-mrhx (CVE-2023-54404, High). zod through 4.6.5 builds one issue
    object per failing element of an oversized array, so a large body can exhaust
    memory.
-   **What the fix does:** read in the 4.6.6 source and measured.

    -   A collection with a size cap (`.max()` or `.length()`) now fails on the cap
        before any element is parsed (`capSize`).
    -   `abortEarly` is set only in `core/parse.ts`'s boolean
        `validate`/`validateAsync` paths. It is not set by `parse` or `safeParse`,
        and `safeParse` is what `packages/api/src/middleware/validate.ts` uses.
    -   Measured with 500,000 non-string elements (about 1 MiB of JSON):

        | Schema                         | zod 4.3.6                            | zod 4.6.6                       |
        | ------------------------------ | ------------------------------------ | ------------------------------- |
        | `z.array(z.string()).max(100)` | 500,001 issues, 3.9 s, +540 MiB heap | 1 issue (`too_big`), 1 ms       |
        | `z.array(z.string())`          | 500,000 issues, 3.2 s, +539 MiB      | 500,000 issues, 1.0 s, +152 MiB |

-   **Our tree:** reachable in principle.
    -   `packages/api` validates request bodies with zod: 46 `z.array(` call sites
        in 22 files.
    -   24 of those carry `.max()` or `.length()` on the same line. This is a
        line-based count, so it misses multi-line chains. 4.6.6 fixes those 24.
    -   The rest stay linear in body size, and the global body limit is 16 MiB
        (`middleware/body-limit.ts`).
    -   I did not map which of those routes an unauthenticated caller can reach.
-   **Outcome:** `packages/api`'s `zod` `^4.3.6` → **`^4.6.6`**. 4.6.7 differs
    from 4.6.6 only in its version strings (tarball diff).
-   **Residual:** request-body arrays without `.max()` are still a resource cost
    that scales with body size, after the fix as before it. Candidate follow-up.
-   **Source:** OSV and GitHub advisory files; zod 4.3.6 and 4.6.6 tarballs;
    measurement.

## Pillow: 12.3.0 → 13.0.0 (services/perturbation)

-   **What:** OSV lists 39 advisories for 12.3.0, all fixed in 13.0.0:
    -   **4 Critical:**
        -   GHSA-8g5g-8vmr-9782 / CVE-2026-112403 (JPEG decoder heap overflow);
        -   GHSA-v9pv-5gc8-w2m6 / CVE-2026-96639 (stale storage after a mode
            transition in multi-frame loaders);
        -   GHSA-332p-7hrc-92wf / CVE-2026-112393 (TIFF encoder heap overflow);
        -   GHSA-w889-685w-c8fh / CVE-2026-112900 (argument injection into
            Ghostscript).
    -   **23 High and 12 Moderate.** The High set includes GHSA-g7cr-3p24-7wf7 /
        CVE-2026-96778, a JPEG encoder overflow when a comment follows an ICC
        profile.
    -   Trivy's 27 (CRITICAL/HIGH) are the 4 + 23. OSV returns nothing for
        13.0.0. PyPI: 13.0.0 was uploaded 2026-10-16 and is the latest release.
-   **Our tree:** `infra/single-server-baseline/docker-compose.yml` builds and
    runs this sidecar. The API proxies `POST /v1/media/perturb` to it for
    authenticated, rate-limited, Pro-entitled users. The proxy checks the
    _declared_ mimetype but not the bytes.
    -   `app.py` calls `Image.open(io.BytesIO(raw))` with no `formats=`. Any of
        the 43 decoders Pillow 13 registers here (`Image.OPEN`) can run on
        attacker bytes. The declared mimetype only chooses the output encoder.
    -   **Reachable: the decoder advisories** for formats `Image.open` accepts,
        e.g. JPEG, TIFF, GIF, BMP RLE, MSP and XBM. I classified them from the
        advisory summaries and app.py's call graph; no Pillow PoC was run.
    -   **Not reached by this service's calls:**
        -   The TIFF, PDF and GIF _encoders_: the service only encodes JPEG, PNG or
            WebP.
        -   The JPEG encoder's comment/ICC path (GHSA-g7cr): the output is a fresh
            `fromarray` image with no ICC profile or comment.
        -   The APIs app.py never calls: `merge`, `transform`, `quantize`, rank
            filters, ImageMorph, ImageFont, TarIO and PdfParser.
    -   **Gated on things the image does not have** (from the Dockerfile; not
        checked in a built image):
        -   EPS needs Ghostscript (GHSA-w889, GHSA-vx6w). Pillow registers EPS, but
            decoding calls `gs`, and the Dockerfile installs only libjpeg, libwebp and
            zlib.
        -   MIC needs `olefile`, which is not in the requirements.
        -   WMF/EMF rendering is Windows-only.
    -   Multi-frame advisories that need `seek()` (SPIDER, MPO/DCX, GIF, APNG and
        GHSA-v9pv) were not assessed in detail. The service only loads frame 0.
-   **Pillow 13 compatibility:**
    -   Removals in 13.0.0, from the 13.0.0 tag's `docs/releasenotes/13.0.0.rst`
        and `deprecations.rst`: Python 3.10 support, saving I-mode PNG, the
        dtype-changing use of `fromarray(mode=...)`, `Image.Image.get_child_images`,
        `Image._show`, the ImageCms `product_name` and `product_info` attributes,
        and `ExifTags.IFD.Makernote`.
    -   app.py uses `Image.open`, `convert("RGB")`, `np.asarray`,
        `Image.fromarray(uint8 (h, w, 3), mode="RGB")` and
        `save(format=JPEG|PNG|WEBP, quality=92)`.
    -   The only overlap is `fromarray(mode=...)`, and app.py's call is the
        retained case: the mode matches the array's dtype.
    -   A probe confirms the difference. For a dtype-changing mode, 12.3.0 warns
        and 13.0.0 raises `ValueError: Invalid mode for data type`. app.py's call
        returns RGB without a warning on both.
    -   The Dockerfile's `python:3.11-slim` meets 13.0.0's `requires_python >=3.11`,
        and PyPI has cp311 manylinux_2_28 wheels for x86_64 and aarch64.
    -   The service has no test suite. I built two Python 3.11.17 venvs from
        `requirements.txt` (12.3.0 and 13.0.0) and drove the real `app.py` with 16
        cases.
    -   The 12 success cases cover JPEG/PNG/WebP, RGBA, grey, palette, CMYK, 1×7,
        2000×1500, GIF bytes declared as PNG, and PNG bytes declared as JPEG. The 4
        error cases are garbage (422), a bad mimetype (415), bad base64 (400) and
        more than 8 MiB (413).
    -   In-process with `python -W error` (a warning inside the handler would have
        surfaced as a 422), and over HTTP through `uvicorn app:app` as the
        container runs it: 16/16 on both versions.
    -   All 12 success outputs are pixel-identical (max difference 0) and the same
        size across 12.3.0 and 13.0.0.
    -   No Docker daemon was available, so **the image itself was not built**.
-   **Outcome:** `pillow==12.3.0` → **`pillow==13.0.0`**. No code change was
    needed.
-   **Hardening, not done here:** `Image.open(..., formats=["JPEG", "PNG",
"WEBP"])` would shut out the 40 other decoders, as GHSA-vp6v did for Synapse's
    thumbnailer (`upstream-advisory-triage-2026-10-09.md`). It changes
    behaviour: GIF bytes declared as PNG are accepted today. So it belongs in its
    own change.
-   **Source:** OSV `/v1/query` for 12.3.0, 13.0.0 and 10.1.0; PyPI JSON and
    wheel sha256; Pillow docs at tag 13.0.0; smoke runs.

## Withdrawn: GHSA-vfj7-8cjw-p6xm (braces) — ignore deleted

-   **Why it stopped matching:**
    -   GitHub withdrew the advisory on **2026-10-23T12:53:02Z** ("not a practically
        exploitable vulnerability"). OSV and the `github/advisory-database` file
        both carry the withdrawal.
    -   braces is still 3.0.3 in the lockfile. Nothing was fixed or removed;
        the scanner no longer reports a withdrawn ID.
    -   OSV `querybatch` for braces 3.0.3 returns nothing.
    -   `pnpm audit --prod --audit-level high` no longer reports braces either. Its
        "3 high (3 ignored)" are image-size ×2 and react-router (`--json`).
-   **Outcome:** the `[[IgnoredVulns]]` block in `osv-scanner.toml` is deleted,
    with a note in the style of the brace-expansion one. Its mirror in
    `pnpm.auditConfig.ignoreGhsas` (added by `8eb0bf2` so the two gates agree)
    goes too. `.trivyignore` never listed it.
-   **Why delete rather than keep:** a dead ignore with no written reason is a
    silent baseline. If the advisory is ever reinstated, the scan should fail
    loudly.

## Published during the work: nodemailer, fast-uri, serialize-javascript

The first scan after the fix (osv-scanner v2.3.3, about 21:25 UTC) was clean.
A re-run at 02:10 UTC on 2026-10-24 found eight new advisories, published
between 21:36 and 22:09 UTC. Each is in OSV and GitHub with identical ranges,
and each has a fixed release, so the house rule applies: bump, don't triage.
They have their own commits, which can be dropped if the original scope is
preferred. All are Moderate or Low, so Trivy's CRITICAL/HIGH gate never saw
them; only the any-severity audit did.

-   **nodemailer 10.0.13 → 10.1.4** (GHSA-85x2-q946-cp5h, GHSA-8c8m-p3m8-cjg8,
    GHSA-m943-m63m-w62w, all Moderate).
    -   **What:** `addressparser` reads a recipient other than the one the header
        names. A `>` inside a quoted local part, a nested comment, or a `;` inside
        a quoted group display name lets text become a live address.
    -   **Our tree:** reachable in principle.
        -   `packages/api` sends mail through `createTransport` / `sendMail`
            (`integrations/smtp.ts`) with `to: message.to`.
        -   Registration and password reset accept `email: z.string().min(1)`
            (`routes/auth.ts:149`, `:165`, `:876`) and mail that stored string
            (`:890`, `:979`).
        -   zod's `.email()` would reject every advisory payload (checked), but the
            API never uses it.
        -   So a crafted registered address can have mail delivered to a domain other
            than the one it names. Whether anything trusts a verified address's
            domain was not assessed.
    -   **Outcome:**
        -   The override `nodemailer` and `packages/api`'s range both move from
            `^10.0.9` to `^10.1.4`. The lockfile resolves 10.1.4, the smallest fix;
            10.2.1 is the latest.
        -   10.0.14–10.1.4 are hardening releases (addressparser, SMTP timeouts and
            421 handling, error codes).
        -   The API's smtp-mailer, failover-mailer, resend-mailer and
            email-verification suites pass 22/22 on 10.1.4. These include the retry
            and error-classification cases that read nodemailer's error codes. The
            full API suites pass too (see [Verification](#verification)).
-   **fast-uri 3.1.8 → 3.1.9** (GHSA-333x-w4r6-6crp Low, GHSA-w74x-v6f9-j3xg
    Moderate, GHSA-wjr9-j795-jxcr Moderate, GHSA-xhq7-xmqj-769h Low).
    -   **What:** scheme injection and spoofing, host confusion, and path
        equivalence in `serialize`, `normalize` and `resolve`.
    -   **Our tree:** reached only through ajv 8.18.0, used by `workbox-build`
        (build-time service-worker generation) and `@companion-module/base`
        (`packages/companion-blackout`). ajv uses fast-uri to resolve schema
        identifiers. I did not trace whether any deployed path runs attacker data
        through it: not assessed.
    -   **Outcome:** override `fast-uri@3` `^3.1.8` → `^3.1.9`. 3.1.9 is the last
        3.x release (npm `three` tag).
-   **serialize-javascript 7.0.5 → 7.1.3** (GHSA-m5mm-p8h7-m29v /
    CVE-2026-115897, Low).
    -   **What:** XSS when a serialized function's source ends in a bare
        `</script`.
    -   **Our tree:** not reachable. Its only consumer is `@rollup/plugin-terser`
        under `workbox-build`, which serializes terser options at build time and
        never embeds output in HTML.
    -   **Outcome:** override `serialize-javascript@6.0.2` `^7.0.5` → `^7.1.3`.
        7.1.4 exists, with tighter function-classification regexes and no advisory.
-   **Source:** OSV and GitHub advisory files; npm registry; nodemailer 10.1.4
    `CHANGELOG.md`; serialize-javascript 7.1.3 / 7.1.4 tarball diff.

---

## Found outside the gates (not changed here)

1. **The Synapse fork pins Pillow 10.1.0, and production runs it.**
    - `apps/blackout-server/pyproject.toml` says `Pillow = ">=10.0.1"`, and
      `poetry.lock` resolves `pillow` 10.1.0.
    - The single-server baseline deploys this fork as `blackout-synapse:stable`.
      It is built from `apps/blackout-server/docker/Dockerfile`, which
      `poetry export`s the lock (`infra/single-server-baseline/docker-compose.yml`,
      `RUNBOOK.md`).
    - OSV has 66 records for 10.1.0. They include CVE-2023-50447 (Critical,
      arbitrary code execution, fixed 10.2.0), CVE-2024-28219 (fixed 10.3.0),
      the July 2026 batch (fixed 12.3.0) and the batch above (fixed 13.0.0).
    - Synapse's thumbnailer decodes remote media, and the baseline sets
      `dynamic_thumbnails: true`. The 2026-10-09 port restricts it to JPEG, PNG,
      WebP and GIF.
    - Trivy does not see any of this: `security.yml` skips `apps/blackout-server`
      on the grounds that "production runs the upstream matrixdotorg/synapse
      image". That is true of `deploy/docker/blackout-backend`
      (`ghcr.io/element-hq/synapse:v1.130.0`), but not of the single-server
      baseline.
    - The fix is not a lockfile edit. The fork declares `python = "^3.8.0"`, and
      Pillow 13 requires Python ≥ 3.11, so poetry cannot lock a fixed Pillow
      without raising the fork's Python floor. The fork's Dockerfiles already
      build on 3.11.
      That change sits outside `blackout_runtime/` and needs its own `PATCHES.md`
      entry and a Synapse test run. **Recommended as the next change.**
2. **`security.yml`'s `skip-dirs` comment is wrong for the baseline**, per item
    1. Either scan the fork's lockfile or correct the comment.
3. **Peer warnings from intersecting override selectors.** `vite@7.3.2` also
   matches every vite peer range that contains 7.3.2. So @vitest/mocker's,
   vitest's and vite-plugin-static-copy's `^6 || ^7 || ^8` peers are rewritten
   to `^7.3.7`, and pnpm warns "unmet peer vite@^7.3.7: found 8.1.6" for the
   client. `develop`'s lockfile records the same rewrite at `^7.3.5`
   (`@vitest/mocker@4.1.11` peer `vite: ^7.3.5`, resolved against 8.0.16).
   Peers still resolve to the client's own vite, but the selectors reach
   further than their keys suggest.
4. **zod arrays without `.max()`** in request schemas; see above.
5. **Request emails are not validated as addresses.** `routes/auth.ts`
   accepts `z.string().min(1)` and mails it. nodemailer 10.1.4 closes the three
   addressparser advisories, but validating the address at registration would
   close the class. It is behaviour-changing, so it is not done here.
6. **The perturbation sidecar decodes any Pillow format.** See the Pillow
   section (`formats=` allowlist).
7. **Bundle budget.** The client is now 25,220 KB against `MAX_BUNDLE_KB`
   29696 (develop: 28,660 KB). Tightening the budget is a separate call. I
   did not check whether the plugin un-minified the vite 6 build that the
   earlier re-baselines compared against.
8. **Only the e2e smoke job sees a client that does not boot.** The build and
   bundle-size jobs both passed on a bundle that never mounted.

## Verification

All runs below are at `5324597`, the last dependency commit; the next commit
is this document. Commands are as in `ci.yml`. Node 22.22.0 and pnpm 9.15.4
(the pinned `packageManager`).

**Scans:**

| Check                                                      | develop `291f593` (2026-10-23, about 21:20 UTC)                              | this branch (2026-10-24, 02:10–02:25 UTC)                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| osv-scanner v2.3.3 `--lockfile=pnpm-lock.yaml`             | exit 1: 17 vulns in 6 packages, unused ignore GHSA-vfj7                      | exit 0: "No issues found", 3 filtered, no unused-ignore line                                                      |
| Trivy v0.69.3 (`security.yml` flags), `git archive` export | exit 1: pnpm-lock 1 (vite CVE-2026-112942), requirements.txt 27 (4 C / 23 H) | exit 0: 0 / 0 / 0, with the DB the "before" run used (2026-10-23T19:15Z) and with a fresh one (2026-10-24T01:18Z) |
| `pnpm audit --prod --audit-level high`                     | not run                                                                      | exit 0: "3 high (3 ignored)" (image-size ×2, react-router)                                                        |

develop's audit was measured before the eight overnight advisories existed;
run today it would also report them.

In both Trivy runs `.trivyignore` suppressed the same three as before:
GHSA-qwww-vcr4-c8h2 and image-size's CVE-2025-71329 / CVE-2025-71330.

**Gates** (sequential, in CI order):

| Gate                   | Command                                                                                                         | Result                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| install                | `pnpm install --frozen-lockfile` (and `--force`)                                                                | pass                                                                                                                                            |
| workspace builds       | `pnpm --filter @blackout/core run build`, `… @blackout/design run build`                                        | pass                                                                                                                                            |
| client lint            | `pnpm --filter @blackout/client exec eslint "src/**/*.{ts,tsx}" --max-warnings=0`                               | pass                                                                                                                                            |
| client types           | `pnpm --filter @blackout/client run typecheck`                                                                  | pass                                                                                                                                            |
| client unit + coverage | `pnpm --filter @blackout/client run test:coverage`                                                              | 503 files; 3270 passed, 3 skipped (the three existing `it.skip`); coverage 44.48 / 35.51 / 35.3 / 45.5 against floors 41.3 / 32.2 / 32.5 / 42.3 |
| client smoke           | `pnpm --filter @blackout/client run test:integration`                                                           | 3 files, 13 passed                                                                                                                              |
| client build + size    | `pnpm --filter @blackout/client run build`; `du -sk --exclude='*.map' dist`                                     | pass; **25,220 KB** ≤ 29,696 (develop 28,660)                                                                                                   |
| client e2e smoke       | `CI=1 pnpm e2e`                                                                                                 | 8 passed (develop 8; vite 8.1 with the plugin 0)                                                                                                |
| API lint               | `pnpm --filter @blackout/api run lint`                                                                          | pass                                                                                                                                            |
| API types              | `pnpm --filter @blackout/api run typecheck`                                                                     | pass                                                                                                                                            |
| migrations             | `node tools/ci/check-db-migrations.mjs`; `node tools/ci/verify-migrations-ephemeral.mjs`                        | OK (101 migrations); round-trip stable (155 tables)                                                                                             |
| API, PR gate           | `BLACKOUT_DB_MODE=memory BLACKOUT_API_SKIP_LISTEN=1 NODE_ENV=test pnpm --filter @blackout/api test:integration` | 1788 / 1788, 0 skipped                                                                                                                          |
| API, launch smoke      | same env, `test:launch-smoke`                                                                                   | 14 / 14                                                                                                                                         |
| API, post-merge        | `cd packages/api && npx tsx --test --test-force-exit --test-concurrency=1 test/**/*.test.ts`, no `BLACKOUT_*`   | 1904 / 1904, 0 skipped (all 245 files: bash passes the glob through and Node expands it)                                                        |
| mobile                 | `pnpm --filter blackout-mobile run preflight`, `typecheck`, `test`, `build`                                     | pass; tests 18 / 18; `build` (the client build via `build:web`) passes                                                                          |
| room encryption        | `node tools/ci/check-room-encryption.mjs`; `node --test tools/ci/check-room-encryption.test.mjs`                | OK (10 call sites); 12 / 12                                                                                                                     |
| prettier               | `npx prettier --check --ignore-unknown` on every changed file                                                   | pass (`legacy/` and the lockfile are prettier-ignored; the `.toml` and `.txt` have no parser; this file is formatted by the commit hook)        |

**Not verified:**

-   The perturbation Docker image was not built: no Docker daemon. Pillow 13
    was exercised in Python 3.11.17 venvs built from `requirements.txt`.
-   No Synapse (Python) tests were run. Nothing under `apps/blackout-server` was
    changed.
-   The reachability statements marked "not assessed" above.
