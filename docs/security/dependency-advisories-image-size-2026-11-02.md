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
metro 0.83.8 is the `0.83-stable` tag (published 2026-08-19; `latest` is
0.87.2) and no longer lists image-size. 0.83.6 and 0.83.7 still do.

Parsed as YAML, against develop's lock: packages 1,491 → 1,493, 15 removed,
17 added, 1 snapshot changed, 0 importer lines, `overrides:` and
`settings:` unchanged.

| Change                                                                                                                                   | Reason                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| metro, metro-config, metro-core 0.83.5 → 0.83.8                                                                                          | the cli-plugin's own `^0.83.1` dependencies; metro 0.83.8 also pins the other two exactly                                                                                                    |
| metro-babel-transformer, -cache, -cache-key, -file-map, -minify-terser, -resolver, -transform-plugins, -transform-worker 0.83.5 → 0.83.8 | metro 0.83.8 and its siblings pin them exactly; the 0.83.5 copies had no other user                                                                                                          |
| + metro-runtime, metro-source-map, metro-symbolicate, ob1 0.83.8, beside their 0.83.5 copies                                             | pinned exactly by metro 0.83.8 and its siblings. The 0.83.5 copies stay because react-native 0.82.1 depends on metro-runtime and metro-source-map `^0.83.1` itself; metro does not move them |
| hermes-parser, hermes-estree 0.33.3 → 0.35.0                                                                                             | exact pins of metro and metro-babel-transformer 0.83.8; 0.33.3's only users were their 0.83.5 copies                                                                                         |
| − image-size 1.2.1, − queue 6.0.2                                                                                                        | metro 0.83.8 does not depend on image-size; queue's only user was image-size                                                                                                                 |
| ~ `@react-native/community-cli-plugin@0.82.1`                                                                                            | its metro, metro-config and metro-core now resolve to 0.83.8                                                                                                                                 |

No babel, terser or client entry is added, removed or changed. Inside the
new metro snapshots, metro's babel ranges resolve to versions already in
the lock. The integrity of all 17 new entries matches
`npm view <name>@<version> dist.integrity`.

**How it was made.** The plain update is not narrow. A lockfile-only
`pnpm update -r --depth Infinity metro 'metro-*' ob1` on develop gives 100
removed and 126 added, with @babel/core 7.29.7, terser 5.46.1 → 5.51.2 and
10 importer lines in the client and the legacy web. In pnpm 9.15.4's
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
-   **B.** `Assets.getAssetSize` on all 70 committed images (64 png, 4 svg,
    1 jpg, 1 gif).
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

Run on the tree the `fix(deps)` commit holds: Trivy and the frozen install
on a `git archive` of it, with node 22.22.0 and pnpm 9.15.4. OSV, Trivy and
the frozen install were run again on the tree with this record added.

| Gate           | Command                                                                                                                                                                                             | Result                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV            | osv-scanner 2.3.3 (sha256 matches), `--lockfile=pnpm-lock.yaml`, `TZ` = `UTC`, `Etc/GMT-3`, `Pacific/Kiritimati`, 17:00Z                                                                            | exit 0 in all three: 1,493 packages, "No issues found", 2 filtered (deepmerge, minimatch), no unused-ignore line, no image-size row                             |
| OSV, control   | develop's lock with this `osv-scanner.toml`                                                                                                                                                         | exit 1: GHSA-5p2g and GHSA-w3rx on image-size 1.2.1, fixed 2.0.3                                                                                                |
| Trivy          | 0.69.3 (checksum OK), `fs --scanners vuln --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 --ignorefile .trivyignore`, DB of 2026-11-02T13:15Z with `--skip-db-update`, on the `git archive` | exit 0, 0 in every target; `--show-suppressed`: the four Twisted entries only                                                                                   |
| Trivy, control | develop's lock with this `.trivyignore`                                                                                                                                                             | exit 1: CVE-2025-71329 and CVE-2025-71330, HIGH, fixed 2.0.3                                                                                                    |
| pnpm audit     | `pnpm audit --prod --audit-level high`; `pnpm guard:audit-clean`                                                                                                                                    | exit 0 both: "2 vulnerabilities found, 1 low \| 1 moderate (1 ignored)" (deepmerge; minimatch)                                                                  |
| frozen install | `pnpm install --frozen-lockfile` in a fresh `git archive`                                                                                                                                           | exit 0, lock byte-identical                                                                                                                                     |
| packages       | `pnpm --filter @blackout/ui` build, test, lint; `--filter @blackout/blackout-web` lint, build                                                                                                       | exit 0. ui `lint` first exited 2 with TS6305 (packages/core and packages/design not built yet) and exits 0 after the build, the order turbo's `^build` gives it |
| client         | `pnpm --filter @blackout/client build`                                                                                                                                                              | exit 0                                                                                                                                                          |
| prettier       | `prettier --check` on the changed files                                                                                                                                                             | pass                                                                                                                                                            |
| gitleaks       | 8.21.2, `gitleaks git` over `fix(deps)`; `gitleaks dir` over the two record files                                                                                                                   | no leaks                                                                                                                                                        |

The client's unit tests and typecheck were not run: nothing they load
moved. The 1,032 snapshots reachable from `apps/blackout-client` are the
same before and after.

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
    metro 0.83.8, or 0.87.2 once -v54 is in.

## Not verified

-   metro's other changed files between 0.83.5 and 0.83.8 (the server, HMR,
    file map, resolution) were not read line by line, and the dev server,
    HMR and watcher were not run. After this change react-native keeps
    metro-runtime 0.83.5 while metro uses 0.83.8, which the `^0.83.1`
    ranges allow and nothing here runs.
-   No `react-native bundle` was run (see Behaviour check).
-   CI's runners were not observed.
