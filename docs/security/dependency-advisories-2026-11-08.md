# Dependency advisory triage — 2026-11-08

Two upstream edits to advisory ranges, not a release, changed what the OSV
gates see since the 2026-10-31 record. Both gates, **Dependency audit (no
un-triaged advisories, any severity)** in `ci.yml` and the OSV step of
`security.yml`'s **Dependency vulnerability audit**, were red on `develop`
from 2026-11-03, and so on every PR, until #998 merged at 03:36Z on
2026-11-08. Its last commit, `77e6e68182`, is this record's lodash commit
(`eacf8f8b08`), ported so that #998's own audits could pass. On that merge
(`27d8c17051`) both gates passed: `ci.yml` run 42443420808's **Dependency
audit (no un-triaged advisories, any severity)** and `security.yml` run 42443420809. This branch has since merged `develop`, so of the changes
below it still makes the ignore deletions; the lodash change reached
`develop` through #998 and is recorded here, as nothing else records it.

1. **GHSA-f23m-r3pf-42rh (lodash) now ends at 4.18.1.** GitHub modified its
   file at 15:37:10Z on 2026-11-03 and OSV's record followed at 15:45:08Z.
   The range for lodash, lodash-es and lodash-amd is `introduced 4.17.23`,
   `fixed 4.18.1`. The lockfile has lodash 4.18.0, so the scan exits 1 with
   one row:

    | Advisory            | CVSS (v3.1) | Package | Version | Fixed  |
    | ------------------- | ----------- | ------- | ------- | ------ |
    | GHSA-f23m-r3pf-42rh | 6.5         | lodash  | 4.18.0  | 4.18.1 |

    `develop`'s last runs before #998, on `7bda9eb72a` at 00:31Z on
    2026-11-04, fail this way and no other: `ci.yml` run 41747526572 has one failed job,
    **Dependency audit (no un-triaged advisories, any severity)**, and
    `security.yml` run 41747526887 has one, **Dependency vulnerability
    audit**. Each log prints that row and "Total 1 package affected by 1
    known vulnerability (0 Critical, 0 High, 1 Medium, 0 Low, 0 Unknown)",
    with 4 advisories filtered. The `pnpm audit --prod --audit-level high`
    step of the second job passed: "4 vulnerabilities found", "1 low \| 1
    moderate (1 ignored) \| 2 high (2 ignored)".

2. **GHSA-g3hv-75wg-m249 (minimatch) now starts at 7.0.0.** GitHub corrected
   `introduced` from `0` to `7.0.0` at 16:50:00Z on 2026-11-04 and OSV's
   record followed at 17:01:25Z. That is the correction the 2026-10-31 record
   asked for, with the consequence it predicted: minimatch 3.1.5 is out of
   range, and the scanner reports the `[[IgnoredVulns]]` entry that covered
   it as unused. A scan of `develop`'s lockfile and `osv-scanner.toml`
   (`7bda9eb72a`) at 02:24Z today exits 1, prints the lodash row above, "3
   vulnerabilities" filtered and "osv-scanner.toml has unused ignores:
   GHSA-g3hv-75wg-m249". The OSV steps of `develop`'s runs of 11-04 (item 1),
   logged at 00:37Z and 00:51Z, still show the entry in use (4 filtered), so
   the change reached CI between 17:01Z on 11-04 and the next run.

**Result:**

-   **lodash 4.18.0 → 4.18.1**, through the existing override:
    `"lodash@4.17.23": "^4.18.0"` becomes `"lodash@4.17.23": "^4.18.1"`. The
    key stays. pnpm 9.15.4 applies an override to every request whose range
    overlaps the selector (`isIntersectingRange` in `overrideDeps`, as the
    2026-10-31 record found for glob), and the three consumers request
    `^4.17.21` (slate-dom 0.112.2, slate-react 0.112.1) and `^4.17.20`
    (workbox-build 7.4.0), each of which contains 4.17.23;
    `pnpm why -r lodash` shows all of them on 4.18.1, and the frozen install
    puts 4.18.1 under all three. The value moves because the old one did
    not: `^4.18.0` admits 4.18.0, so a re-resolution keeps it. `^4.18.1`
    excludes 4.18.0 and, like every other override in the file, stays below
    the next major. 4.18.1 is npm's `latest` (2026-04-01) and is not
    deprecated; 4.18.0 is deprecated ("Bad release. Please use lodash@4.17.21
    instead."), and the lockfile's `deprecated:` line goes with it.
-   **The minimatch ignore is deleted**, from `osv-scanner.toml` and from
    `pnpm.auditConfig.ignoreGhsas`. The 56-line triage comment and the 4-line
    entry are replaced by a 12-line history (what sat there, from when to
    when, why it went). The 3.1.5 consumers (glob 7.2.3, test-exclude 6.0.0,
    eslint 8.29.0 and its plugins) are unchanged, and `pnpm audit` no longer
    reports 3.1.5 at any level, so the mirror had nothing to silence either.
-   **The brace-expansion mirror (GHSA-mh99-v99m-4gvg) is deleted from
    `pnpm.auditConfig.ignoreGhsas` too.** `osv-scanner.toml` dropped it on
    2026-10-23, and `.trivyignore`'s header has called both remaining copies
    dead since 2026-10-30. `pnpm audit --prod` at `--audit-level high` and at
    `moderate` gives the same result with and without it: exit 0, "3
    vulnerabilities found", "1 low \| 2 high (2 ignored)". The `.trivyignore`
    entries stay (item 3 of "Found outside the gates"); its header now says
    which copies exist.
-   **Neither advisory is reachable here, before or after.** No file in this
    repository imports lodash. slate-react imports `lodash/throttle` and
    `lodash/debounce`, slate-dom imports nothing from it, and workbox-build
    imports `lodash/template` on a path the client build never takes. None of
    them calls `_.unset`, `_.omit` or `_.pullAt`. The flawed minimatch code
    was never in the tree (2026-10-31 record).
-   **After the change** the OSV scan exits 0 in UTC, UTC+3 and UTC+14 ("No
    issues found", 3 filtered, no unused-ignore line), both `pnpm audit`
    commands exit 0, and the client typechecks, passes its unit and smoke
    suites and builds (Verification).

The lockfile removes one package and adds one (Lockfile). Nothing was added
to any ignore list.

---

## Method

**Advisory text and ranges.** Each ID came from two sources, fetched between
02:19Z and 02:21Z on 2026-11-08:

-   the OSV API (`api.osv.dev/v1/vulns/<id>`);
-   GitHub's own record in `github/advisory-database`
    (`advisories/github-reviewed/2026/04/GHSA-f23m-r3pf-42rh/…` and
    `…/2026/10/GHSA-g3hv-75wg-m249/…`, from `raw.githubusercontent.com`).

The affected events are identical in both; GitHub labels the ranges
`ECOSYSTEM` where OSV says `SEMVER`. The files' edit history (what each range
said before its correction) was not retrieved: the GitHub API refused that
repository from this session, and OSV does not serve history. The earlier
minimatch range is in the 2026-10-31 record; the earlier lodash range is not
recorded anywhere in this tree (item 4 of "Found outside the gates").

**Versions and code.** The npm registry (`registry.npmjs.org/lodash`) gave the
versions, publish times, deprecations and tarball integrity. Three lodash
tarballs were read: 4.17.23 (the advisory's `introduced`), 4.18.0 and 4.18.1.
Each was downloaded into its own empty directory, checked against the
registry's `sha512` and unpacked; the harness below lives outside those
directories and is given a path. The lockfile's integrity for 4.18.1 is the
registry's `sha512` for it.

**Scanner.** osv-scanner **v2.3.3**, the version `osv-scanner-action@v2.3.3`
runs, the same release binary as on 2026-10-31 (checked again against
`osv-scanner_SHA256SUMS`: OK). It was run as both workflows run it,
`osv-scanner --lockfile=pnpm-lock.yaml` from the repository root, which loads
`osv-scanner.toml` from beside the lockfile.

**Reachable** means the vulnerable code runs, in something this repository
builds or deploys, on input an attacker controls.

---

## Summary

| Row                            | Consumer                                                                                                                     | Change                                          | Now    | Reachable here                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| lodash 4.18.0                  | slate-react 0.112.1 and slate-dom 0.112.2 (client dependencies); workbox-build 7.4.0 (vite-plugin-pwa, client devDependency) | override value `^4.18.0` → `^4.18.1`            | 4.18.1 | No: the consumers import throttle, debounce and template, never unset, omit or pullAt |
| minimatch 3.1.5 (ignore)       | glob 7.2.3, test-exclude 6.0.0, eslint 8.29.0 and its plugins                                                                | `[[IgnoredVulns]]` entry and its mirror deleted | 3.1.5  | No: out of the corrected range, and the code is absent                                |
| brace-expansion (audit mirror) | —                                                                                                                            | `pnpm.auditConfig` entry deleted                | —      | — (pnpm audit reports nothing with or without it)                                     |

By their ranges, GHSA-f23m covers lodash 4.17.23 to 4.18.0 and not 4.18.1,
and GHSA-g3hv covers minimatch 7.0.0 to 11.0.0 and no longer 3.1.5 (no
per-version `/v1/query` was made this time). Neither lodash-es, lodash-amd, lodash.unset nor lodash.omit (the
advisory's other packages) is in the lockfile. The six `lodash.*` packages
that are (lodash.debounce 4.0.8, lodash.defaults 4.2.0, lodash.isarguments
3.1.0, lodash.merge 4.6.2, lodash.sortby 4.7.0, lodash.throttle 4.1.1) are not
named by it.

---

## lodash: 4.18.0 → 4.18.1 (GHSA-f23m-r3pf-42rh)

-   **What:** GHSA-f23m (CVE-2026-2950, Moderate, CWE-1321, CVSS 3.1
    `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L`). `_.unset`, `_.omit` and
    `_.pullAt` take a path; the guard added for CVE-2025-13465
    (GHSA-xxjr-mmjv-4gpg) checks string segments only, so array-wrapped
    segments such as `[['__proto__'], ['toString']]` reach the prototype and
    delete its properties. The advisory says deletion only: the original
    behaviour cannot be overwritten this way.
-   **Ranges:** OSV and GitHub both say lodash, lodash-es and lodash-amd
    `introduced 4.17.23`, `fixed 4.18.1`; lodash.unset and lodash.omit
    `introduced 0`, `fixed 4.18.0`. Published 2026-04-01T23:50:27Z. GitHub's
    file was modified at 2026-11-03T15:37:10Z, OSV's record at 15:45:08Z.
    The advisory's own text: "patched from 4.18.0 to 4.18.1 depending on the
    package: lodash, lodash-es, and lodash-amd in 4.18.1, and the standalone
    lodash.unset and lodash.omit packages in 4.18.0."
-   **Registry:** lodash 4.17.21 (2021-02-20), 4.17.23 (2026-01-21 17:29Z;
    there is no 4.17.22), 4.18.0 (2026-03-31 18:18Z, deprecated: "Bad
    release. Please use lodash@4.17.21 instead.") and 4.18.1 (2026-04-01
    21:01Z, `latest`). There is no later release. None of them declares a
    dependency.
-   **What each version contains**, from the tarballs:

    | lodash  | `_.unset` / `_.omit` with array-wrapped segments | `lodash/template` and `lodash/fromPairs` (modular entry points) |
    | ------- | ------------------------------------------------ | --------------------------------------------------------------- |
    | 4.17.23 | delete `Object.prototype.toString`               | `template.js` does not parse (`SyntaxError`); `fromPairs` works |
    | 4.18.0  | prototype intact                                 | both throw `ReferenceError` (`assignWith`, `baseAssignValue`)   |
    | 4.18.1  | prototype intact                                 | both work                                                       |

    4.18.0 and 4.18.1 differ in 9 of 1,051 files. `lodash.js` (the main
    entry, and the one bundlers take) differs in three lines: the version
    string and one removed comment, a reference to GHSA-w36w-cm3g-pc62 in
    `baseUnset`. `_baseUnset.js` loses the same comment. `fromPairs.js` gains
    `require('./_baseAssignValue')` and `template.js` gains
    `require('./_arrayEach')` and `require('./assignWith')`, the identifiers
    4.18.0 used without requiring them. `core.js`, the two `.min.js` files,
    `README.md` and `package.json` carry the version. The other 1,041 `.js`
    files are byte-identical. So for the `lodash` package the guard is the
    same in 4.18.0 and 4.18.1; what 4.18.1 adds is a modular build that
    runs.

-   **PoC, run on the unpacked tarballs** (a scratch harness, not committed).
    For each version it calls `_.unset({}, p)`, `_.omit({}, [p])` and
    `_.pullAt([], [p])` with string and array-wrapped paths to
    `Object.prototype.toString` and `Number.prototype.toFixed`, then checks
    whether the prototype still owns the property, and requires
    `template.js` and `fromPairs.js` and calls them once.

    | lodash  | `unset` string path | `unset` array-wrapped | `unset` via `constructor.prototype` | `omit` array-wrapped | `pullAt` (two shapes) |
    | ------- | ------------------- | --------------------- | ----------------------------------- | -------------------- | --------------------- |
    | 4.17.23 | intact              | **deleted**           | **deleted**                         | **deleted**          | intact                |
    | 4.18.0  | intact              | intact                | intact                              | intact               | intact                |
    | 4.18.1  | intact              | intact                | intact                              | intact               | intact                |

    The advisory reproduces on 4.17.23 through `unset` and `omit`. The two
    `pullAt` shapes the harness tried did not pollute on any version; the
    advisory names `_.pullAt`, and no shape that reaches it was searched for
    further, since nothing here calls it.

-   **Consumers and reachability.** No file under `apps/blackout-client/src`
    or `packages/*/src` imports lodash. Three packages in the lockfile depend
    on it, all through `apps/blackout-client`:
    -   **slate-react 0.112.1** (dependency): `dist/index.js` and
        `dist/index.es.js` import `lodash/throttle` and `lodash/debounce`,
        nothing else. These ship in the client bundle. `throttle.js`,
        `debounce.js` and the thirteen modules they load (`isObject`, `now`,
        `toNumber`, `_baseTrim`, `_trimmedEndIndex`, `_root`, `_freeGlobal`,
        `isObjectLike`, `isSymbol`, `_baseGetTag`, `_Symbol`, `_getRawTag`,
        `_objectToString`) are
        byte-identical in 4.18.0 and 4.18.1, so the lodash code in the
        bundle does not change.
    -   **slate-dom 0.112.2** (dependency): declares lodash `^4.17.21` and
        does not use it. Its `dist/index.js` requires only `slate` and
        `is-hotkey`, and neither build contains `throttle` or `debounce`.
    -   **workbox-build 7.4.0** (devDependency, under vite-plugin-pwa 1.3.0):
        `build/lib/populate-sw-template.js` requires `lodash/template`, and
        `write-sw-using-default-template.js` calls it on the `generateSW`
        path. The client uses `strategies: 'injectManifest'` with
        `injectionPoint: undefined`, and vite-plugin-pwa returns before
        calling workbox-build (traced in the 2026-10-31 record). With 4.18.0
        that call would have thrown a `ReferenceError`
        (`assignWith is not defined`; table above); it was never made.
    -   None of the three imports `lodash/unset`, `lodash/omit`,
        `lodash/pullAt`, `lodash/set`, `lodash/get` or `lodash/has`, or
        calls `_.unset`, `_.omit` or `_.pullAt` (searched in their built
        files). The advisory's functions are not loaded here.
-   **Outcome:** `"lodash@4.17.23": "^4.18.1"` in `pnpm.overrides`. The
    lockfile's `lodash@4.18.1` integrity,
    `sha512-dMInicTPVE8d1e5otfwmmjlxkZoUpiVLwyeTdUsi/Caj/gfzzblBcCE5sRHV/AsjuCmxWrte2TNGSYuCeCq+0Q==`,
    is the registry's. Three snapshots change in place (Lockfile).
-   **Measured after the change:** the client gates in Verification. A
    before-and-after comparison of the client's `dist` was not made (the
    disk, shared with other runs, had 3.3 GB free); the module-level
    comparison above stands in for it.
-   **Source:** OSV and GitHub advisory files; the registry record for
    lodash; the 4.17.23, 4.18.0 and 4.18.1 tarballs and their diffs; the
    harness above; the built files of slate-react, slate-dom and
    workbox-build in `node_modules`.

## minimatch: the GHSA-g3hv-75wg-m249 ignore, deleted

-   **What changed upstream:** GitHub's file for GHSA-g3hv (CVE-2026-118764,
    Moderate, CWE-405) now says `introduced 7.0.0`, `fixed 11.0.1`
    (`modified` 2026-11-04T16:50:00Z); OSV's record says the same
    (`modified` 17:01:25Z). The 2026-10-31 record showed that
    `firstPhasePreProcess`, the code the advisory describes, first appears
    in 7.0.0, and planned for exactly this: "once OSV follows, the scanner
    reports this entry as unused, and it and its mirror are deleted".
-   **What is in the tree:** minimatch 3.1.5 and 11.0.3, as on 2026-10-31.
    3.1.5 is below the corrected range; 11.0.3 is above its fix. The
    corrected range covers 7.0.0 to 11.0.0 only.
-   **Outcome:** the `[[IgnoredVulns]]` entry (`ignoreUntil = 2026-12-01`)
    and its 56-line comment are removed from `osv-scanner.toml`, and
    `GHSA-g3hv-75wg-m249` from `pnpm.auditConfig.ignoreGhsas`. A short
    comment in the toml keeps the history: the entry sat there from
    2026-10-31 to 2026-11-08, why, and why it went. The toml header no longer
    says "one minimatch version is left in that advisory's range", which is
    no longer true. `.trivyignore`'s header, which listed GHSA-g3hv among
    the lists' deliberate differences, says the entries were removed.
-   **What a regression looks like now.** The 2026-10-31 record's warning
    was that the ID-wide ignore would hide a minimatch that does contain the
    code (7.0.0 to 11.0.0) entering the lockfile, for example 10.2.6 through
    eslint 10, test-exclude 8 or filelist 2. Without the entry and its
    mirror, such a version fails both OSV gates and `guard:audit-clean`
    (Moderate); `security.yml`'s `pnpm audit --audit-level high` and Trivy's
    CRITICAL/HIGH gate still pass on it, as before.
-   **Consumers:** unchanged. glob 7.2.3, test-exclude 6.0.0, eslint 8.29.0,
    @eslint/eslintrc 1.4.1, @humanwhocodes/config-array 0.11.14,
    eslint-plugin-import 2.29.1, eslint-plugin-jsx-a11y 6.6.1 and
    eslint-plugin-react 7.31.11 still take 3.1.5, which has no fixed release
    on its line and now needs none.
-   **Source:** OSV and GitHub advisory files; the 2026-10-31 record; the
    scans in Verification.

## brace-expansion: the GHSA-mh99-v99m-4gvg audit mirror, deleted

-   `osv-scanner.toml` lost its brace-expansion entry on 2026-10-23, once the
    `brace-expansion@1/2/5` overrides had moved every copy past the fixes; its
    trailing comment says so. The `pnpm.auditConfig.ignoreGhsas` and
    `.trivyignore` copies stayed, and `.trivyignore`'s header has said since
    2026-10-30 that both are dead ("checked 2026-10-30") and "left for their
    own removal".
-   **Checked again today.** `pnpm audit --prod --audit-level high` and
    `pnpm audit --prod --audit-level moderate` (`guard:audit-clean`), on the
    final lockfile, with the mirror and then without it: all four runs exit
    0 with "3 vulnerabilities found" and "1 low \| 2 high (2 ignored)". The
    whole-tree `pnpm audit --json` (devDependencies included) lists one
    advisory, deepmerge 4.3.1 (low, 10 paths), and counts two high ones it
    does not list (the ignored image-size pair, the `--prod` runs' "2 high
    (2 ignored)"); it names no brace-expansion. So the mirror hides nothing today, and
    tomorrow it would hide a regression below the pins from `pnpm audit`.
    Removed, for the reason the toml gives: a regression should fail loudly.
-   The two `.trivyignore` lines (`GHSA-mh99-v99m-4gvg`, `CVE-2026-14257`)
    are left as that file's header plans, with its text brought up to date;
    Trivy's result without them is in item 3 below.

---

## Lockfile

Compared as parsed YAML, `7bda9eb72a`'s `pnpm-lock.yaml` against this
change's (since the merge with `develop`, this branch's `pnpm-lock.yaml` is
byte-identical to `develop`'s at `27d8c17051`, which has the same change
from #998):

-   **Removed (1):** lodash 4.18.0 (with its `deprecated:` line).
-   **Added (1):** lodash 4.18.1, integrity the registry's `sha512`.
-   **Snapshots changed in place (3):** slate-dom 0.112.2, slate-react
    0.112.1 and workbox-build 7.4.0, each `lodash: 4.18.0` → `4.18.1`.
-   **Overrides:** `lodash@4.17.23: ^4.18.0` → `^4.18.1`.
-   Nothing else moved: no importer (18 before and after), no other
    snapshot, no `packages:` entry in place, no other top-level key. 1,491
    packages and 1,497 snapshots before and after.
-   One importer reaches the moved package, `apps/blackout-client`: through
    two dependencies (slate-dom, slate-react) and one devDependency
    (vite-plugin-pwa → workbox-build). No lint or test toolchain depends on
    lodash.

---

## Found outside the gates (not changed here)

1. **lodash 4.18.0's modular build was broken, and no gate could say so.**
   `lodash/template` and `lodash/fromPairs` throw `ReferenceError` when
   called (table above): the files use `assignWith`, `arrayEach` and
   `baseAssignValue` without requiring them. npm's deprecation ("Bad
   release") is the only signal, and no gate reads deprecations.
   workbox-build's `generateSW` path would have failed on it; the client
   never takes that path. 4.18.1 fixes it, so this change closes it as a
   side effect.
2. **slate-dom 0.112.2 declares lodash and never imports it.** Its built
   files require only `slate` and `is-hotkey`. On its own it would keep
   lodash in the client's production closure for nothing; slate-react needs
   it regardless.
3. **The `.trivyignore` brace-expansion entries are dead.** Trivy 0.69.3 with
   its DB of 2026-11-08 00:37Z, on the final tree with the two lines removed
   from a copy of `.trivyignore` (`security.yml`'s flags, `--skip-db-update`):
   exit 0, 0 CRITICAL/HIGH findings in all six targets, and
   `--show-suppressed` lists the same six suppressed rows as with the lines
   present (Twisted ×4 in `poetry.lock`, image-size ×2 in `pnpm-lock.yaml`),
   none of them brace-expansion. They stay for their own change, as that
   file's header has planned since 2026-10-30.
4. **The lodash override has no record.** It was added on 2026-04-22 by
   `2eaa6dbdfa` ("gitcheck fixes"), which put eight overrides into
   `package.json` at once, among them the exact pin
   `"lodash@4.17.23": "4.18.0"`, and moved `pnpm-lock.yaml` from lodash
   4.17.23 to 4.18.0. An earlier commit, `3ddaa49c2f` (2026-04-18), has
   lodash 4.17.23 and no lodash override. Both were read from GitHub (the API
   and a blobless fetch of each commit): this checkout is a shallow clone
   whose history stops at three boundary commits from 2026-08-10 to
   2026-08-30 (`eb71cc56c3`, `8669c26480`, `ea3d85d2c7`), which already have
   the pin. The caret came on 2026-09-04: `50335a9b06` (merged in #890)
   turned "the remaining 27 exact-version pins" into carets so that a later
   patch release could pass, and `"4.18.0"` became `"^4.18.0"`; no
   `docs/security` record came with it. This change makes it `"^4.18.1"`.
   Neither `2eaa6dbdfa` nor `50335a9b06` names a lodash advisory, and before
   this record
   `git grep -i lodash docs/security` found nothing. 4.18.0 is the `fixed`
   version of this advisory's lodash.unset and lodash.omit ranges, and the
   advisory's text names 4.18.0 and 4.18.1 as its patch releases, but which
   advisory first motivated the 4.18.0 pin is not written anywhere in this
   tree. This record is the first. (This record's first two commits dated
   the override from the shallow clone's boundary commits as if they were
   the start of the history: `7638734b9e` said the caret value was in the
   oldest of them, `4b398890e7` that the pin began there. Both are corrected
   here.)
5. **`pnpm install` warns about unmet peers** that predate this change and are
   not touched by it, among them: vite-plugin-static-copy 4.1.1 wants vite
   `^7.3.7` (found 8.1.6; that is the peer range the lockfile recorded for
   it, while the package's own manifest accepts vite 6, 7 and 8), vite-plugin-pwa 1.3.0 wants workbox-build and
   workbox-window `^7.4.1` (found 7.4.0; item 3 of the 2026-10-31 record),
   folds 2.6.1 wants react 17 and @vanilla-extract/css 1.9.2, and
   `packages/ui`'s react-dom 18.2.0 wants react `^18.2.0` (found 19.2.5).
6. **lodash 4.17.23's `template.js` does not parse** (a `SyntaxError`,
   `Unexpected identifier 'Array'`), per the harness. 4.17.23 is not in the
   lockfile; noted because it is the advisory's `introduced` version and the
   override key.

## Operator decisions

1. **Whether to remove the dead `.trivyignore` brace-expansion lines now**
   rather than in their own change. Trivy reports nothing for brace-expansion
   without them (item 3). Left as the file's header plans; the header text
   is current.

---

## Verification

Runs are local, with Node 22.22.0 and pnpm 9.15.4 (the pinned
`packageManager`), between 02:19Z and the commits on 2026-11-08. Commands
are as in `ci.yml` and `security.yml` where those run them. Heavy steps
waited for the 1-minute load average to fall under 3.5 (the machine is
shared with other runs).

| Gate                       | Command                                                                                                                                                                                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV, before                | osv-scanner v2.3.3 (sha256 matches `osv-scanner_SHA256SUMS`), `TZ=UTC`, `--lockfile=pnpm-lock.yaml`, on `7bda9eb72a`'s lockfile and toml, 02:24Z                                                                                                       | exit 1: 1,491 packages scanned, 3 filtered (deepmerge, image-size ×2), "has unused ignores: GHSA-g3hv-75wg-m249", 1 row (lodash 4.18.0, 6.5, fixed 4.18.1)                                                                                                                                                                                                                          |
| OSV                        | the same on this change, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`, 02:26Z                                                                                                                                                                       | exit 0 in all three: 1,491 packages, "No issues found", 3 filtered, no unused-ignore or multiple-ignore line                                                                                                                                                                                                                                                                        |
| lockfile                   | `pnpm install --lockfile-only --ignore-scripts` with the new override value, 02:23Z                                                                                                                                                                    | exit 0; the diff is the Lockfile section (6 hunks: the override line, the `packages:` entry, the `snapshots:` entry, three consumer snapshots)                                                                                                                                                                                                                                      |
| lockfile diff              | scratch script, parsed YAML, `7bda9eb72a` against this change                                                                                                                                                                                          | as in Lockfile                                                                                                                                                                                                                                                                                                                                                                      |
| install                    | `pnpm install --frozen-lockfile` in the worktree, 02:32Z                                                                                                                                                                                               | exit 0: "Lockfile is up to date, resolution step is skipped", 1 downloaded, 1 added; `pnpm why -r lodash`: slate-dom, slate-react and workbox-build on 4.18.1                                                                                                                                                                                                                       |
| frozen install, fresh copy | `git archive HEAD` of `258e8a0b4a` extracted to scratch, then `pnpm install --frozen-lockfile`                                                                                                                                                         | exit 0 in 8 s at 02:49Z: "Lockfile is up to date, resolution step is skipped", 1,389 packages added (1,383 reused from the store, 0 downloaded); `pnpm-lock.yaml` byte-identical to HEAD's afterwards; slate-dom, slate-react and workbox-build each link to `lodash@4.18.1`, the only lodash in `.pnpm`; husky's `prepare` prints ".git can't be found" in the archive and exits 0 |
| pnpm audit, before         | `pnpm audit --prod --audit-level high` (`security.yml`) and `--audit-level moderate` (`guard:audit-clean`), in an extracted `git archive` of `7bda9eb72a`                                                                                              | exit 0 both: "3 vulnerabilities found", "1 low \| 2 high (2 ignored)"; no lodash row (npm's audit data does not list 4.18.0), no minimatch row                                                                                                                                                                                                                                      |
| pnpm audit                 | the same on this change, with the GHSA-mh99 mirror present, then removed                                                                                                                                                                               | exit 0 in all four: "3 vulnerabilities found", "1 low \| 2 high (2 ignored)"                                                                                                                                                                                                                                                                                                        |
| pnpm audit, whole tree     | `pnpm audit --json` (dev included), on this change                                                                                                                                                                                                     | lists deepmerge 4.3.1 (low, 10 paths); counts 2 high it does not list (image-size ×2, ignored); nothing else                                                                                                                                                                                                                                                                        |
| Trivy                      | 0.69.3, `fs` scan of the extracted `git archive HEAD` (`258e8a0b4a`) with `security.yml`'s flags (`--severity CRITICAL,HIGH --ignore-unfixed --scanners vuln --exit-code 1 --ignorefile .trivyignore`) and `--skip-db-update`, DB of 2026-11-08 00:37Z | exit 0 at 02:46Z: six targets (`pnpm-lock.yaml`, `apps/blackout-server/{Cargo.lock,poetry.lock}`, `apps/blackout-server/services/blackout-api/requirements.txt`, `blackout-desktop/src-tauri/Cargo.lock`, `services/perturbation/requirements.txt`), 0 findings each; the same on `7bda9eb72a`'s extract at 02:43Z                                                                  |
| core, design builds        | `pnpm --filter @blackout/core run build`; `pnpm --filter @blackout/design run build` (the client's project references)                                                                                                                                 | exit 0 and exit 0 (2 s each)                                                                                                                                                                                                                                                                                                                                                        |
| client types               | `pnpm --filter @blackout/client run typecheck`                                                                                                                                                                                                         | exit 0 (35 s)                                                                                                                                                                                                                                                                                                                                                                       |
| client unit tests          | `pnpm --filter @blackout/client run test:coverage` (`vitest run tests/unit src --coverage`)                                                                                                                                                            | exit 0: 519 files, 3,643 passed, 3 skipped (3,646), 220 s                                                                                                                                                                                                                                                                                                                           |
| client smoke tests         | `pnpm --filter @blackout/client run test:integration` (`vitest run tests/smoke`)                                                                                                                                                                       | exit 0: 3 files, 13 passed, 10 s                                                                                                                                                                                                                                                                                                                                                    |
| client build               | `pnpm --filter @blackout/client run build`                                                                                                                                                                                                             | exit 0: 2,692 modules transformed, built in 13.75 s; 390 files in `dist`; `sw.js` 1,631 bytes, sha256 `34e9bd65…`, as in the 2026-10-31 record                                                                                                                                                                                                                                      |
| bundle size                | `du -sk --exclude='*.map' apps/blackout-client/dist` (`ci.yml`, `MAX_BUNDLE_KB` 29696)                                                                                                                                                                 | 25,312 KB (ceiling 29,696 KB)                                                                                                                                                                                                                                                                                                                                                       |
| lodash PoC and modules     | the harness above on the 4.17.23, 4.18.0 and 4.18.1 tarballs                                                                                                                                                                                           | as in the lodash section                                                                                                                                                                                                                                                                                                                                                            |
| prettier                   | `prettier --check` on the changed files (lint-staged runs `prettier --write` on commit; `pnpm-lock.yaml` is in `.prettierignore`)                                                                                                                      | pass on `docs/security/dependency-advisories-2026-11-08.md`, `docs/security/dependency-advisories-2026-10-31.md` and `package.json`; prettier has no parser for `osv-scanner.toml` and `.trivyignore`, which lint-staged skips with `--ignore-unknown`                                                                                                                              |
| auth-secrets guard         | `node tools/ci/check-auth-secrets.mjs`, before each commit                                                                                                                                                                                             | "Auth secret hardening check passed", exit 0, before each of the three commits (and again in the pre-commit hook)                                                                                                                                                                                                                                                                   |
| gitleaks                   | 8.21.2: `gitleaks dir --no-banner --redact` on the changed files before each commit; `security.yml`'s `gitleaks detect --redact --no-banner --log-opts=…` over the branch's commits                                                                    | `dir`: "no leaks found" on each of the five changed files and the record; range scan over `7bda9eb72a..258e8a0b4a` at 02:45Z: 2 commits scanned, no leaks found (the record's own commit is scanned after it exists; see the PR)                                                                                                                                                    |
| lint                       | none run: no lint toolchain depends on lodash (Lockfile)                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                   |
| after merging `develop`    | the merge `1cf8730eaa`: osv-scanner as above in `TZ=UTC`, `Etc/GMT-3` and `Pacific/Kiritimati`; `pnpm install --frozen-lockfile`; both `pnpm audit --prod` levels; `pnpm audit --json`; 03:39Z                                                         | OSV exit 0 in all three: 3 filtered (deepmerge, image-size ×2), "No issues found", no unused-ignore line; install exit 0, "Lockfile is up to date"; both audits exit 0, "3 vulnerabilities found", "1 low \| 2 high (2 ignored)"; the JSON lists deepmerge only, `muted` empty; `pnpm-lock.yaml` byte-identical to `develop`'s                                                      |

**Not verified:**

-   That GitHub's hosted runners scan in UTC was not checked on a runner;
    neither workflow sets `TZ`.
-   The advisory files' edit history, and so what GitHub's lodash range said
    before 2026-11-03 (Method).
-   The client's `dist` was not compared byte for byte with a build of
    `7bda9eb72a`; the fifteen lodash modules the bundle contains were
    compared instead, and are identical.
-   `generateSW` was not run; the `ReferenceError` on 4.18.0 was observed in
    the harness, not in workbox-build.
-   The client's e2e suites, the mobile and API suites and `cap sync` were
    not run: `apps/blackout-client` is the only importer that reaches
    lodash, and its typecheck, unit, smoke and build gates ran.
-   CI had not run on this branch when this record was committed; the PR
    runs it. `develop`'s own runs on `27d8c17051`, which carry the lodash
    change, are in the opening section.
