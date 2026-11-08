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
    `overrides:` block are as on develop. A temporary override was used
    between two installs (Lockfile).
-   **No importer moves**, and nothing in the client's tree moves.
-   **The ignores are deleted:** both `[[IgnoredVulns]]` and their comment in
    `osv-scanner.toml`, the two GHSAs and their CVE aliases in
    `.trivyignore`, and both GHSAs in `pnpm.auditConfig.ignoreGhsas`.
-   **Nothing here runs metro**, before or after. On react-native's own
    images and the repository's committed ones, metro 0.83.8 gives the same
    sizes, scales and hashes as 0.83.5 (Behaviour check).
-   **Both OSV gates are red on 2026-11-08 for a reason outside this
    change:** lodash 4.18.0 (GHSA-f23m-r3pf-42rh, fixed 4.18.1), reported
    since OSV changed that record on 2026-11-03, on develop and here alike.
    This change does not move lodash (Gates, "Re-run on 2026-11-08").

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
`settings:` unchanged.

| Change                                                                                                                                   | Reason                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| metro, metro-config, metro-core 0.83.5 → 0.83.8                                                                                          | the cli-plugin's own `^0.83.1` dependencies; metro 0.83.8 also pins the other two exactly                                                                                                                                                                               |
| metro-babel-transformer, -cache, -cache-key, -file-map, -minify-terser, -resolver, -transform-plugins, -transform-worker 0.83.5 → 0.83.8 | metro 0.83.8 and its siblings pin them exactly; the 0.83.5 copies had no other user                                                                                                                                                                                     |
| + metro-runtime, metro-source-map, metro-symbolicate, ob1 0.83.8, beside their 0.83.5 copies                                             | pinned exactly by metro 0.83.8 and its siblings. The 0.83.5 copies stay because react-native 0.82.1 depends on metro-runtime and metro-source-map `^0.83.1` itself, and metro-source-map 0.83.5 in turn pins metro-symbolicate and ob1 0.83.5; metro does not move them |
| hermes-parser, hermes-estree 0.33.3 → 0.35.0                                                                                             | exact pins of metro and metro-babel-transformer 0.83.8; 0.33.3's only users were their 0.83.5 copies                                                                                                                                                                    |
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
`pnpm update -r --depth Infinity metro 'metro-*' ob1` on develop gave, on
2026-11-02, 100 removed and 126 added, with @babel/core 7.29.7, terser
5.46.1 → 5.51.2 and 10 importer lines in the client and the legacy web. On
2026-11-08 the same command gives 100 removed and 130 added, with
@babel/core 7.29.13 (published 2026-11-04), the same terser move and the
same 10 importer lines (8 in `apps/blackout-client`, 2 in
`legacy/blackout-web`): the added count follows the registry; that babel
and terser move in the two vite trees does not. In pnpm 9.15.4's
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

The baseline ran on develop's install (metro 0.83.5). The run after ran on
a fresh `git archive` of this change with `pnpm install --frozen-lockfile`.

| Part                             | metro 0.83.5 (develop)                                                     | metro 0.83.8 (this change)                                                    |
| -------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A                                | 10 of 10, e.g. alert-triangle 48×42, close 28×28, loader 44×44             | identical: names, sizes, scales, hashes                                       |
| B                                | 70 of 70, 0 errors                                                         | identical: sha256, width and height                                           |
| C                                | ok on both platforms, 9,836 bytes, 5 assets                                | ok on both, 9,541 bytes, 5 assets                                             |
| module that measured `close.png` | image-size 1.2.1's `dist/` (25 files, with `heif.js`, `icns.js`, `jxl.js`) | `metro/src/lib/imageSize.js` only; `image-size` cannot be resolved from metro |

The only difference: the 5 `registerAsset` objects in the bundles differ
in `httpServerLocation`, a relative path from the scratch project to the
installed react-native, which sits in a different directory in the two
runs. With those 5 strings set aside the bundles are byte-identical, and the
295-byte difference is those strings.

## Gates

Run on 2026-11-02 on the tree the `fix(deps)` commit holds: Trivy and the
frozen install on a `git archive` of it, with node 22.22.0 and pnpm 9.15.4.
OSV, Trivy and the frozen install were run again on the tree with this
record added. The OSV and pnpm audit rows describe that date; both read
advisory data that changed afterwards, and "Re-run on 2026-11-08" below
says how.

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
snapshot keys. That reaches 1,032 snapshots on develop (`0367abdd69`) and
1,032 here, the same set; with the `link:` entries skipped it is 1,028 and
1,028, the same set. Neither set holds a metro, hermes, ob1, queue or
image-size entry.

### Re-run on 2026-11-08

Run after the review, on this tree with the record changes staged (they
touch no gate input): OSV, pnpm audit and guard:audit-clean in the worktree;
Trivy and the frozen install on a `git archive` of it, with node 22.22.0 and
pnpm 9.15.4.

-   **OSV exits 1 in all three time zones**, on one row this change did not
    touch: `GHSA-f23m-r3pf-42rh | 6.5 | npm | lodash | 4.18.0 | 4.18.1`
    (CVE-2026-2950, prototype pollution through array paths in `_.unset`,
    `_.omit` and `_.pullAt`; GitHub rates it Moderate). OSV's record was
    modified on 2026-11-03T15:45Z and now reads `introduced 4.17.23`,
    `fixed 4.18.1`; lodash 4.18.1 was published on 2026-04-01. lodash 4.18.0
    has been in the lock since 2026-08-30 (`ea3d85d2c7`, under the override
    `"lodash@4.17.23": "4.18.0"`, loosened to the current
    `"lodash@4.17.23": "^4.18.0"` on 2026-09-04 in `50335a9b06`), from
    slate-dom 0.112.2 and slate-react 0.112.1 in `apps/blackout-client` and
    from workbox-build 7.4.0 (dev). Its
    lines are byte-identical on develop and here, and it is not a metro
    dependency, so moving it is outside this change's lock rule. develop's
    own lock with develop's `osv-scanner.toml` exits 1 on the same row, and
    develop's runs of 2026-11-04T00:31Z on `7bda9eb72a` (Blackout CI
    41747526572, Security checks 41747526887) failed exactly the jobs
    `Dependency audit (no un-triaged advisories, any severity)` and
    `Dependency vulnerability audit`, with no later run. So the PR for this change
    opens red on `ci.yml`'s `audit-clean` and `security.yml`'s
    `dependency_audit` for a reason outside it, until lodash moves to 4.18.1
    in its own change or this one is stacked on that. With a lodash ignore
    added as a control, the scan exits 0 with "No issues found": lodash is
    the only driver. No run shows an image-size row.
-   **The scan reports GHSA-g3hv-75wg-m249 as an unused ignore**
    (`osv-scanner.toml has unused ignores: GHSA-g3hv-75wg-m249`) and filters
    1 (deepmerge), not 2. GitHub narrowed
    the minimatch advisory to `introduced 7.0.0`, `fixed 11.0.1` (OSV record
    modified 2026-11-04T17:01Z), so minimatch 3.1.5 is out of range and that
    entry and its `pnpm.auditConfig.ignoreGhsas` mirror are dead on develop
    and here. The line alone does not fail the gate (the control above
    prints it and exits 0). Removing them is -v54's change, not this one.
-   **pnpm audit** `--prod --audit-level high` and **guard:audit-clean**
    exit 0: "1 vulnerabilities found, Severity: 1 low" (deepmerge
    GHSA-gcqx-w48m-w2h4). The minimatch Moderate is no longer reported.
-   **Trivy** 0.69.3 with `security.yml`'s flags, DB of 2026-11-08T00:37Z
    with `--skip-db-update`: exit 0, 0 in all six targets;
    `--show-suppressed` lists the four Twisted entries only.
-   **frozen install** in a fresh `git archive`: exit 0, lock byte-identical
    (sha256 `ffeaeda5…f9d4b`), metro 0.83.8 and no image-size under
    `node_modules/.pnpm`.

## Overlap with other open branches

-   **-v52** (the Twisted 26.10.0 lock, not merged) rewrites the same
    image-size lines: the `osv-scanner.toml` block and both reasons, the
    `.trivyignore` block with `exp:2026-11-30`, and a bullet under item 8
    of the 2026-10-30 record, where this change adds its cross-reference.
    Whichever of the two merges second resolves the conflict by removal:
    the image-size entries and the comments about them go.
-   **-v54** (minimatch, not merged) moves `packages/ui` to react-native
    `^0.87.1`, which brings metro 0.87.2 and no image-size, and plans to
    delete the same ignores. Whichever lands first makes the other's
    image-size work moot. A lockfile conflict between the two is resolved by
    re-running `pnpm install` after the merge, never by hand. Then
    `grep -c image-size pnpm-lock.yaml` should be 0, and the cli-plugin's
    metro 0.83.8, or 0.87.2 once -v54 is in. Since 2026-11-04 OSV reports
    the GHSA-g3hv-75wg-m249 entry as an unused ignore (Re-run on
    2026-11-08): -v54's premise has changed, the entry is dead now rather
    than lapsing on 2026-12-01, and its removal, with the
    `pnpm.auditConfig` mirror, stands on that ground.

## Corrected after review

The first version of this record (`08d42da91b`) left three things out, and
three of its statements had gone stale by the review of 2026-11-08. They
are corrected above. The commit messages of `7e3cc87c59` and `08d42da91b`
repeat the OSV result ("exit 0 … 2 filtered … no unused-ignore line"), the
pnpm audit result ("1 moderate ignored") and the plain update's "126 added";
this section is their correction.

1.  **The OSV gates exit 1 since 2026-11-03**, on lodash 4.18.0
    (GHSA-f23m-r3pf-42rh, fixed 4.18.1): develop-wide, not a metro
    dependency, not moved here. The Gates rows are dated, and "Re-run on
    2026-11-08" gives the finding, the develop runs that fail on it, and
    why this change leaves lodash alone.
2.  **"2 filtered (deepmerge, minimatch), no unused-ignore line"** and
    **"1 moderate (1 ignored)"** held on 2026-11-02. GitHub narrowed
    GHSA-g3hv-75wg-m249 to minimatch ≥ 7.0.0 on 2026-11-04; the scanner now
    filters deepmerge only and reports that ignore as unused, and pnpm audit
    reports 1 low. The -v54 bullet says what that means for that branch.
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
8.  **"since 2026-08-30, under develop's override `"lodash@4.17.23": "^4.18.0"`"**
    joined a date to a spelling the override did not have then. lodash
    4.18.0 entered the lock on 2026-08-30 (`ea3d85d2c7`) under
    `"lodash@4.17.23": "4.18.0"`; the `^4.18.0` spelling dates from
    2026-09-04 (`50335a9b06`). The clause now dates both.

## Not verified

-   metro's other changed files between 0.83.5 and 0.83.8 (the server, HMR,
    file map, resolution) were not read line by line, and the dev server,
    HMR and watcher were not run. After this change react-native keeps
    metro-runtime 0.83.5 while metro uses 0.83.8, which the `^0.83.1`
    ranges allow and nothing here runs.
-   No `react-native bundle` was run (see Behaviour check).
-   CI's runners were not observed.
