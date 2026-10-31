# Dependency advisory triage — 2026-10-31

GitHub published two Moderate advisories at 23:09Z on 2026-10-30, one for
glob and one for minimatch. They turn both OSV gates red: **Dependency audit
(no un-triaged advisories, any severity)** in `ci.yml`, and the OSV step of
`security.yml`'s **Dependency vulnerability audit**. osv-scanner has no
severity threshold, so a Moderate fails them. At 00:58Z on 10-31 the scan of
`741f903442` exited 1 with five rows:

| Advisory            | CVSS (v4) | Package   | Version | Fixed  |
| ------------------- | --------- | --------- | ------- | ------ |
| GHSA-3g3m-2fjr-6pw4 | 6.3       | glob      | 11.1.0  | 14.0.2 |
| GHSA-3g3m-2fjr-6pw4 | 6.3       | glob      | 13.0.6  | 14.0.2 |
| GHSA-g3hv-75wg-m249 | 6.9       | minimatch | 10.2.5  | 11.0.1 |
| GHSA-g3hv-75wg-m249 | 6.9       | minimatch | 3.1.5   | 11.0.1 |
| GHSA-g3hv-75wg-m249 | 6.9       | minimatch | 5.1.9   | 11.0.1 |

`pnpm audit` saw minimatch too. At 00:58Z `pnpm run guard:audit-clean`
(`pnpm audit --prod --audit-level moderate`) exited 1: minimatch 3.1.5 is on
42 production paths, all through `packages/ui` → react-native 0.82.1. The
2026-10-30 record has that script green between 23:50Z and 00:11Z, with no
Moderate in its count. No workflow runs it. `security.yml`'s
`pnpm audit --prod --audit-level high` passed. Trivy's gate is CRITICAL/HIGH,
so neither advisory can fail it.

**Result:**

-   **glob 11.1.0 and 13.0.6 → 14.0.3**, by one override,
    `"glob@>=9 <14.0.2": "^14.0.3"`. No consumer has a release that takes a
    fixed glob. The floor is 14.0.3, not 14.0.2: glob 14 runs its own bundled
    copy of minimatch, and 14.0.2's copy is minimatch 11.0.0's code, which
    still has the minimatch flaw. 14.0.3's copy has 11.0.1's fix.
-   **minimatch 10.2.5 is gone.** Its only consumers were those two globs.
    glob 14.0.3 depends on minimatch `^11.0.2` (11.0.3).
-   **minimatch 5.1.9 → 11.0.3**, by `"minimatch@5": "^11.0.3"`. 5.1.9 does
    not contain the flawed code, and nothing here loads its consumer. But its
    one consumer, filelist 1.0.6, calls only `minimatch.match()`, and it
    returns the same file lists with 11.0.3 (harness below). An override that
    works comes before an ignore.
-   **minimatch 3.1.5 is ignored**, until 2026-12-01. It does not contain the
    flawed code, which first appears in minimatch 7.0.0. The 3.x line has no
    fix, and its consumers (glob 7.2.3, test-exclude 6.0.0, eslint 8's tooling)
    cannot take 11. The entry is mirrored in `pnpm.auditConfig.ignoreGhsas`
    for `guard:audit-clean`, and not in `.trivyignore`.
-   **Neither advisory is reachable here, before or after.** Nothing in this
    repository passes an `AbortSignal` to glob, and the patterns that reach
    glob or minimatch come from repository config and dependency defaults. The
    two glob consumers load glob but never call it (traced).
-   **After the change** the OSV scan exits 0 in UTC, UTC+3 and UTC+14 ("No
    issues found", 4 filtered), and both `pnpm audit` commands exit 0. The
    client build is byte-identical to `741f903442`'s, all 390 files.

The lockfile drops 9 packages and adds 4 (Lockfile). Nothing was added to
`.trivyignore`.

---

## Method

**Advisory text and ranges.** Each ID came from two sources:

-   the OSV API (`api.osv.dev/v1/vulns/<id>`, fetched at 00:41Z);
-   GitHub's own record in `github/advisory-database`
    (`advisories/github-reviewed/2026/10/<id>/<id>.json`, from
    `raw.githubusercontent.com`).

The affected events are identical in both. GitHub labels the ranges
`ECOSYSTEM` where OSV says `SEMVER`. Every candidate version was then queried
through OSV `/v1/query`.

**Versions and code.** The npm registry gave the versions, publish times,
dependencies and tarball integrity. 51 tarballs were read for this triage.
Each was downloaded into its own empty directory and checked against the
registry's `sha512` before it was unpacked. No code was run from them. Every
proof of concept below ran against the packages `pnpm install` put in
`node_modules`, before and after the change.

glob 13.0.6 and 14.0.1 to 14.0.3 ship a minified bundle as their main entry. Its source
map carries the source of every module bundled into it. Those sources were
compared, file by file, with the source maps of minimatch, brace-expansion,
balanced-match, path-scurry and @isaacs/nonrecursive-glob-match releases, to
name the version of each bundled copy. The minified code was then searched for
the fixes themselves.

**Scanner.** osv-scanner **v2.3.3**, the version `osv-scanner-action@v2.3.3`
runs, from the GitHub release binary, checked against the release's
`osv-scanner_SHA256SUMS`. It was run as both workflows run it:
`osv-scanner --lockfile=pnpm-lock.yaml` from the repository root, which loads
`osv-scanner.toml` from beside the lockfile.

**Reachable** means the vulnerable code runs, in something this repository
builds or deploys, on input an attacker controls.

---

## Summary

| Row              | Consumer                                                            | Change                              | Now    | Reachable here                                     |
| ---------------- | ------------------------------------------------------------------- | ----------------------------------- | ------ | -------------------------------------------------- |
| glob 11.1.0      | workbox-build 7.4.0 (vite-plugin-pwa, client devDependency)         | override `glob@>=9 <14.0.2`         | 14.0.3 | No: loaded by the client build, never called       |
| glob 13.0.6      | rimraf 6.1.3 ← @capacitor/cli 7.6.9 (blackout-mobile devDependency) | the same override                   | 14.0.3 | No: loaded by `cap sync`, never called             |
| minimatch 10.2.5 | glob 11.1.0, glob 13.0.6                                            | consumer release (glob 14.0.3)      | 11.0.3 | No: only glob uses it, and glob is never called    |
| minimatch 5.1.9  | filelist 1.0.6 ← jake 10.9.4 ← ejs 3.1.10 ← workbox-build's plugin  | override `minimatch@5`              | 11.0.3 | No: the code is absent, and nothing loads filelist |
| minimatch 3.1.5  | glob 7.2.3, test-exclude 6.0.0, eslint 8.29.0 and its plugins       | `[[IgnoredVulns]]` until 2026-12-01 | 3.1.5  | No: the code is absent                             |

OSV `/v1/query` returns no advisories for glob 14.0.2 or 14.0.3, minimatch
11.0.1 or 11.0.3, path-scurry 3.0.0, @isaacs/nonrecursive-glob-match 1.0.3 or
brace-expansion 5.0.12. It returns GHSA-3g3m for glob 11.1.0, 13.0.6 and
14.0.1, and GHSA-g3hv for minimatch 3.1.5, 5.1.9, 10.2.5, 10.2.6 and 11.0.0.

---

## glob: 11.1.0 and 13.0.6 → 14.0.3 (GHSA-3g3m-2fjr-6pw4)

-   **What:** GHSA-3g3m (CVE-2026-118773, Moderate, CWE-400). In the walker,
    the abort branches of `walkCB`, `walkCB2`, `walkCBSync` and `walkCB2Sync`
    call `cb()` without returning. An aborted walk rejects, then keeps reading
    directories. The cost lands on callers that bound a glob over untrusted
    patterns or trees with `signal` or `AbortSignal.timeout()`.
-   **Ranges:** OSV and GitHub both say `introduced 9.0.0`, `fixed 14.0.2`,
    with `last_known_affected_version_range` `<= 14.0.1`. GitHub's file was
    published and modified at 23:09:11Z; OSV's record was modified at
    23:15Z. NVD published the CVE at 19:17Z on 10-29.
-   **Registry:** glob 14.0.0 (2026-10-27 21:32Z), 14.0.1 (22:00Z), 14.0.2
    (22:07Z) and 14.0.3 (10-28 04:08Z, `latest`). There is no release on any
    older line after the advisory. The last release of each is 9.3.5
    (2023-04-09), 10.5.0 (2025-11-18), 11.1.0 (2025-11-17), 12.0.0
    (2025-11-17) and 13.0.6 (2026-02-19).
-   **What each version contains.** The abort branch, counted in
    `dist/{esm,commonjs}/walker.js`, and in the minified
    `dist/{esm,commonjs}/index.min.js` that 13.0.6 and 14.0.1 to 14.0.3
    export as `.`:

    | glob   | Abort branch without `return` | With `return cb()` |
    | ------ | ----------------------------- | ------------------ |
    | 11.1.0 | 4                             | 0                  |
    | 13.0.6 | 4                             | 0                  |
    | 14.0.1 | 4                             | 0                  |
    | 14.0.2 | 0                             | 4                  |
    | 14.0.3 | 0                             | 4                  |

-   **PoC, run on the installed packages.** A scratch harness (not committed)
    walked `**` over a tree of 1,554 directories with a counting `fs`, and
    aborted on the first `readdir`. It then waited 1.5 s.

    | glob   | API          | Rejected | `readdir` before reject | after reject |
    | ------ | ------------ | -------- | ----------------------- | ------------ |
    | 11.1.0 | `glob()`     | yes      | 7                       | 1,548        |
    | 11.1.0 | `globStream` | yes      | 1                       | 1,554        |
    | 13.0.6 | `glob()`     | yes      | 7                       | 1,548        |
    | 13.0.6 | `globStream` | yes      | 1                       | 1,554        |
    | 14.0.3 | `glob()`     | yes      | 1                       | 0            |
    | 14.0.3 | `globStream` | yes      | 1                       | 0            |

    The advisory reproduces on both in-tree versions: an aborted walk reads
    every directory anyway. 14.0.3 stops.

-   **glob 13.0.6 and 14.0.1 to 14.0.3 run a bundle, not their
    dependencies.** Their `.` export, for `import` and `require`, is
    `index.min.js`. It imports only Node built-ins and carries its own copies
    of minimatch, brace-expansion, balanced-match, path-scurry, lru-cache and
    minipass, and from 14.0.1 @isaacs/nonrecursive-glob-match. So the minimatch,
    path-scurry and brace-expansion entries that the lockfile lists under glob
    are not what glob runs. By the source maps:

    | glob   | Bundled minimatch `index.ts` | Bundled brace-expansion | Bundled path-scurry |
    | ------ | ---------------------------- | ----------------------- | ------------------- |
    | 13.0.6 | 10.2.1 = 10.2.2              | 5.0.2 = 5.0.3           | 2.0.2               |
    | 14.0.1 | 11.0.0                       | 5.0.12                  | 3.0.0               |
    | 14.0.2 | 11.0.0                       | 5.0.12                  | 3.0.0               |
    | 14.0.3 | 11.0.1 = 11.0.2              | 5.0.12                  | 3.0.0               |

    glob 14.0.2 was published at 22:07Z, 19 minutes before minimatch 11.0.1
    (22:26Z). Its bundle has minimatch 11.0.0's preprocessing, without the
    GHSA-g3hv fix; OSV cannot see that, and lists 14.0.2 as clean. The
    minified code agrees with the maps: only 14.0.3's `index.min.js` (both
    builds) contains the `secondPhasePreProcess` early return
    (`if(t.length>1e3)return t`) and a third `braceExpandMax`.

-   **Consumers and reachability.** No file in this repository imports glob
    or minimatch directly. Two packages reach glob 9 to 14:
    -   **workbox-build 7.4.0**, under vite-plugin-pwa 1.3.0, a devDependency
        of `apps/blackout-client`. Its one call is
        `globSync(globPattern, { cwd, follow, ignore })` in
        `build/lib/get-file-details.js:23`, reached only from `injectManifest`
        and `generateSW`. No `signal`, and a sync walk. The client sets
        `strategies: 'injectManifest'` with
        `injectManifest: { injectionPoint: undefined }` (`vite.config.js`).
        vite-plugin-pwa merges that over its default with `Object.assign`
        (`dist/index.js:873`), and its build step
        returns before calling workbox when `injectionPoint` is falsy
        (`dist/vite-build-*.js:41`). A `--require` trace of
        `pnpm --filter @blackout/client build` shows workbox-build loading
        glob (11.1.0 before, 14.0.3 after) and **no call** into any glob
        export. The built `sw.js` has no precache manifest.
    -   **rimraf 6.1.3**, under @capacitor/cli 7.6.9, a devDependency of
        `blackout-mobile`. rimraf calls glob only when its `glob` option is
        set (`dist/commonjs/index.js:21,33`), and only then hands glob its
        `signal` (`opt-arg.js`). The CLI calls `rimraf.sync(path)` with no
        options, in `cap migrate` (`tasks/migrate.js:234,298`) and
        `cap build ios` (`ios/build.js:90`). No script or workflow here runs
        either. `cap sync`, which `mobile-native-ci.yml` (pushes to `main` that
        touch the mobile paths, and manual runs) and `blackout-mobile.yml`
        (release tags, and manual runs) run, loads rimraf through
        `android/update.js:14` / `ios/update.js:15` for two string helpers. A
        trace of `cap sync android` in a scratch copy shows rimraf loading
        glob 13.0.6's `index.min.js` before, 14.0.3's after, and no call.
    -   **The eight `clean` scripts do not run rimraf at all.**
        `legacy/blackout-web`, `packages/{blackout-protocol,blackout-sdk,config,core,design,plugins-sdk,ui}`
        each have `"clean": "rimraf dist"`, but none declares rimraf, and pnpm
        does not put the hoisted `.pnpm/node_modules/.bin` on a script's
        PATH. In scratch copies of `741f903442` and of this change, each one
        fails with `sh: 1: rimraf: not found`, exit 1, and removes nothing.
        No workflow runs them; the root `pnpm clean` (`turbo run clean`)
        fails with "Could not find task `clean` in project".
-   **No consumer release takes a fixed glob.** workbox-build 7.4.1
    (2026-05-04, `latest`) still takes `glob ^11.0.1`. rimraf 6.1.3 is
    `latest` (`glob ^13.0.3`). @capacitor/cli 7.6.10 and 8.6.0 (`latest`)
    still take `rimraf ^6.0.1`.
-   **What 14.0.2 and 14.0.3 change** (tarball diffs):
    1. 14.0.1 → 14.0.2: the four `return cb()`; `onResume()` no longer drops
       the queued callback when the signal has aborted (the callback now
       reaches the early return instead); `walkCB` and `walkCBSync` return
       `unknown` in the `.d.ts`; the bundle is rebuilt with the same bundled
       modules.
    2. 14.0.2 → 14.0.3: the `minimatch` floor goes from `^11.0.0` to
       `^11.0.2`, and the bundle is rebuilt. Its minimatch preprocessing is
       11.0.1's (the GHSA-g3hv fix), and its bundled
       @isaacs/nonrecursive-glob-match `parse-class.ts` changes two POSIX
       classes: `[:print:]` becomes the complement of `\p{C}`, and
       `[:punct:]` adds `\p{S}`. Nothing else changes, apart from the source
       maps.
-   **What the consumers get between their glob and 14.0.3.** From the
    bundled sources (11.1.0's from its `dist` maps):
    -   13.0.0 dropped the CLI and its dependencies (jackspeak,
        foreground-child, package-json-from-dist), and by 13.0.6 `.` is the
        bundle.
    -   glob passes `braceExpandMax: 10_000` to minimatch (by 13.0.6). Its doc
        comment says the default is 1,000; the code and the PoC below give
        10,000.
    -   minimatch 11's matcher: no RegExps (`makeRe`, `regexp` and `debug`
        are gone), Unicode simple case folding for `nocase`, the POSIX class
        changes above, a new `normalize` option, and UNC host and share
        compared case-insensitively.
    -   `ignore` patterns that start with `/` are rooted at the `root` option
        or the root of `cwd` (on POSIX, `/` unless `root` is set), and honour
        `windowsPathsNoEscape`.
    -   Results are collected in an array, each path once, not in a `Set`.
    -   Windows `//?/UNC/host/share` roots, in glob and in path-scurry 3.0.0.
        path-scurry's other changes from 2.0.2 are internal or syntax only.
    -   The abort fix.
-   **Outcome:** `"glob@>=9 <14.0.2": "^14.0.3"` in `pnpm.overrides`. The
    selector is the advisory's range, so any glob request from 9.0.0 to
    14.0.1 resolves to 14.0.3 or later, and glob 7.2.3 (react-native,
    test-exclude, rimraf 3) is untouched. The caret matches the other
    overrides. Engines: glob 14.0.3, minimatch 11.0.3 and path-scurry 3.0.0 all
    require `18 || 20 || >=22`; this machine runs Node 22.22.0, CI's
    `setup-node` uses `22`, and `apps/blackout-client/Dockerfile` uses Node
    24.13.1.
-   **Measured after the change:**
    -   **Client build.** `pnpm --filter @blackout/client build`, five times:
        three on `741f903442` (one traced), one with the glob override alone
        and one on this change (both traced). The five `dist` trees are
        byte-identical, all 390 files, so no content hash needed normalising.
        `sw.js` is 1,631 bytes, sha256 `34e9bd65…4f2829`, in all five, and
        has no precache manifest to compare.
    -   **workbox-build's glob path**, driven through its public
        `getManifest()` against that `dist`, with four configurations:
        `**/*.{js,css,html}` (179 entries, 10,362,301 bytes), a wide brace
        pattern with `**/*.map` and `sw.js` ignored (226, 23,862,536), `**/*` with two directories ignored (10, 66,416), and dot
        files plus `*.{json,toml}` (3, 3,318, one warning). glob 11.1.0 and
        14.0.3 give the same URLs, revisions, order, sizes and warnings.
    -   **rimraf's glob path**, `rimraf(…, { glob: true })` sync and async on
        a planted tree, with seven patterns (globstar, braces, `*`, an
        escaped `[lit]`, a space, no match): the same 14 results with glob
        13.0.6 and 14.0.3. A pre-aborted signal rejects on both and removes
        nothing.
-   **Source:** OSV and GitHub advisory files; glob 11.1.0, 13.0.6 and 14.0.1
    to 14.0.3 tarballs, their source maps and diffs; the registry for glob,
    workbox-build, rimraf and @capacitor/cli; the harnesses and traces above.

## minimatch: 10.2.5 and 5.1.9 → 11.0.3, 3.1.5 ignored (GHSA-g3hv-75wg-m249)

-   **What:** GHSA-g3hv (CVE-2026-118764, Moderate, CWE-405). At
    `optimizationLevel >= 2`, `firstPhasePreProcess()` rewrites
    `<pre>/**/../<p>/<p2>/<rest>` by cloning the row and pushing the clone onto
    the same array, inside a `do … while (didSomething)` loop. Each `**/..`
    doubles the rows. `secondPhasePreProcess()` then compares every pair.
-   **Ranges:** OSV and GitHub both say `introduced 0`, `fixed 11.0.1`.
    GitHub's file was published and modified at 23:09:55Z; OSV's record at
    23:15Z. NVD published the CVE at 17:18Z on 10-29.
-   **Registry:** minimatch 11.0.0 (2026-10-27 21:19Z), 11.0.1 (22:26Z),
    11.0.2 (10-28 01:08Z) and 11.0.3 (20:00Z, `latest`). No older line has a
    release after the advisory. The last of each is 3.1.5 and 5.1.9
    (2026-02-25), 7.4.9 (2026-02-25), 9.0.9 (2026-02-26) and 10.2.6
    (2026-07-27). 11.x adds a dependency, @isaacs/nonrecursive-glob-match
    (first release 2026-10-26).
-   **What each version contains**, searched in every `.js` file of the
    tarball:

    | minimatch                                          | `firstPhasePreProcess` and the `**/..` clone | `optimizationLevel` | Fix (`braceExpandMax` cap, >1000 skip) |
    | -------------------------------------------------- | -------------------------------------------- | ------------------- | -------------------------------------- |
    | 3.1.5, 4.2.6, 5.0.0, 5.1.9, 6.0.0, 6.2.0, 6.2.3    | absent                                       | absent              | —                                      |
    | 7.0.0, 7.0.1                                       | present                                      | absent              | no                                     |
    | 7.3.0, 7.4.0, 7.4.9, 9.0.9, 10.2.5, 10.2.6, 11.0.0 | present                                      | present             | no                                     |
    | 11.0.1, 11.0.3                                     | present                                      | present             | yes                                    |

    So the flawed code first appears in **7.0.0**. In 3.1.5 the only file is
    `minimatch.js`; in 5.1.9, `minimatch.js` and `lib/path.js`.

-   **What 11.0.1 to 11.0.3 change** (diffs of the sources in the tarballs'
    maps):
    1. 11.0.0 → 11.0.1: `firstPhasePreProcess` stops splitting once the rows
       reach `braceExpandMax` (default 100,000), and `secondPhasePreProcess`
       returns early above 1,000 rows. The doc comment for `braceExpandMax`
       says so. Nothing else changes.
    2. 11.0.1 → 11.0.2: the sources are identical; the
       @isaacs/nonrecursive-glob-match floor moves to `^1.0.2` (the POSIX class
       change above).
    3. 11.0.2 → 11.0.3: `minimatch()` keeps the 256 most recently used
       `Minimatch` objects, keyed by pattern and options; `Minimatch` builds
       each row's matchers only after merging rows. The floor moves to
       `^1.0.3`, whose change is a cache of case-folding RegExps.
-   **PoC, run on the installed packages.** A scratch harness built
    `new Minimatch('x/' + '**/../a/b/'.repeat(n) + 'c', { optimizationLevel: 2 })`,
    or `new Glob(<same>)`, which sets level 2 itself. Times include loading
    the module.

    | Package          | n = 8           | n = 12        | n = 14           | n = 20          |
    | ---------------- | --------------- | ------------- | ---------------- | --------------- |
    | minimatch 10.2.5 | 256 rows, 41 ms | 4,096, 338 ms | 16,384, 4,340 ms | not run         |
    | minimatch 11.0.3 | 256, 20 ms      | 4,096, 70 ms  | 16,384, 132 ms   | 100,000, 888 ms |
    | glob 11.1.0      | 256, 78 ms      | 4,096, 433 ms | not run          | not run         |
    | glob 13.0.6      | 256, 57 ms      | 4,096, 351 ms | not run          | not run         |
    | glob 14.0.3      | 256, 32 ms      | 4,096, 67 ms  | 10,000, 114 ms   | 10,000, 144 ms  |

    A 143-character pattern costs 10.2.5 over four seconds; the cost is the
    pairwise second phase. With the fix the rows stop at the cap (100,000 in
    minimatch, glob's 10,000) and the second phase is skipped.

-   **Reachability.** In this tree only glob uses a minimatch that has the
    option, and glob sets `optimizationLevel: 2`; minimatch's default is 1. So before the change the flawed code ran only inside glob,
    through workbox-build and rimraf, which never call glob here (glob
    section). Every pattern is repository config. glob 13.0.6 never loaded
    the lockfile's minimatch 10.2.5 at all: it ran its bundled 10.2.1 copy
    (trace: rimraf loads `index.min.js`, and no `minimatch` load follows).
-   **minimatch 10.2.5: consumer release.** glob 14.0.3 takes minimatch
    `^11.0.2`. With both globs moved, 10.2.5 has no consumer and leaves the
    lockfile.
-   **minimatch 5.1.9: override.** The chain is filelist 1.0.6 ← jake 10.9.4 ←
    ejs 3.1.10 ← @surma/rollup-plugin-off-main-thread 2.2.3 ← workbox-build
    7.4.0. Only ejs's CLI (`bin/cli.js`) requires jake, and only jake requires
    filelist; the plugin calls `ejs.render`. Nothing here runs ejs's or
    jake's CLI. So 5.1.9 has no flawed code and is never loaded.
    -   No release on this chain takes minimatch ≥ 11.0.1. filelist 2.0.2
        takes `^10.2.1` and jake 13.0.3 takes filelist `^2.0.2`, both of which
        bring back code that has the flaw. @surma/rollup-plugin-off-main-thread
        2.2.3 (2021) is its last release. workbox-build 7.4.1 swaps it for
        @trickfilm400/rollup-plugin-off-main-thread `^3.0.0-pre1`, whose two
        3.x releases take ejs `^3.1.10`, so the chain stays.
    -   filelist's one call is `minimatch.match(files, pat, opts)`
        (`index.js:201`). minimatch 11.0.3's CommonJS build exports `match`.
        A harness ran five `FileList` include patterns (globstar, `*`, a
        brace, a class, nested `*`), each with an exclude, on the
        1,554-directory tree: with 5.1.9, with 11.0.3 swapped in, and with the
        installed resolution after the override (11.0.3). The file lists are
        the same. The brace pattern finds nothing in all three, because
        filelist reads the part before the first wildcard as a literal
        directory.
    -   So the override is `"minimatch@5": "^11.0.3"`. It also takes
        brace-expansion 2.1.7, used only by 5.1.9, out of the lockfile; the
        `brace-expansion@2` override now binds nothing and stays as a guard.
-   **minimatch 3.1.5: ignored.** It has no flawed code (table above), the
    3.x line has no fix, and the consumers cannot take 11:
    -   glob 7.2.3 reads each pattern portion as a RegExp, `pn._glob` and
        `e.match(pn)` (`sync.js:147-158`, `glob.js:385-396`). minimatch 11's
        `set` holds `Matcher` objects there.
    -   test-exclude 6.0.0 (`index.js:99`) and eslint-plugin-react 7.31.11
        (`jsx-pascal-case.js:66`) call the module itself as a function.
        minimatch 11's CommonJS export is a plain object.
    -   The rest are eslint 8.29.0, @eslint/eslintrc 1.4.1,
        @humanwhocodes/config-array 0.11.14, eslint-plugin-import 2.29.1 and
        eslint-plugin-jsx-a11y 6.6.1. glob 7.2.3 is reached through
        react-native 0.82.1, @react-native/codegen, rimraf 3.0.2 and
        test-exclude 6.0.0.
    -   No consumer release takes a fixed minimatch: eslint 9.39.5 (the last
        9.x) and @eslint/eslintrc 3.3.7 still take `^3.1.5`; eslint 10.14.0
        takes `^10.2.6` and test-exclude 8.0.0 `^10.2.2`, which have the flaw.
-   **Outcome:** one `[[IgnoredVulns]]` entry in `osv-scanner.toml`,
    `ignoreUntil = 2026-12-01`, with its reason, the evidence and the plan.
    It stops applying at 2026-12-01T00:00Z on CI's UTC runners (local
    midnight on the scanning host; see the 2026-10-30 record).
    -   **Mirrored in `pnpm.auditConfig.ignoreGhsas`**, because
        `guard:audit-clean` reports 3.1.5 on 42 production paths and exits 1
        without it. Those paths are `legacy/blackout-web` → `@blackout/ui`
        (21), `packages/ui` → lucide-react-native (14) and `packages/ui` →
        react-native (7), each ending in react-native 0.82.1 → glob 7.2.3 or
        test-exclude 6.0.0 → minimatch 3.1.5. `security.yml`'s
        `--audit-level high` passes either way.
    -   **Not in `.trivyignore`.** Trivy's gate is `CRITICAL,HIGH`, and this
        is Moderate. Trivy was not run (Verification).
-   **What a regression would look like.** The ignore is per ID, not per
    version. A minimatch that does contain the code, 7.0.0 to 11.0.0, entering
    the lockfile would pass every gate. Examples: 10.2.6 through eslint 10,
    test-exclude 8 or filelist 2. The OSV gates and `guard:audit-clean`
    would pass because of this entry and its mirror; Trivy and `security.yml`'s
    `pnpm audit` because it is Moderate. The OSV scan would print only its
    "filtered out" line, as it does now. A glob from 9.0.0 to 14.0.1, or a
    minimatch 5.x, cannot come back that way: the two overrides move them to
    14.0.3 and 11.0.3.
-   **Plan:**
    1. The range starts at 0, but the code starts at 7.0.0. The operator can
       ask `github/advisory-database` to correct `introduced`, citing the
       table above. Once OSV follows, the scanner reports this entry as
       unused, and it and its mirror are deleted.
    2. Moving eslint does not clear it: 9.39.5 keeps minimatch `^3.1.5`, and
       10.14.0 brings `^10.2.6`, which has the flaw and would be hidden by
       this entry.
    3. Re-check by 2026-12-01.
-   **Source:** OSV and GitHub advisory files; minimatch 3.1.5, 4.2.6, 5.0.0,
    5.1.9, 6.0.0, 6.2.0, 6.2.3, 7.0.0, 7.0.1, 7.3.0, 7.4.0, 7.4.9, 9.0.9,
    10.2.0 to 10.2.6 and 11.0.0 to 11.0.3 tarballs and source maps;
    @isaacs/nonrecursive-glob-match 1.0.0 to 1.0.3; the registry for filelist,
    jake, ejs, both off-main-thread plugins, eslint, @eslint/eslintrc and
    test-exclude; `pnpm audit --json`; the harnesses above.

---

## Lockfile

Compared as parsed YAML, `741f903442`'s `pnpm-lock.yaml` against this
change's:

-   **Removed (9):** @isaacs/cliui 9.0.0, brace-expansion 2.1.7,
    foreground-child 3.3.1, glob 11.1.0, glob 13.0.6, jackspeak 4.2.3,
    minimatch 10.2.5, minimatch 5.1.9, path-scurry 2.0.2.
-   **Added (4):** @isaacs/nonrecursive-glob-match 1.0.3, glob 14.0.3,
    minimatch 11.0.3, path-scurry 3.0.0. Each one's lockfile integrity is the
    registry's `sha512`.
-   **Snapshots changed in place (3):** filelist 1.0.6 (minimatch 5.1.9 →
    11.0.3), rimraf 6.1.3 (glob 13.0.6 → 14.0.3), workbox-build 7.4.0 (glob
    11.1.0 → 14.0.3).
-   **Overrides:** the two new entries.
-   Nothing else moved: no importer, no other snapshot, no `packages:` entry
    in place, no other top-level key. 1,496 packages before, 1,491 after.
-   Only two importers reach a moved package, both through a
    devDependency: `apps/blackout-client` (vite-plugin-pwa) and
    `blackout-mobile` (@capacitor/cli). The closures of eslint 8.29.0,
    prettier, typescript, vite and vitest contain none, so no lint toolchain
    moved.

---

## Found outside the gates (not changed here)

1. **A bundled dependency is invisible to the scanners and to
   `pnpm.overrides`.** glob 13.0.6, the version rimraf 6.1.3 resolved, ran a
   bundled copy of minimatch 10.2.1's source (10.2.2's is identical) and
   brace-expansion 5.0.2's (5.0.3's is identical), while the lockfile listed
   minimatch 10.2.5 and brace-expansion 5.0.12 under it. OSV `/v1/query` lists two High minimatch advisories for 10.2.1
   (GHSA-23c5-xmqv-rm74, GHSA-7r86-cg39-jmmj), and eight for brace-expansion
   5.0.2 (five High, among them GHSA-mh99-v99m-4gvg, which the
   `brace-expansion@5` override exists for). No gate saw any of them. They
   were not reachable here, because rimraf never calls glob, and this change
   removes them: 14.0.3 bundles 11.0.1's minimatch and brace-expansion
   5.0.12. glob 14.0.2 is the same trap for GHSA-g3hv. Any other package
   that ships a self-contained bundle has the same blind spot; none was
   looked for.
2. **The eight `clean` scripts are broken.** They call `rimraf`, which none
   of those packages declares, and fail with `rimraf: not found` on
   `741f903442` and on this change. The root `pnpm clean` fails too: turbo
   has no `clean` task. No workflow runs any of them.
3. **vite-plugin-pwa 1.3.0 peers workbox-build and workbox-window
   `^7.4.1`**, and the lockfile has 7.4.0; `pnpm install` warns. 7.4.1 would
   not help with either advisory (glob `^11.0.1`, and the ejs 3 chain stays),
   and it moves the service-worker bundler from rollup 2 to 4.
4. **The client's service worker has no precache manifest.** With
   `injectionPoint: undefined`, vite-plugin-pwa builds `src/sw.ts` and never
   calls workbox-build. If that changes, workbox-build's glob path is the one
   the `getManifest()` comparison above covers.
5. **The `brace-expansion@2` override binds nothing now.** Its only target,
   2.1.7, left with minimatch 5.1.9.

## Operator decisions

1. **Whether to report the minimatch range** (`introduced 0` → `7.0.0`) to
   `github/advisory-database`. That is the plan that retires the entry.
2. **Whether to guard against a regression the entry would hide.** An
   override such as `"minimatch@>=7 <11.0.1": "^11.0.3"` would move any
   future request for a flawed line to 11.0.3, so the ID-wide ignore could
   not hide one. It binds nothing today, and it would push a future consumer
   (eslint 10, for example) across a major without asking. Not added.

---

## Verification

Runs are local, with Node 22.22.0 and pnpm 9.15.4 (the pinned
`packageManager`), between 00:41Z and the commit on 2026-10-31. Commands
are as in `ci.yml` and `security.yml` where those run them.

| Gate                    | Command                                                                                                                                 | Result                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| OSV, before             | osv-scanner v2.3.3 (sha256 matches `osv-scanner_SHA256SUMS`), `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, on `741f903442`, 00:58Z            | exit 1: 3 filtered, 5 rows (the table at the top)                                                                                  |
| OSV, glob override only | the same, with only `glob@>=9 <14.0.2`, 01:02Z                                                                                          | exit 1: 2 rows, minimatch 3.1.5 and 5.1.9                                                                                          |
| OSV, no minimatch entry | the same on the final lockfile, with the GHSA-g3hv entry removed from a copy of `osv-scanner.toml`                                      | exit 1: 1 row, minimatch 3.1.5                                                                                                     |
| OSV                     | the same on this change, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`                                                                | exit 0 in all three: "No issues found", 4 filtered (deepmerge, image-size ×2, minimatch), no unused-ignore line                    |
| install                 | `pnpm install` with the two overrides; then, in a fresh copy of the tracked files, `pnpm install --frozen-lockfile --ignore-scripts`    | pass; the frozen install leaves `pnpm-lock.yaml` unchanged and installs glob 14.0.3, minimatch 11.0.3 and 3.1.5, path-scurry 3.0.0 |
| lockfile diff           | scratch script, parsed YAML                                                                                                             | as in Lockfile                                                                                                                     |
| pnpm audit              | `pnpm audit --prod --audit-level high` (`security.yml`)                                                                                 | before: exit 0, "4 vulnerabilities found, 1 low \| 1 moderate \| 2 high (2 ignored)". After: exit 0, "… 1 moderate (1 ignored) …"  |
| guard:audit-clean       | `pnpm run guard:audit-clean`                                                                                                            | before: exit 1 (minimatch 3.1.5, Moderate, 42 paths). After: exit 0                                                                |
| pnpm audit, whole tree  | `pnpm audit --json` (dev included)                                                                                                      | before: deepmerge (low), glob 11.1.0 and 13.0.6, minimatch 3.1.5 (197 paths), 5.1.9 and 10.2.5. After: deepmerge only              |
| client build            | `pnpm --filter @blackout/client build`, three times on `741f903442`, then with the glob override alone and on this change               | pass; all five `dist` trees byte-identical (390 files); 25,308 KB without maps                                                     |
| build trace             | the same build with a `--require` hook logging loads of and calls into `glob` / `minimatch`                                             | workbox-build loads glob (11.1.0 then 14.0.3); no call                                                                             |
| workbox-build           | scratch harness, `getManifest()` on the built `dist`, four configurations                                                               | identical between glob 11.1.0 and 14.0.3                                                                                           |
| rimraf `glob: true`     | scratch harness, 7 patterns × sync/async, and a pre-aborted signal                                                                      | identical between glob 13.0.6 and 14.0.3                                                                                           |
| `clean` scripts         | `pnpm --filter <pkg> run clean` for the eight packages, in scratch copies of `741f903442` and of this change, with planted `dist` files | exit 1, `rimraf: not found`, nothing removed, in both                                                                              |
| `cap sync android`      | `CI=1 pnpm exec cap sync android` in `blackout-mobile` of each scratch copy, with the trace hook                                        | exit 1 at "Could not find the web assets directory" in both; rimraf loads glob 13.0.6, then 14.0.3; no call                        |
| filelist                | scratch harness, five `FileList` patterns                                                                                               | the same lists with minimatch 5.1.9 and 11.0.3                                                                                     |
| PoCs                    | the two harnesses above                                                                                                                 | as in the tables above                                                                                                             |
| client types            | `pnpm --filter @blackout/client typecheck`                                                                                              | pass                                                                                                                               |
| lint                    | none run: no lint toolchain moved (Lockfile)                                                                                            | —                                                                                                                                  |
| Trivy                   | not run: both advisories are Moderate, below its CRITICAL/HIGH gate, and OSV lists no advisory for any of the four added versions       | —                                                                                                                                  |
| prettier                | `prettier --check` on the changed files (lint-staged runs `prettier --write` on commit)                                                 | pass                                                                                                                               |
| gitleaks                | 8.21.2, `gitleaks dir --no-banner --redact` on each of the four changed files, before the commit                                        | no leaks found                                                                                                                     |

**Not verified:**

-   That GitHub's hosted runners scan in UTC was not checked on a runner;
    neither workflow sets `TZ`.
-   `cap migrate` and `cap build ios`, the only places rimraf is called, were
    read, not run. `cap sync android` was run only until it stopped at the
    missing web assets; the module loads it showed come first.
-   The PoCs and comparisons ran on Linux only. The Windows path changes in
    glob 14 and path-scurry 3 were read, not exercised.
-   minimatch 11's new matcher was compared with the old one only on the
    patterns in the harnesses above, not in general.
-   The client's unit and e2e suites, and the API suites, were not run. No
    importer other than the client (through vite-plugin-pwa) and
    `blackout-mobile` (through @capacitor/cli) reaches a moved package, and
    the client's `dist` did not change.
-   Trivy was not run (Verification table). At the end of this work the
    disk had 1.5 GB free, shared with other runs, so nothing heavier was
    started.
-   CI did not run on this change; nothing was pushed.
-   The range correction was not reported upstream.
