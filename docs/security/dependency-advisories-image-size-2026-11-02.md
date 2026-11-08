# Dependency advisory triage — image-size, 2026-11-02

Two HIGH advisories against image-size 1.2.1 were ignored in all three
places the repository keeps ignores, with `ignoreUntil = 2026-11-30` in
`osv-scanner.toml`. This change removes image-size from `pnpm-lock.yaml` by
moving metro from 0.83.5 to 0.83.8, inside the range its parent already
asks for, and deletes the ignores. The operator decided on 2026-11-02 to
build it now.

**Result:**

-   **image-size is gone from the lock** (`grep -c image-size pnpm-lock.yaml`
    is 0). metro 0.83.8 measures images with a parser of its own.
-   **No override is committed.** `pnpm.overrides` and the lock's
    `overrides:` block are as on develop (`27d8c17051`, merged into this
    branch on 2026-11-08). A temporary override was used between two
    installs (Lockfile).
-   **No importer moves**, and nothing in the client's tree moves.
-   **The ignores are deleted:** both `[[IgnoredVulns]]` and their comment in
    `osv-scanner.toml`, the two GHSAs and their CVE aliases in
    `.trivyignore`, and both GHSAs in `pnpm.auditConfig.ignoreGhsas`.
-   **Nothing here runs metro**, before or after. On react-native's own
    images and the repository's committed ones, metro 0.83.8 gives the same
    sizes, scales and hashes as 0.83.5 (Behaviour check).
-   **develop is merged in** (`27d8c17051`, 2026-11-08), which brings #998's
    lodash 4.18.1. The merge was clean, and against develop the lock change
    is the same as it was against the old base `0367abdd69`. On the merged
    head the OSV gates, Trivy, `pnpm audit` and the frozen install pass
    (Gates, "Re-run on the merged head").

---

## The advisories

| Advisory            | CVE            | Parser    | OSV range (SEMVER) | GitHub range (`pnpm audit`) | Fixed |
| ------------------- | -------------- | --------- | ------------------ | --------------------------- | ----- |
| GHSA-5p2g-fcmc-qvqq | CVE-2025-71329 | JXL, HEIF | introduced 1.2.0   | `>=1.2.0 <=2.0.2`           | 2.0.3 |
| GHSA-w3rx-r6r6-pgpr | CVE-2025-71330 | ICNS      | introduced 0.6.3   | `>=0.6.3 <=2.0.2`           | 2.0.3 |

-   Both are an infinite loop in the parser (CWE-835), rated HIGH by GitHub
    (CVSS 3.1 `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`; OSV's table prints the
    CVSS 4 score, 8.7). Published 2026-06-10. The records were last modified
    on 2026-09-24.
-   OSV's ranges come from `api.osv.dev/v1/vulns/<id>`. GitHub's come from
    the reviewed records in `github/advisory-database` (`introduced` 1.2.0
    and 0.6.3, `fixed` 2.0.3, `last_known_affected_version_range` `<= 2.0.2`)
    and from `pnpm audit`'s "Vulnerable versions". GitHub's `/advisories`
    API is not reachable from this session.
-   image-size 2.0.3 and 2.0.4 were published on 2026-09-14. The 1.x line
    has no fixed release: 1.2.1 is its newest, npm's `legacy` tag.
-   So the ignores' comment and both `reason`s ("No fixed version exists")
    had been false since 2026-09-14 (item 8 of "Found outside the gates" in
    `dependency-advisories-2026-10-30.md`).

## Lockfile

image-size 1.2.1 came only from metro 0.83.5 (`image-size ^1.0.2`), under
`@react-native/community-cli-plugin` 0.82.1 (`metro ^0.83.1`), under
react-native 0.82.1 in `packages/ui` and, through it, `legacy/blackout-web`.
metro 0.83.8 is the `0.83-stable` tag (published 2026-08-19; `latest` was
0.87.2 on 2026-11-02 and is 0.88.0, published 2026-11-06, on 2026-11-08) and
no longer lists image-size. 0.83.6 and 0.83.7 still do.

Parsed as YAML, against develop's lock: packages 1,491 → 1,493, 15 removed,
17 added, 1 snapshot changed, 0 importer lines, `overrides:` and
`settings:` unchanged. The diff is the same against the old base
`0367abdd69` and against `27d8c17051`, the develop merged in on 2026-11-08,
whose only lock change is lodash.

| Change                                                                                                                                   | Reason                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| metro, metro-config, metro-core 0.83.5 → 0.83.8                                                                                          | the cli-plugin's own `^0.83.1` dependencies; metro 0.83.8 also pins the other two exactly                                                                                                                                                                               |
| metro-babel-transformer, -cache, -cache-key, -file-map, -minify-terser, -resolver, -transform-plugins, -transform-worker 0.83.5 → 0.83.8 | metro 0.83.8 and its siblings pin them exactly; the 0.83.5 copies had no other user                                                                                                                                                                                     |
| + metro-runtime, metro-source-map, metro-symbolicate, ob1 0.83.8, beside their 0.83.5 copies                                             | pinned exactly by metro 0.83.8 and its siblings. The 0.83.5 copies stay because react-native 0.82.1 depends on metro-runtime and metro-source-map `^0.83.1` itself, and metro-source-map 0.83.5 in turn pins metro-symbolicate and ob1 0.83.5; metro does not move them |
| hermes-parser 0.33.3 → 0.35.0                                                                                                            | pinned exactly by metro and metro-babel-transformer 0.83.8; 0.33.3's only users were their 0.83.5 copies                                                                                                                                                                |
| hermes-estree 0.33.3 → 0.35.0                                                                                                            | pinned exactly by hermes-parser 0.35.0; 0.33.3's only user was hermes-parser 0.33.3                                                                                                                                                                                     |
| − image-size 1.2.1, − queue 6.0.2                                                                                                        | metro 0.83.8 does not depend on image-size; queue's only user was image-size                                                                                                                                                                                            |
| ~ `@react-native/community-cli-plugin@0.82.1`                                                                                            | its metro, metro-config and metro-core now resolve to 0.83.8                                                                                                                                                                                                            |

No babel, terser or client entry is added, removed or changed. Inside the
new snapshots, resolutions move only to versions already in the lock: metro,
metro-source-map, metro-transform-plugins and metro-transform-worker 0.83.8
point `@babel/code-frame`, `generator`, `parser`, `template`, `traverse` and
`types` at 7.29.7, where the 0.83.5 snapshots pointed at 7.29.0, 7.29.1,
7.29.2, 7.28.6, 7.29.0 and 7.29.0. Two dependency lists differ as well:
metro 0.83.8 no longer lists chalk (chalk 4.1.2 stays; seven other packages,
jest's and eslint 8.29.0, use it), and metro-babel-transformer 0.83.8 adds
metro-cache-key 0.83.8, already in the table as a moved sibling. The
integrity of all 17 new entries matches
`npm view <name>@<version> dist.integrity`.

**How it was made.** The plain update is not narrow. A lockfile-only
`pnpm update -r --depth Infinity metro 'metro-*' ob1` on develop
(`0367abdd69`) gave, on 2026-11-02, 100 removed and 126 added, with @babel/core 7.29.7, terser
5.46.1 → 5.51.2 and 10 importer lines in the client and the legacy web. On
2026-11-08, on the same base, the same command gave 100 removed and 130
added, with
@babel/core 7.29.13 (published 2026-11-04), the same terser move and the
same 10 importer lines (8 in `apps/blackout-client`, 2 in
`legacy/blackout-web`). On `27d8c17051` it gives 129 added, because that
develop already has lodash 4.18.1, which the update otherwise adds. So the
added count follows the registry and the base; that babel and terser move
in the two vite trees does not. In pnpm 9.15.4's
`dist/pnpm.cjs`, update mode resolves with no lockfile-preferred versions,
a dependency whose parent has no snapshot in the lock (every child of the
new metro) resolves as an update, and `ctx.updatedSet` then moves every
other copy of the names that moved. Install mode keeps the lock's versions
where ranges allow, so the lock came from two installs:

1.  With three temporary entries in the root `pnpm.overrides`:
    `"@react-native/community-cli-plugin>metro"`, `>metro-config` and
    `>metro-core`, each `"0.83.8"`. Then `pnpm install`.
2.  With `package.json` restored (only the `ignoreGhsas` edit kept). Then
    `pnpm install` again, which left step 1's packages and changed only the
    `overrides:` block back to develop's.

Run over the worktree's installed tree, this gave sha256 `ffeaeda5…f9d4b`,
the same lock a manifests-only copy gives. The override never reaches a
commit.

## What metro 0.83.8 uses instead

-   `src/lib/imageSize.js` (502 lines), with
    `getImageDimensions(type, content, filePath)`. It has parsers for bmp,
    gif, jpeg/jpg, ktx, png, psd, svg, tiff and webp, the list
    `isAssetTypeAnImage` accepts. It has no JXL, HEIF or ICNS code, the
    formats both advisories are about.
-   It tries the extension's parser, then the others. It throws
    `Invalid <type> image asset: <path>` unless width and height come out
    finite and positive.
-   Each of its loops is bounded (read in the installed file). The JPEG
    segment loop moves on by at least one byte per pass and rejects a
    segment length under 2. The WebP chunk loop stops when the next offset
    does not move forward. TIFF reads the entries of one directory, after
    checking they fit in the file. SVG looks only at the first 64 KiB.
-   It measures differently from image-size 1.2.1 in several cases,
    measured on 2026-11-08 with the installed 0.83.8 against image-size
    1.2.1 on synthetic inputs, through each metro's own
    `Assets.getAssetSize` and through the raw parsers. Two now throw
    `Invalid svg image asset` where image-size measured, so a bundle that
    builds with 0.83.5 fails with 0.83.8: an SVG root with `width="0"
height="0"` and a `viewBox` (common in sprites; image-size gives 24×24
    from the viewBox, while 0.83.8 takes 0×0 and rejects any size that is
    not positive), and a dimension in `m` (image-size 38×38; 0.83.8 has no
    `m` unit). The third is an overwrite. The 0.83.8 parser finds the root
    `<svg>` tag's dimensions with
    `/\b(width|height|viewBox)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi` (line 258)
    and keeps the last match of each name. `-` is a word boundary, so a
    `stroke-width`, `data-height` or any other `*-width` or `*-height`
    attribute that comes after the real one overwrites it. image-size 1.2.1
    requires whitespace before the name (`\swidth=`). Measured with the
    installed 0.83.8 against image-size 1.2.1: a Lucide-style root
    `width="24" height="24" viewBox="0 0 24 24" … stroke-width="2"` gives
    2×24 (image-size 24×24); `viewBox="0 0 24 24" stroke-width="2"` gives
    2×2 (24×24); `width="100" height="50" data-height="7"` gives 100×7
    (100×50). With `stroke-width` before `width` both give 24×24. Upstream
    changed the pattern to `(?<![\w:-])(width|height|viewBox)` in metro
    0.87.2 (2026-10-26), and 0.87.3 and 0.88.0 have it; 0.83.8 (the newest
    0.83.x), 0.84.6 (`0.84-stable`) and 0.87.1 still have `\b`, so the fix
    is not on the 0.83 line. The rest give a different size, or now
    measure where image-size did not. Spaces around `=` and uppercase
    `WIDTH`/`HEIGHT` give 24×24 against image-size's 48×48 (it matches only
    a lowercase `\swidth=` and falls back to the viewBox). `pc` units give
    48×48 where image-size threw. A comma-separated viewBox gives 30×20
    where image-size gave no size. A root tag that ends after byte 1000
    measures where image-size did not detect SVG. Outside SVG, a BMP with
    an OS/2 core header, a JPEG with SOF3 or SOF9, a big-endian KTX1 and a
    WebP whose VP8X is not the first chunk measure correctly on 0.83.8,
    where image-size gave wrong sizes or threw. Nothing here is affected:
    all 70 committed images and the 10 react-native images measure the same
    under both (parts A and B of the behaviour check), none of the four
    tracked SVGs has any of these patterns on its root tag, `packages/ui`
    and `legacy/blackout-web` hold no image files, and nothing runs metro.
    An asset added later with one of them would fail the bundle (a
    zero-size root with a viewBox, an `m` unit) or be measured wrongly (a
    `*-width` or `*-height` attribute after the real one) by 0.83.8.
-   `src/Assets.js`: `getAssetSize` calls `getImageDimensions` where it
    called `imageSize(content)`. `getAssetData` used to pass a file path to
    image-size, which read the file. It now reads the first file's bytes
    once and goes through `getAssetSize`. `getAsset` checks
    `fileExistsInFileMap` for each scale file and for the last one.

## Behaviour check

Nothing in this repository runs metro. No package script, workflow or
`turbo.json` task runs metro, the react-native CLI or a bundle. No
`metro.config.*`, `babel.config.*` or `app.json` is tracked. CI's
`pnpm install --frozen-lockfile` jobs install metro and never execute it.
`react-native bundle` cannot run here: `@react-native-community/cli` and
`@react-native/babel-preset` are not in the lock. So the check drives
metro's own API:

-   **A.** `Assets.getAssetData` on every image react-native 0.82.1 ships:
    the 5 LogBox PNGs a bundle would parse, and 5 ReactAndroid
    `ic_resume.png`.
-   **B.** `Assets.getAssetSize` on all 70 committed images of a type metro
    accepts (64 png, 4 svg, 1 jpg, 1 gif). The one other tracked image,
    `apps/blackout-client/public/favicon.ico`, is not an asset type metro
    parses (`isAssetTypeAnImage` has no `ico`), so the check leaves it out.
-   **C.** `Metro.runBuild`, ios and android, `dev: false`, of a scratch
    entry that requires the 5 LogBox PNGs through `node_modules/react-native`,
    with a no-op asset registry. The `registerAsset` objects are read out of
    the bundle.

The baseline ran on the 2026-11-02 install of develop at `0367abdd69`
(metro 0.83.5); develop changed no image file and no metro entry in the
lock between that and `27d8c17051`. The run after ran on
a fresh `git archive` of this change with `pnpm install --frozen-lockfile`,
and again on 2026-11-08 on a fresh `git archive` of the merge with develop
(`7a0ffafb72`), with the same results; the table gives that run.

| Part                             | metro 0.83.5 (develop)                                                     | metro 0.83.8 (this change)                                                    |
| -------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A                                | 10 of 10, e.g. alert-triangle 48×42, close 28×28, loader 44×44             | identical: names, sizes, scales, hashes                                       |
| B                                | 70 of 70, 0 errors                                                         | identical: sha256, width and height                                           |
| C                                | ok on both platforms, 9,836 bytes, 5 assets                                | ok on both, 9,581 bytes, 5 assets                                             |
| module that measured `close.png` | image-size 1.2.1's `dist/` (25 files, with `heif.js`, `icns.js`, `jxl.js`) | `metro/src/lib/imageSize.js` only; `image-size` cannot be resolved from metro |

The only difference: the 5 `registerAsset` objects in the bundles differ
in `httpServerLocation`, a relative path from the scratch project to the
installed react-native, which sits in a different directory in the two
runs. With those 5 strings set aside the bundles are byte-identical, and the
255-byte difference is those strings (295 bytes on 2026-11-02, from another
install directory).

## Gates

Run on 2026-11-02 on the tree the `fix(deps)` commit holds: Trivy and the
frozen install on a `git archive` of it, with node 22.22.0 and pnpm 9.15.4.
OSV, Trivy and the frozen install were run again on the tree with this
record added. The OSV and pnpm audit rows describe that date; both read
advisory data that changed afterwards. develop was merged in on 2026-11-08
and every gate ran again on the merged head ("Re-run on the merged head"
below).

| Gate           | Command                                                                                                                                                                                             | Result                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV            | osv-scanner 2.3.3 (sha256 matches), `--lockfile=pnpm-lock.yaml`, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`, 17:00Z                                                                            | on 2026-11-02, exit 0 in all three: 1,493 packages, "No issues found", 2 filtered (deepmerge, minimatch), no unused-ignore line, no image-size row. Exit 1 since 2026-11-03 on lodash, outside this change (re-run below) |
| OSV, control   | develop's lock with this `osv-scanner.toml`                                                                                                                                                         | exit 1: GHSA-5p2g and GHSA-w3rx on image-size 1.2.1, fixed 2.0.3                                                                                                                                                          |
| Trivy          | 0.69.3 (checksum OK), `fs --scanners vuln --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 --ignorefile .trivyignore`, DB of 2026-11-02T13:15Z with `--skip-db-update`, on the `git archive` | exit 0, 0 in every target; `--show-suppressed`: the four Twisted entries only                                                                                                                                             |
| Trivy, control | develop's lock with this `.trivyignore`                                                                                                                                                             | exit 1: CVE-2025-71329 and CVE-2025-71330, HIGH, fixed 2.0.3                                                                                                                                                              |
| pnpm audit     | `pnpm audit --prod --audit-level high`; `pnpm guard:audit-clean`                                                                                                                                    | on 2026-11-02, exit 0 both: "2 vulnerabilities found, 1 low \| 1 moderate (1 ignored)" (deepmerge; minimatch). On 2026-11-08, exit 0 both, "1 low" (re-run below)                                                         |
| frozen install | `pnpm install --frozen-lockfile` in a fresh `git archive`                                                                                                                                           | exit 0, lock byte-identical                                                                                                                                                                                               |
| packages       | `pnpm --filter @blackout/ui` build, test, lint; `--filter @blackout/blackout-web` lint, build                                                                                                       | exit 0. ui `lint` first exited 2 with TS6305 (packages/core and packages/design not built yet) and exits 0 after the build, the order turbo's `^build` gives it                                                           |
| client         | `pnpm --filter @blackout/client build`                                                                                                                                                              | exit 0                                                                                                                                                                                                                    |
| prettier       | `prettier --check` on the changed files                                                                                                                                                             | pass                                                                                                                                                                                                                      |
| gitleaks       | 8.21.2, `gitleaks git` over `fix(deps)`; `gitleaks dir` over the two record files                                                                                                                   | no leaks                                                                                                                                                                                                                  |

The client's unit tests and typecheck were not run: nothing they load
moved. Counted from `pnpm-lock.yaml` read as YAML: start at the importer
`apps/blackout-client` (its `dependencies`, `devDependencies` and
`optionalDependencies`), follow its three `link:` entries to the importers
`packages/core`, `packages/blackout-protocol` and `packages/blackout-sdk`
(and the sdk's own link to the protocol) with the same three fields, then
walk each snapshot's `dependencies` and `optionalDependencies`, counting
snapshot keys. That reaches 1,032 snapshots on develop and 1,032 here, the
same set, both before the merge (`0367abdd69` against `0053f8bfb8`) and
after it (`27d8c17051` against the merged head); with the `link:` entries
skipped it is 1,028 and 1,028, the same set. The merge moves lodash inside
that set, on develop and here alike. Neither set holds a metro, hermes,
ob1, queue or image-size entry.

### Re-run on the merged head, 2026-11-08

develop (`27d8c17051`) was merged in with `7a0ffafb72`. git merged
`package.json` and `pnpm-lock.yaml` without a conflict, so the lock was not
regenerated. Parsed as YAML, the merged lock differs from develop's exactly
as the Lockfile section says, and from `0053f8bfb8`'s only in lodash 4.18.0
→ 4.18.1, develop's change. Trivy ran on a fresh `git archive` of
`7a0ffafb72` with nothing installed; the frozen install, the behaviour
check and the package builds on another, installed by that frozen install;
OSV, pnpm audit and guard:audit-clean in the worktree with this round's
edits (the `osv-scanner.toml` comment and this record) staged. The commits
after the merge change only that comment and this record. Node 22.22.0,
pnpm 9.15.4.

| Gate                                                         | Result                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`, 04:21Z | exit 0 in all three: 1,493 packages, "No issues found", 1 filtered (deepmerge), no image-size or lodash row. One line, `osv-scanner.toml has unused ignores: GHSA-g3hv-75wg-m249`: the minimatch entry, not one of this change's (below). It does not fail the gate |
| OSV, control                                                 | develop's lock (`27d8c17051`) with this `osv-scanner.toml`: exit 1, GHSA-5p2g and GHSA-w3rx on image-size 1.2.1, fixed 2.0.3, no other row                                                                                                                          |
| Trivy                                                        | DB of 2026-11-08T00:37Z with `--skip-db-update`: exit 0, 0 in all six targets; `--show-suppressed` lists the four Twisted entries only                                                                                                                              |
| pnpm audit                                                   | `--prod --audit-level high` and guard:audit-clean: exit 0 both, "1 vulnerabilities found, Severity: 1 low" (deepmerge GHSA-gcqx-w48m-w2h4)                                                                                                                          |
| frozen install                                               | exit 0, "Lockfile is up to date", lock byte-identical (sha256 `89e30d37…8a7c`); metro 0.83.8 and lodash 4.18.1 under `node_modules/.pnpm`, no image-size                                                                                                            |
| overrides                                                    | all 39 bind: no version in the lock is left inside an override's selector range and outside its target; the same result as on develop's lock                                                                                                                        |
| behaviour check                                              | as in the Behaviour check table: A 10 of 10 and B 70 of 70 identical to the baseline, C identical apart from `httpServerLocation`                                                                                                                                   |
| packages                                                     | `pnpm --filter "@blackout/ui^..."` build (its workspace dependencies), then `--filter @blackout/ui` build, test, lint and `--filter @blackout/blackout-web` lint, build: exit 0 each                                                                                |
| client                                                       | `pnpm --filter @blackout/client build`: exit 0. Its unit tests and typecheck were not run: it reaches the same snapshots as on develop (above)                                                                                                                      |
| prettier                                                     | `prettier --check` on the changed Markdown and `package.json`: pass (it has no parser for `osv-scanner.toml` or `.trivyignore`)                                                                                                                                     |
| gitleaks                                                     | 8.21.2, `gitleaks detect --redact` over `0367abdd69..HEAD` and over `origin/develop..HEAD` (the PR range); `gitleaks dir` over this record and `osv-scanner.toml`: no leaks                                                                                         |

-   **Before the merge** the OSV scan exited 1 from 2026-11-03 on one row
    this change did not touch: lodash 4.18.0, GHSA-f23m-r3pf-42rh
    (CVE-2026-2950, prototype pollution through array paths in `_.unset`,
    `_.omit` and `_.pullAt`; fixed 4.18.1), reported since OSV modified
    that record on 2026-11-03T15:45Z. It was develop-wide and not a metro
    dependency. #998 (`77e6e68182`, merged as `27d8c17051` at
    2026-11-08T03:36Z) moved the override to `"lodash@4.17.23": "^4.18.1"`
    and lodash to 4.18.1 on develop, and the merge brought that here.
-   **The unused-ignore line.** GitHub narrowed GHSA-g3hv-75wg-m249 to
    `introduced 7.0.0`, `fixed 11.0.1` on 2026-11-04 (OSV record modified
    17:01Z), so minimatch 3.1.5 is out of range, and that entry and its
    `pnpm.auditConfig.ignoreGhsas` mirror are dead, on develop and here.
    #999 removes them (Overlap); this change leaves them and qualifies the
    `osv-scanner.toml` header sentence it edits. pnpm audit no longer
    reports the minimatch Moderate for the same reason.
-   **CI.** develop's runs on `27d8c17051` (Blackout CI 42443420808,
    Security checks 42443420809, 2026-11-08T03:36Z) succeeded, with
    `Dependency audit (no un-triaged advisories, any severity)` and
    `Dependency vulnerability audit` among their jobs. With develop merged
    in, the branch head carries lodash 4.18.1 too: `ci.yml`'s `push`
    trigger, which has no branch filter, runs `audit-clean` on the head,
    and the PR's merge ref is what `security.yml`'s `pull_request` run
    audits. Neither has run on this head; the branch is not pushed.

## Overlap with other open branches

-   **-v52** (the Twisted 26.10.0 lock, not pushed) rewrites the same
    image-size lines: the `osv-scanner.toml` block and both reasons, the
    `.trivyignore` block with `exp:2026-11-30`, and a bullet under item 8
    of the 2026-10-30 record, where this change adds its cross-reference.
    Whichever of the two merges second resolves the conflict by removal:
    the image-size entries and the comments about them go.
-   **#999** (-v61) merged on 2026-11-08 at 05:51Z, with #1000 (the
    desktop release workflow) after it. It removed the dead minimatch
    GHSA-g3hv-75wg-m249 entry and its `pnpm.auditConfig` mirror, dropped
    the brace-expansion GHSA-mh99-v99m-4gvg mirror from `ignoreGhsas`, and
    rewrote the headers of `osv-scanner.toml` and `.trivyignore`. develop
    at `0f9df74349` was then merged into this branch, with two conflicts,
    resolved by removal as this section had planned. In `osv-scanner.toml`
    the header keeps #999's sentences and adds this change's image-size
    sentence, without this change's earlier minimatch clause, and the
    image-size block is gone. In `package.json`, `ignoreGhsas` is empty:
    #999 removed GHSA-mh99 and GHSA-g3hv, and this change GHSA-5p2g and
    GHSA-w3rx. `.trivyignore` merged cleanly; its header gains a line for
    the image-size entries and this record. The lock did not conflict:
    neither #999 nor #1000 changed it.
-   **-v54** (eslint 8 → 10 and minimatch, local and not pushed) moves
    `packages/ui` to react-native `^0.87.1`, which brings metro 0.87.2 and
    no image-size, and planned on 2026-11-02 to delete the same image-size
    ignores. metro 0.87.2 also has the SVG fix (What metro 0.83.8 uses
    instead). Whichever of -v54 and this change lands first makes the
    other's image-size work moot. A lockfile conflict between the two is
    resolved by re-running `pnpm install` after the merge, never by hand.
    Then `grep -c image-size pnpm-lock.yaml` should be 0, and the
    cli-plugin's metro 0.83.8, or 0.87.2 once -v54 is in. The
    GHSA-g3hv-75wg-m249 removal is #999's.

## Corrected after review

The first version of this record (`08d42da91b`) left three things out, and
three of its statements had gone stale by the review of 2026-11-08. They
are corrected above. The commit messages of `7e3cc87c59` and `08d42da91b`
repeat the OSV result ("exit 0 … 2 filtered … no unused-ignore line"), the
pnpm audit result ("1 moderate ignored") and the plain update's "126 added";
this section is their correction.

1.  **The OSV gates exited 1 from 2026-11-03**, on lodash 4.18.0
    (GHSA-f23m-r3pf-42rh, fixed 4.18.1): develop-wide, not a metro
    dependency, not moved by this change. #998 fixed it on develop, and
    since the merge of 2026-11-08 the gates exit 0 here ("Re-run on the
    merged head").
2.  **"2 filtered (deepmerge, minimatch), no unused-ignore line"** and
    **"1 moderate (1 ignored)"** held on 2026-11-02. GitHub narrowed
    GHSA-g3hv-75wg-m249 to minimatch ≥ 7.0.0 on 2026-11-04; the scanner now
    filters deepmerge only and reports that ignore as unused, and pnpm audit
    reports 1 low. The #999 bullet names the open PR that removes the dead
    entry.
3.  **The lock table** left out two in-snapshot changes, metro 0.83.8
    dropping chalk and metro-babel-transformer 0.83.8 adding
    metro-cache-key, and put the kept metro-symbolicate and ob1 0.83.5
    copies down to react-native's ranges directly; metro-source-map 0.83.5,
    which react-native keeps, pins them. The babel re-resolutions inside the
    new snapshots are now listed too.
4.  **"`latest` is 0.87.2"** was true on 2026-11-02; metro 0.88.0 was
    published on 2026-11-06. The sentence is dated.
5.  **"100 removed and 126 added"** for the plain update was the registry of
    2026-11-02. The sentence is dated, gives the 2026-11-08 figures, and
    says which part of the finding is stable.
6.  **"all 70 committed images"** left out `favicon.ico`, which metro does
    not parse. The check's scope is now stated.

A second review on 2026-11-08, of `1a54bfa7cb`, found two more. Both are
corrected above; the commit message of `1a54bfa7cb` repeats the lodash
clause of item 8.

7.  **"The 1,032 snapshots reachable from `apps/blackout-client`"** gave no
    counting method, and two traversals of the lock got 1,028 and 1,035 for
    it. The sentence now says how the count is made (the importer's three
    dependency fields, its workspace links followed, each snapshot's
    `dependencies` and `optionalDependencies`, snapshot keys), gives 1,032
    for that method and 1,028 with the links skipped, and keeps what it was
    there to say: the same set before and after.
8.  **The lodash dating.** The first version said "since 2026-08-30,
    under develop's override `"lodash@4.17.23": "^4.18.0"`", and the second
    review's correction said lodash 4.18.0 entered the lock on 2026-08-30
    in `ea3d85d2c7` under `"4.18.0"`. Both start dates were wrong. This
    checkout is a shallow clone (`git rev-parse --is-shallow-repository`
    is true) whose history stops at the boundary commits `eb71cc56c3`,
    `8669c26480` and `ea3d85d2c7` (2026-08-10 to 2026-08-30), and
    `git log -S` attributes every older line to a boundary commit. Read
    through the GitHub REST API: the override `"lodash@4.17.23": "4.18.0"`
    and lodash 4.18.0 entered `package.json` and `pnpm-lock.yaml` on
    2026-04-22 in `2eaa6dbdfa` ("gitcheck fixes"), whose parent
    `3d06f75d88` has lodash 4.17.23 and no lodash override; `50335a9b06`
    (2026-09-04) made it `"^4.18.0"`, and #998 `"^4.18.1"`. With develop
    merged in, the record no longer needs that history, so the sentence is
    removed rather than dated again. A line dated from a boundary commit
    needs that commit's parent in the clone first.

A third review on 2026-11-08, of `0053f8bfb8`, made seven findings, two
of them the lodash dating of item 8. All are corrected above. The commit
messages of `1a54bfa7cb` and `0053f8bfb8` repeat that dating, and the
message of `1a54bfa7cb` the statements of item 11; this section is their
correction.

9.  **The SVG divergence.** "What metro 0.83.8 uses instead" described the
    parser's formats and bounds but not the one known way it measures
    differently from image-size 1.2.1: an `*-width` or `*-height`
    attribute after the real one on the root `<svg>`. A bullet now gives
    the pattern, the measurements, the upstream fix (metro 0.87.2, not on
    the 0.83 line) and why nothing here is affected.
10. **The lodash dating** (item 8).
11. **The statements about develop and the PR.** "Both OSV gates are red
    … on develop and here alike", "develop's own lock … exits 1", "the PR
    for this change opens red … until lodash moves to 4.18.1" and "the
    current `^4.18.0`" went stale at 2026-11-08T03:36Z, when #998 merged
    as `27d8c17051`, 38 minutes after `0053f8bfb8`. develop is now merged
    in, the gates ran again on the merged head, and the record names the
    base its develop comparisons refer to.
12. **#999 was missing from the overlap section**, and the removal of the
    dead GHSA-g3hv-75wg-m249 entry was credited to -v54. #999 is open,
    makes that removal, and conflicts with this branch in `osv-scanner.toml`
    and `package.json`. A bullet now gives the files and the resolution.
13. **The `osv-scanner.toml` header line this change edits** still said
    one minimatch version "is left in that advisory's range", false since
    2026-11-04. The clause now says it was, until GitHub moved the range's
    start to 7.0.0, and that the scanner reports the entry as unused.
14. **The lock table's hermes row** gave hermes-estree the reason that
    fits hermes-parser. The row is split: metro and metro-babel-transformer
    pin hermes-parser, and hermes-parser pins hermes-estree.

A fourth review on 2026-11-08, of `267b2bbd94`, made two low findings. Both
are corrected above.

15. **The parser's differences.** The bullet named one way 0.83.8 measures
    differently from image-size 1.2.1. It now names the others measured on
    synthetic inputs, first the two that throw where image-size measured (a
    zero-size SVG root with a viewBox, and an `m` unit), and widens the
    warning about assets added later to them.
16. **The plain update's count.** "On 2026-11-08 the same command gives
    100 removed and 130 added" was measured on `0367abdd69` and did not say
    so. On `27d8c17051` it gives 129, because that develop already has
    lodash 4.18.1. The sentence and the behaviour baseline now name their
    base.

## Not verified

-   metro's other changed files between 0.83.5 and 0.83.8 (the server, HMR,
    file map, resolution) were not read line by line, and the dev server,
    HMR and watcher were not run. After this change react-native keeps
    metro-runtime 0.83.5 while metro uses 0.83.8, which the `^0.83.1`
    ranges allow and nothing here runs.
-   No `react-native bundle` was run (see Behaviour check).
-   CI had not run on this branch's head when this record was committed;
    the PR runs it. develop's runs on `27d8c17051` were read through
    `gh run view`.
-   The parser's differences were measured on synthetic inputs and the
    committed images, not on a real React Native asset.
