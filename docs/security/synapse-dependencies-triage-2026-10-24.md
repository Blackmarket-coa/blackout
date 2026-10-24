# Synapse fork dependency triage — 2026-10-24

Scope: the Python dependencies of the Synapse fork, `apps/blackout-server`
(`pyproject.toml`, `poetry.lock`). The trigger was item 1 of "Found outside the
gates" in `dependency-advisories-2026-10-23.md`: the fork locks Pillow 10.1.0.
The operator approved the fix on 2026-10-24.

**Result:**

-   **Pillow 13.0.0 on Python ≥ 3.11, which is what the Docker image runs.**
    Python 3.8–3.10 keep the 10.1.0 lock entry, because no Pillow release
    that runs on them fixes every advisory.
-   **Two advisories are reached from untrusted media, and both were
    reproduced** through the thumbnailer under 10.1.0. Inside `Image.open`, an
    APNG makes Pillow allocate its whole claimed canvas, and a GIF's comments
    take quadratic time. Neither happens under 13.0.0. The Critical JPEG
    decoder overflow needs a call the thumbnailer never makes.
-   **A port of upstream's dependency-check fix (element-hq/synapse#19110).**
    Without it, splitting the requirement by Python version stops Synapse
    starting on 3.8–3.10, and it never checks the 13.0.0 floor on 3.11.
-   **No Pillow API change was needed in the fork's code.** This was checked
    with the media tests before and after, and with a thumbnailer probe:
    219 of 221 thumbnails are byte-identical.
-   **16 other packages in the lock have High or Critical advisories, 12 of
    them in the image.** They are open items, listed below, and not bumped
    here.
-   **No CI gate looks at any of this.** A proposal is at the end.

Commits: `f332bb7` (dependency-check port), `3168209` (Pillow lock), then this
document and the `PATCHES.md` entry. The tests below ran on `808f2ee`, which
has the same tree as `3168209`; only its commit message was corrected.

---

## Method

-   **Advisories:** the OSV API, queried on 2026-10-24 between 13:17 and
    13:56 UTC:
    -   `/v1/query` per package version, e.g. for Pillow:
        `curl -sS -X POST https://api.osv.dev/v1/query -d '{"package":{"name":"pillow","ecosystem":"PyPI"},"version":"10.1.0"}'`.
    -   `/v1/vulns/<id>` for single records.
-   **Severity:** GitHub's, from the GHSA record's `database_specific.severity`,
    when the advisory group has a GHSA. Otherwise the CVSS band of the score,
    marked "(CVSS)". osv-scanner's own totals use CVSS throughout, so they are
    quoted separately where they appear.
-   **Versions:** PyPI's JSON API.
    -   The Pillow 10.1.0 and 13.0.0 sdists were checked against PyPI's
        sha256.
    -   Pillow's release notes, `deprecations.rst` and source were read from
        those sdists.
-   **Upstream Synapse:** `raw.githubusercontent.com` (develop's
    `pyproject.toml`, `poetry.lock`, `synapse/util/check_dependencies.py` and
    `CHANGES.md`; the `poetry.lock` of tags v1.130.0 and v1.163.2). PR #19110
    came from `patch-diff.githubusercontent.com`.
-   **Lock:** poetry **1.3.2**, the version the Dockerfile installs. It ran in
    an isolated Python 3.11 venv (poetry-core 1.4.0, poetry-plugin-export
    1.3.1).
-   **Scanner:** osv-scanner **v2.3.3**, the version
    `osv-scanner-action@v2.3.3` in `ci.yml` runs. It is the GitHub release
    binary, checked against the release's `osv-scanner_SHA256SUMS`.
-   **Test environments:** built the way the Dockerfile builds the image:
    -   `poetry export` with hashes, then `pip install --no-deps -r`.
    -   Then `pip install --no-deps -e` of a `git archive` copy of the fork, so
        the Rust extension was built outside the worktree.
    -   Interpreters: Python 3.11.17, plus CPython 3.10.20 (uv's
        python-build-standalone build) for the 3.10 checks.
-   **Reachable** means the vulnerable code runs, on input an attacker
    controls, in something this repo deploys. Two Pillow advisories were
    reproduced through the fork's own `Thumbnailer`; the section says which.
    Every other reachability call comes from reading the code path.

---

## Pillow: 10.1.0 → 13.0.0 (Python ≥ 3.11)

### What OSV lists

OSV returns 67 records for 10.1.0. 51 are GitHub advisories: 5 Critical, 31
High and 15 Moderate. The other 16 are PYSEC records with the same CVEs.

| Fixed in | GHSA | Critical | High | Moderate |
| -------- | ---- | -------- | ---- | -------- |
| 10.2.0   | 1    | 1        | 0    | 0        |
| 10.3.0   | 1    | 0        | 1    | 0        |
| 12.2.0   | 2    | 0        | 0    | 2        |
| 12.3.0   | 12   | 0        | 10   | 2        |
| 13.0.0   | 35   | 4        | 20   | 11       |

-   **The five Critical advisories:**
    -   GHSA-3f63-hfp8-52jq / CVE-2023-50447: code execution through
        `ImageMath.eval`, fixed in 10.2.0.
    -   GHSA-8g5g-8vmr-9782 / CVE-2026-112403: heap overflow in
        `ImagingJpegDecode`.
    -   GHSA-5x8w-8jj5-q52h / CVE-2026-112398: the same JPEG decoder overflow,
        reached through FlashPix.
    -   GHSA-332p-7hrc-92wf / CVE-2026-112393: TIFF encoder heap overflow.
    -   GHSA-w889-685w-c8fh / CVE-2026-112900: argument injection into
        Ghostscript.
    -   The last four are fixed only in 13.0.0.
-   **13.0.0** was uploaded on 2026-10-16 and is the latest release. OSV
    returns nothing for it. Its `Requires-Python` is `>=3.11`.
-   **13.0.0's release notes list 42 GHSA IDs.** 35 of them are among OSV's
    records for 10.1.0. The other seven:
    -   GHSA-v9pv-5gc8-w2m6 (Critical) and GHSA-g4qv-2jxx-769h start at 11.0.0,
        GHSA-78g4-xqwv-q3g8 at 11.1.0, GHSA-4rr5-89j8-mwwm at 11.3.0 and
        GHSA-cp9v-662q-vvx9 at 12.0.0, per OSV's ranges. So 10.1.0 is not
        affected. The first three do affect the Pillow in upstream's v1.130.0
        image; see the Trivy section.
    -   GHSA-wqgw-9xfh-qf2g ("TIFF and Exif IFD parsing memory and CPU
        amplification") and GHSA-xcvg-w56q-r89m (TIFF encoder overflow): OSV
        has no record yet. So whether 10.1.0 is affected is not known. The
        thumbnailer's `_getexif()` parses Exif IFDs, so if wqgw does affect
        10.1.0, it is on the thumbnailer's path. 13.0.0 contains the fix.

### Reachability in this fork

-   **Where Pillow runs:**
    -   Synapse thumbnails uploads (`create_content` / `update_content` →
        `_generate_thumbnails`, `media_repository.py` lines 307 and 351).
    -   It thumbnails remote media it fetches for a client (line 640).
    -   It thumbnails on demand when `dynamic_thumbnails` is on, as the
        single-server baseline sets it.
-   **Who can trigger a decode:** anyone who can reach the media endpoint.
    -   `ThumbnailResource.on_GET` makes no authentication call. MSC3916
        (authenticated media) was not ported; it is follow-up 1 of
        `upstream-advisory-triage-2026-10-09.md`.
    -   In the baseline, nginx sends `/_matrix/media` on `matrix.theblackout.app`
        to Synapse (`theblackout.app.conf`, read, not tested).
    -   So a request for a thumbnail of `mxc://<a server the attacker runs>/<id>`
        makes the server download that media and decode it.
    -   The remote-download rate limit (GHSA-4mhg-xv73-xq2x port) and
        `max_upload_size` bound the volume. They do not stop a single crafted
        file.
-   **URL previews**, which go through the same thumbnailer, are off in the
    baseline: `url_preview_enabled` is unset, and its default is off.
-   **Only four decoders can run.** `Thumbnailer` opens files with
    `formats=("jpeg", "png", "webp", "gif")`, from the GHSA-vp6v-whfm-rv3g
    port. Checked on both Pillow versions:
    -   `tests/media/test_thumbnailer_formats.py` passes.
    -   The probe below refuses nine other formats written without an extension
        (BMP, TIFF, PPM, ICO, TGA, PCX, SGI, XBM, IM).
-   **Reached, and reproduced through the fork's `Thumbnailer`** under both
    Pillow versions, each case in a fresh process:
    -   **GHSA-5xm2-6676-qcp9 (High).** For any APNG, `Image.open` allocates the
        whole claimed canvas before the decompression-bomb check. In 10.1.0 that
        is `PngImagePlugin._seek(0)` → `Image.core.fill` (line 904). A 128-byte
        file claiming 8000×8000 raised peak RSS by 245 MiB under 10.1.0,
        whether or not the claim was over the pixel limit. Under 13.0.0 the rise
        was 1 MiB. The advisory puts a 22000×22000 claim at about 1.9 GB.
    -   **GHSA-74r2-7ff9-mjj2 (Moderate).** GIF comment extensions are joined by
        repeated `bytes` concatenation inside `Image.open`. A 2 MB file of
        400,000 one-byte comments took 17.0 s to open under 10.1.0 and 0.24 s
        under 13.0.0. Time grows with the square of the size, and the baseline
        allows 100 MB uploads.
-   **On the path, but the precondition is not met (from the code):**
    -   **GHSA-8g5g-8vmr-9782 (Critical, JPEG decoder overflow).** It needs
        `JpegImageFile.draft()` to request a scaled decode. In 10.1.0 only
        `Image.thumbnail()` calls `draft()`, and the fork calls neither; it uses
        `resize()` and `crop()`.
    -   **GHSA-g7cr-3p24-7wf7 (High, JPEG encoder).** It needs an ICC profile in
        the save call. 10.1.0's JPEG `_save` reads `icc_profile` only from
        `im.encoderinfo`, and the thumbnailer passes only `quality=80`.
    -   **GHSA-6r8x-57c9-28j4 (High, `crop`/`paste` coordinates).** It needs
        coordinates near 2³¹. The thumbnailer's crop box lies inside an image
        that `resize()` has just allocated.
    -   **GHSA-wqgw-9xfh-qf2g (Exif IFD parsing, no OSV record).** `_getexif()`
        parses Exif IFDs on JPEG, PNG and WebP, so this would be on the path if
        it affects 10.1.0. That is not known.
-   **Not reached through thumbnailing:**
    -   The TIFF, FlashPix, EPS/Ghostscript, PDF, MSP, BMP, SPIDER, MPO and DCX
        code (not allowlisted).
    -   Fonts, `ImageMath`, `ImageCms`, `ImageMorph`, rank filters, `TarIO`,
        `merge`, `transform` and `quantize` (never called).
    -   The TIFF, TGA, PDF and GIF encoders. The thumbnailer only encodes JPEG
        (`quality=80`) and PNG.
    -   The `seek()`-based multi-frame advisories. The thumbnailer never seeks,
        so it only reads the first frame.
-   The remaining advisories were not assessed one by one.

### The change

-   **`pyproject.toml`:**

    ```toml
    Pillow = [
        { version = ">=13.0.0", python = ">=3.11" },
        { version = ">=10.0.1", python = "<3.11" },
    ]
    ```

    -   The image: `docker/Dockerfile` builds on `python:3.11-slim-bookworm`,
        so it installs 13.0.0. PyPI has cp311 manylinux_2_28 wheels for it on
        x86_64 and aarch64.

-   **The cost: Python 3.8, 3.9 and 3.10 stay on 10.1.0, with all 51
    advisories.** That includes both of the reached ones above.

    -   All three interpreters are end of life: 2024-10-07, 2025-10-31 and
        2026-10-01, per python.org's release-cycle data.
    -   No partial bump was taken for them, because none helps. The newest
        Pillow each one can run has about as many advisories, and each still
        carries GHSA-5xm2 and GHSA-74r2:

        | Interpreter | Newest Pillow | GHSA in OSV |
        | ----------- | ------------- | ----------- |
        | 3.8         | 10.4.0        | 52          |
        | 3.9         | 11.3.0        | 58          |
        | 3.10        | 12.3.0        | 41          |

    -   Running the fork's media repository on 3.8–3.10 should be treated as
        unsupported.

-   **Why not raise the fork's floor to 3.11 instead:**
    -   It is a lock-wide change: every package with a `python_version < "3.11"`
        marker moves.
    -   It also touches `synapse/__init__.py`'s version check, the tooling
        targets (black, mypy, tox) and the install docs.
    -   That is outside a targeted security fix. It is the recommended next
        change, though: most of the open items below need Python ≥ 3.9 or
        ≥ 3.10 too.
-   **Upstream made the same split on 2026-10-23.** Synapse 1.163.2's notes
    say: "Bump `pillow` to `13.0.0` … You must use Python >= 3.11 to take
    advantage of this version bump" (#20398).
    -   Its lock carries 12.3.0 for `python_version < "3.11"` and 13.0.0 for
        `>= "3.11"`.
    -   Its Dockerfile builds on Python 3.13.

### The dependency check had to change too (port of upstream #19110)

`synapse/app/__init__.py` runs `check_requirements()` at import and exits with
status 1 if it fails. Two defects in it break a per-Python requirement:

-   **It version-checks a requirement that does not apply.** For each installed
    package, it checked the version even when the requirement's marker excludes
    this interpreter. Shown on CPython 3.10.20 with the regenerated lock, which
    installs Pillow 10.1.0 there, `6ea67c4`'s checker logs this and raises, so
    the homeserver would not start:

    ```
    Synapse 1.98.0+blackout.1 needs Pillow>=13.0.0; python_version >= "3.11", but got Pillow==10.1.0
    ```

-   **It treats a plain `python_version` marker as a dev dependency.**
    `_is_dev_dependency()` evaluated the marker once for each dev extra. A
    marker that is true on this interpreter, like `python_version >= "3.11"`
    on 3.11, therefore counted as dev-only and was skipped. So on 3.11 the
    13.0.0 floor was never checked.
-   **The fix is upstream's #19110** (released in Synapse 1.142.0rc1,
    2025-11-04), in the final state of its seven commits.
    -   `dict[...]` and `set[...]` are written as `typing.Dict` and `typing.Set`,
        because this tree still supports Python 3.8.
    -   The marker-handling code is otherwise the same as upstream develop's.
        The rest of the file keeps its fork-specific source-tree fallback and
        leaves out unrelated upstream changes (the module logger and
        `canonicalize_name`).
-   **After the port:** `import synapse.app` succeeds on 3.10.20 (Pillow 10.1.0)
    and on 3.11.17 (Pillow 13.0.0).
-   **Tests** (`tests/util/test_check_dependencies.py`):
    -   Upstream's `test_python_version_markers_respected`, ported.
    -   A new `test_pillow_python_version_split`, using the two requirement
        strings poetry-core writes into the wheel metadata.
    -   Mutation check, on a scratch copy:
        -   Removing the new skip in `check_requirements()` makes both tests
            error.
        -   Restoring the old `_is_dev_dependency()` makes both fail.

### The lock

`poetry lock --no-update` under poetry 1.3.2 added 103 lines to the lock and
removed 2:

-   **A new `pillow` 13.0.0 entry** (`python-versions = ">=3.11"`, 83 files).
    All 83 sha256 values equal PyPI's, and the sdist is included. The 10.1.0
    entry is unchanged.
-   **A new `content-hash`.**
-   **astroid 2.15.0's two `wrapt` constraints swapped order.** astroid is a
    dev-only package, and the two constraints are the same as before. poetry
    1.3.2 wrote this order on both runs; the old lock had the reverse.

Checks:

-   `poetry lock --check`: "poetry.lock is consistent with pyproject.toml".
-   A second `--no-update` run is byte-identical.
-   `.ci/scripts/check_lockfile.py` passes.
-   `scripts-dev/check_locked_deps_have_sdists.py` passes. It keys packages by
    name, so it inspects only one of the two `pillow` entries; both carry an
    sdist, checked directly.
-   The Dockerfile's `poetry export --extras all` output changes only in its
    Pillow lines: `pillow==10.1.0` gains `python_version < "3.11"`, and
    `pillow==13.0.0` is added for `python_version >= "3.11"`.
-   The 3.11 test environments built from the two locks differ only in Pillow
    (126 packages each).

### Pillow API compatibility

-   **Everything the fork calls** (`grep -rn PIL synapse/`, plus tests):
    -   `synapse/__init__.py`: `ImageFile.LOAD_TRUNCATED_IMAGES`.
    -   `synapse/rest/media/v1/__init__.py`: `features.check_codec("jpg")` and
        `("zlib")`.
    -   `synapse/media/thumbnailer.py`:
        -   The module-level transpose constants and `Image.LANCZOS`.
        -   `Image.open(formats=...)`, `Image.MAX_IMAGE_PIXELS` and
            `DecompressionBombError`.
        -   The private `_getexif()`.
        -   `transpose`, `convert`, `resize`, `crop` and
            `save(fmt, quality=80)`, and use as a context manager.
-   **Removals from 10.2.0 to 13.0.0** come from 13.0.0's `deprecations.rst`
    and release notes. None of them is in that list:
    -   `ImageFile.raise_oserror`.
    -   `ImageMath.eval`.
    -   The `ImageCms` constants.
    -   The WebP feature checks such as `transp_webp`.
    -   `PSFile`, `PyAccess`, `get_child_images` and `Image._show`.
    -   The dtype-changing `fromarray(mode=)`.
    -   Saving mode `I` as PNG.
    -   `ExifTags.IFD.Makernote`.
-   **Still present in 13.0.0:**
    -   The constants: the enum-export loop at `Image.py` line 190.
    -   `_getexif()` on the JPEG, PNG and WebP plugins. GIF has none in either
        version. Upstream moved to `getexif()` in #19098; that is not needed
        here.
    -   `LOAD_TRUNCATED_IMAGES`, and `check_codec` with `jpg` and `zlib`.
-   **Two changes do touch the thumbnailer:**
    -   **16-bit grayscale PNGs open as `I;16` instead of `I`.** So the removed
        "save `I` as PNG" path is not reached. PNG still accepts `I;16`.
    -   **Lazy plugin loading (12.2.0).** For a media-store file, which has no
        extension, `open` falls back to `preinit()`, then calls `init()` for any
        allowlisted format not yet registered. Only the allowlisted factories
        are tried, so the allowlist still holds.
    -   Both were exercised by the probe.
-   **No code change was needed.**

### Tests

The same command ran from each `git archive` copy:

```
python -m twisted.trial -j4 tests.media tests.rest.media \
    tests.replication.test_multi_media_repo tests.push.test_email \
    tests.util.test_check_dependencies tests.app
```

`tests.media` and `tests.rest.media` are all of the media tests. The two
modules that import the thumbnailer or Pillow (`test_media_storage`,
`test_thumbnailer_formats`) are in `tests.media`. The other modules were
added because they exercise thumbnails or the dependency check.

| Run                                    | Ran | OK  | Failed | Skipped |
| -------------------------------------- | --- | --- | ------ | ------- |
| `6ea67c4`, Python 3.11.17, Pillow 10.1 | 260 | 245 | 12     | 3       |
| `3168209`, Python 3.11.17, Pillow 13.0 | 262 | 247 | 12     | 3       |
| `3168209`, Python 3.10.20, Pillow 10.1 | 262 | 247 | 12     | 3       |

-   **Same outcomes:** compared test by test (`--reporter=bwverbose`), every
    one of the 260 tests that exist in both trees has the same outcome in all
    three runs.
-   **The two extra tests** in the later runs are the new dependency-check
    tests.
-   **Passing in all three:** `tests.media` (186 tests), `tests.rest.media`
    (38), `tests.app` (12) and `tests.util.test_check_dependencies` (7, then
    9).
-   **The 12 failures were there before this change.** They are all
    `tests.push.test_email.EmailPusherTests` (`0 != 1` emails sent), and they
    fail the same way on the unchanged tree. Their cause was not
    investigated; no image is decoded on that path.
-   **The 3 skips** are `tests.replication.test_multi_media_repo`, which
    "Requires Postgres".
-   **Coverage gap:** the media tests compare thumbnail bytes only for one
    small PNG. Nothing in the suite scales, crops or encodes a JPEG, applies an
    EXIF orientation, or opens a 16-bit or truncated image. The probe covers
    those.

**The thumbnailer probe** drove the real `synapse.media.thumbnailer.Thumbnailer`
under both venvs:

-   **Inputs:** 40 extensionless files, written once by Pillow 10.1.0 so both
    versions read the same bytes:
    -   JPEG: RGB, L, CMYK, progressive, EXIF orientations 3, 6 and 8, 1×7, and
        truncated.
    -   PNG: RGB, RGBA, L, LA, P, P with `tRNS`, 1-bit, 16-bit gray, 16-bit RGB,
        eXIf orientation 8, and truncated.
    -   GIF: palette, transparent and animated.
    -   WebP: lossy, lossless RGBA, EXIF orientation 6, and animated.
    -   JPEG bytes named `.png`, nine refused formats, garbage, and two
        decompression-bomb sizes.
-   **Operations:**
    -   The upload path: one `Thumbnailer` per file, through the five default
        `thumbnail_sizes` and the mapped output type.
    -   The dynamic path: a fresh `Thumbnailer` per request, PNG output.
    -   `_generate_thumbnail` was copied verbatim from `media_repository.py`.
-   **Status and warnings: identical across versions.** It recorded 305 cases,
    29 of them successful opens. Of the rest:
    -   221 produced a thumbnail.
    -   44 raised `ThumbnailError`: the refusals, garbage and the bomb over 2×.
    -   8 were skipped as too large.
    -   3 failed with `OSError: cannot write mode CMYK as PNG`. These are a CMYK
        JPEG on the dynamic path, and the failure predates this change.
    -   Warnings were the same: `DecompressionBombWarning` between 1× and 2×.
-   **219 of 221 thumbnails are byte-identical.** The two that differ are crops
    that upscale the 64×48 16-bit grayscale PNG. In 16-bit units, 84 of 2,500
    pixels differ by at most 1,071 of 65,535, and 506 of 9,216 by at most 563.
    That matches LANCZOS overshoot being clamped differently now that the
    source is `I;16` rather than 32-bit `I`. Every scale case of that image is
    identical.
-   **EXIF orientation** was read and applied on JPEG, PNG and WebP in both
    versions (orientations 3, 6 and 8), with identical output.

**Lint**, with the locked tools, on the two changed Python files:

-   black 23.10.1, isort 5.13.1 and ruff 0.1.7 pass.
-   mypy 1.5.1 with the fork's `mypy.ini` reports no error in either file. It
    reports 25 errors in 14 other files, through followed imports. Those are
    identical at `6ea67c4`.

---

## Trivy `skip-dirs` hides the whole fork

`security.yml`'s Trivy filesystem scan sets `skip-dirs: apps/blackout-server`.
That removes three lockfiles from every Trivy run:

-   `poetry.lock`: this document.
-   `Cargo.lock`: the crates of the `synapse_rust` extension. osv-scanner finds
    4 advisories in 2 crates. One is High: pyo3 0.20.0, GHSA-36hh-v3qg-5jq4,
    fixed in 0.29.0. Not triaged here.
-   `services/blackout-api/requirements.txt`: the legacy FastAPI service.
    osv-scanner, with transitive resolution, finds 41 advisories (2 Critical,
    17 High). `deploy.sh` builds this service as `blackout-api:stable`, but the
    baseline compose runs `blackout-api:hono`, so it is built and not run. Not
    triaged here.

The fork's `package.json` declares no dependencies (`apps/blackout-server: {}`
in `pnpm-lock.yaml`), so the skip hides nothing on the Node side.

The comment beside the skip makes two claims. Neither holds for every
deployment:

-   **"production runs the upstream matrixdotorg/synapse image".**
    -   True of `deploy/docker/blackout-backend/docker-compose.yml`, which runs
        `ghcr.io/element-hq/synapse:v1.130.0`.
    -   Not true of `infra/single-server-baseline/`. Its `deploy.sh` runs
        `git reset --hard origin/develop` and builds `blackout-synapse:stable`
        from `apps/blackout-server/docker/Dockerfile`, which installs this lock.
        Its compose and `homeserver.yaml.template` hard-code `theblackout.app`.
    -   `deploy/docker/production/` has no homeserver.
-   **"its dependency CVE churn is tracked via upstream-advisories.yml".** No.
    That workflow runs `tools/ci/fetch-upstream-advisories.mjs`, which lists
    `element-hq/synapse`'s own repository advisories
    (`repos/element-hq/synapse/security-advisories`), not advisories against
    Synapse's dependencies. No workflow here scans the fork's dependencies.
    -   Two things outside the workflows were not checked: whether GitHub's
        Dependabot alerts (a repository setting) are on, and whether the
        Renovate app acts on `.github/renovate.json`.
    -   That file extends an Element Web preset (`config:base` with
        dependency-dashboard approval). Renovate would propose updates rather
        than gate on advisories.

Nothing else in CI covers the fork either:

-   `docker.yml` and `release.yml` build `apps/blackout-server/Dockerfile`.
    Despite its location, that is the Node `@blackout/api` image. No workflow
    builds or scans the Synapse image.
-   The fork's own `.github/workflows/` do not run, because GitHub only runs
    the repository root's.

**Which deployment serves Matrix for theblackout.app is not known.** The
baseline is configured for it. The backend stack takes its server name from
`${MATRIX_SERVER_NAME}`, and nothing in the repo records which one is live.
What follows for each:

-   **Baseline:** its image moves to Pillow 13.0.0 at the first `deploy.sh` run
    after this change reaches `develop`, because `deploy.sh` builds whatever
    `origin/develop` holds.
-   **Backend stack:** this change does nothing for it. Upstream v1.130.0's
    lock pins Pillow 11.2.1, which has 58 GHSA in OSV (5 Critical, 36 High).
    -   That count includes GHSA-5xm2 and GHSA-74r2, and three advisories that
        start after 10.1.0: GHSA-v9pv (Critical), GHSA-g4qv and GHSA-78g4.
        Upstream 1.130.0's thumbnailer was not read, so what it reaches was not
        assessed.
    -   The fix there is to move the image tag to a release that ships Pillow
        13.0.0 for its Python, e.g. upstream v1.163.2 (2026-10-23). That is a
        large upstream jump and was not assessed here.
    -   The 11.2.1 is inferred from the tag's lock; the published image's
        contents were not checked.

---

## osv-scanner over `apps/blackout-server/poetry.lock`

**Command:**
`osv-scanner scan source --lockfile=apps/blackout-server/poetry.lock`
(v2.3.3, 2026-10-24 13:49 UTC).

-   **Result:** "Total 25 packages affected by 195 known vulnerabilities (12
    Critical, 114 High, 61 Medium, 5 Low, 3 Unknown)".
-   **This is identical before and after the change**, for two reasons:
    -   osv-scanner does not evaluate markers, so the lock's 10.1.0 entry (for
        Python < 3.11) still counts.
    -   13.0.0 adds nothing.
-   **It also counts dev-only packages**, which are not in the image.
-   **What the image actually installs:** the Dockerfile's
    `poetry export --extras all` output, with markers evaluated for Python 3.11
    (75 packages), scanned with `--no-resolve`:
    -   Before: 19 packages, 139 vulnerabilities (8 Critical, 77 High).
    -   After: 18 packages, 88 vulnerabilities (3 Critical, 46 High).
    -   The difference is Pillow's 51 advisories exactly.

### Open items: other packages with High or Critical advisories (not bumped here)

-   **"In the image"** means the package is in that 3.11 export, so the
    image's `pip install` installs it.
-   **"Clears all of them"** is the lowest version that fixes every one of
    that package's High and Critical advisories.
-   **Reachability** was not assessed for any of them.

| Package      | Locked    | In the image | Critical | High | Clears all of them       | Its Requires-Python     |
| ------------ | --------- | ------------ | -------- | ---- | ------------------------ | ----------------------- |
| authlib      | 1.2.1     | yes          | 1        | 5    | 1.6.9                    | `>=3.9`                 |
| certifi      | 2023.7.22 | yes          | 1        | 0    | 2026.10.19               | `>=3.7`                 |
| cryptography | 41.0.7    | yes          | 0        | 5    | 49.0.0                   | `!=3.9.0,!=3.9.1,>=3.9` |
| lxml         | 4.9.3     | yes          | 0        | 1    | 6.1.0                    | `>=3.8`                 |
| msgpack      | 1.0.7     | yes          | 0        | 1    | 1.2.1                    | `>=3.10`                |
| pyasn1       | 0.5.1     | yes          | 0        | 4    | 0.6.4                    | `>=3.8`                 |
| pyopenssl    | 25.1.0    | yes          | 0        | 1    | 26.0.0                   | `>=3.8`                 |
| setuptools   | 67.6.0    | yes          | 0        | 2    | 78.1.1                   | `>=3.9`                 |
| thrift       | 0.16.0    | yes          | 0        | 2    | 0.24.0                   | none declared           |
| tornado      | 6.2       | yes          | 0        | 10   | 6.5.9                    | `>=3.9`                 |
| twisted      | 23.10.0   | yes          | 0        | 4    | 26.10.0rc1 (pre-release) | `>=3.10`                |
| urllib3      | 2.0.7     | yes          | 0        | 6    | 2.8.0                    | `>=3.10`                |
| black        | 23.10.1   | no (dev)     | 1        | 2    | 26.10.1                  | `>=3.10`                |
| gitpython    | 3.1.40    | no (dev)     | 1        | 25   | 3.2.1                    | `>=3.8`                 |
| pyjwt        | 2.6.0     | no (dev)     | 1        | 6    | 2.14.0; one has no fix   | `>=3.9`                 |
| soupsieve    | 2.4       | no (dev)     | 0        | 2    | 2.8.4                    | `>=3.9`                 |

Totals and notes:

-   **81 advisories:** 5 Critical and 76 High.
    -   The 12 image packages: 2 Critical and 41 High.
    -   The 4 dev-only packages: 3 Critical and 35 High.
-   **Twisted:** three of its four High advisories are fixed only in
    26.10.0rc1, a release candidate (2026-10-22). The latest final release is
    26.4.0, which fixes the fourth (GHSA-grgv-6hw6-v9g4, `twisted.names`).
-   **pyjwt:** PYSEC-2025-183 lists no fixed version.
-   **Most of these fixes cannot be locked under `python = "^3.8.0"`.** Seven of
    the twelve image packages need Python ≥ 3.9 or ≥ 3.10 for the version that
    clears them. They could be locked only through more per-interpreter splits
    like Pillow's, or by raising the floor. That is the case for raising the
    fork to Python 3.11 as the next change.

Every High or Critical advisory, by package:

| Package             | Advisory                             | CVE             | Severity        | Fixed in                      |
| ------------------- | ------------------------------------ | --------------- | --------------- | ----------------------------- |
| authlib 1.2.1       | GHSA-wvwj-cvrp-7pv5, PYSEC-2026-287  | CVE-2026-27962  | Critical        | 1.6.9                         |
| authlib 1.2.1       | GHSA-5357-c2jx-v7qh, PYSEC-2024-52   | CVE-2024-37568  | High            | 1.3.1                         |
| authlib 1.2.1       | GHSA-7432-952r-cw78, PYSEC-2026-2116 | CVE-2026-28490  | High            | 1.6.9                         |
| authlib 1.2.1       | GHSA-9ggr-2464-2j32, PYSEC-2026-1200 | CVE-2025-59420  | High            | 1.6.4                         |
| authlib 1.2.1       | GHSA-m344-f55w-2m6j, PYSEC-2026-2117 | CVE-2026-28498  | High            | 1.6.9                         |
| authlib 1.2.1       | GHSA-pq5p-34cr-23v9, PYSEC-2026-1203 | CVE-2025-61920  | High            | 1.6.5                         |
| black 23.10.1       | PYSEC-2026-2120                      | CVE-2026-31900  | Critical (CVSS) | 26.3.0                        |
| black 23.10.1       | GHSA-cg8m-r9f2-5wm2                  | CVE-2026-114134 | High            | 26.10.1                       |
| black 23.10.1       | PYSEC-2026-2121                      | CVE-2026-32274  | High (CVSS)     | 26.3.1                        |
| certifi 2023.7.22   | GHSA-6q48-6c7w-9gw2, PYSEC-2026-4320 | none            | Critical        | 2026.10.19                    |
| cryptography 41.0.7 | GHSA-3ww4-gg4f-jr7f, PYSEC-2026-1283 | CVE-2023-50782  | High            | 42.0.0                        |
| cryptography 41.0.7 | GHSA-537c-gmf6-5ccf                  | none            | High            | 48.0.1                        |
| cryptography 41.0.7 | GHSA-6vqw-3v5j-54x4, PYSEC-2024-225  | CVE-2024-26130  | High            | 42.0.4                        |
| cryptography 41.0.7 | GHSA-r6ph-v2qm-q3c2, PYSEC-2026-2141 | CVE-2026-26007  | High            | 46.0.5                        |
| cryptography 41.0.7 | PYSEC-2026-3553                      | CVE-2026-69249  | High (CVSS)     | 49.0.0                        |
| gitpython 3.1.40    | GHSA-284h-m62q-gf8w, PYSEC-2026-3786 | CVE-2026-78676  | Critical        | 3.1.59                        |
| gitpython 3.1.40    | GHSA-239g-whfq-7xj9, PYSEC-2026-3982 | CVE-2026-87817  | High            | 3.1.60                        |
| gitpython 3.1.40    | GHSA-2f96-g7mh-g2hx, PYSEC-2026-3836 | CVE-2026-67325  | High            | 3.1.51                        |
| gitpython 3.1.40    | GHSA-2mqj-m65w-jghx, PYSEC-2024-4    | CVE-2024-22190  | High            | 3.1.41                        |
| gitpython 3.1.40    | GHSA-3f7w-8rr8-f37f, PYSEC-2026-3949 | CVE-2026-73620  | High            | 3.1.57                        |
| gitpython 3.1.40    | GHSA-3rp5-jjmw-4wv2, PYSEC-2026-3981 | CVE-2026-69097  | High            | 3.1.53                        |
| gitpython 3.1.40    | GHSA-4gmw-gg2m-w46p, PYSEC-2026-3838 | CVE-2026-76219  | High            | 3.1.58                        |
| gitpython 3.1.40    | GHSA-6p8h-3wgx-97gf, PYSEC-2026-3952 | CVE-2026-73623  | High            | 3.1.54                        |
| gitpython 3.1.40    | GHSA-7545-fcxq-7j24, PYSEC-2026-2162 | CVE-2026-44243  | High            | 3.1.48                        |
| gitpython 3.1.40    | GHSA-7833-fr7j-v32q, PYSEC-2026-3785 | CVE-2026-78675  | High            | 3.1.59                        |
| gitpython 3.1.40    | GHSA-83vg-56qc-22m7                  | CVE-2026-114145 | High            | 3.2.1                         |
| gitpython 3.1.40    | GHSA-8mcc-hrx5-hvxc, PYSEC-2026-3787 | CVE-2026-78677  | High            | 3.1.59                        |
| gitpython 3.1.40    | GHSA-94p4-4cq8-9g67, PYSEC-2026-3951 | CVE-2026-73622  | High            | 3.1.55                        |
| gitpython 3.1.40    | GHSA-956x-8gvw-wg5v, PYSEC-2026-3839 | CVE-2026-67323  | High            | 3.1.51                        |
| gitpython 3.1.40    | GHSA-9rj7-rf2p-w77r, PYSEC-2026-3840 | CVE-2026-76218  | High            | 3.1.58                        |
| gitpython 3.1.40    | GHSA-fjr4-x663-mwxc, PYSEC-2026-3995 | CVE-2026-73624  | High            | 3.1.54                        |
| gitpython 3.1.40    | GHSA-g5vv-9gxw-82hx, PYSEC-2026-3984 | CVE-2026-87819  | High            | 3.1.60                        |
| gitpython 3.1.40    | GHSA-hmq2-w58f-27jc, PYSEC-2026-3784 | CVE-2026-76222  | High            | 3.1.58                        |
| gitpython 3.1.40    | GHSA-jm78-9fvv-mhgr, PYSEC-2026-3783 | CVE-2026-76221  | High            | 3.1.58                        |
| gitpython 3.1.40    | GHSA-mv93-w799-cj2w, PYSEC-2026-3980 | CVE-2026-67326  | High            | 3.1.50                        |
| gitpython 3.1.40    | GHSA-r9mr-m37c-5fr3, PYSEC-2026-3953 | CVE-2026-73625  | High            | 3.1.54                        |
| gitpython 3.1.40    | GHSA-rpm5-65cw-6hj4, PYSEC-2026-2160 | CVE-2026-42215  | High            | 3.1.47                        |
| gitpython 3.1.40    | GHSA-rwj8-pgh3-r573, PYSEC-2026-3842 | CVE-2026-67322  | High            | 3.1.52                        |
| gitpython 3.1.40    | GHSA-v87r-6q3f-2j67, PYSEC-2026-2163 | CVE-2026-44244  | High            | 3.1.49                        |
| gitpython 3.1.40    | GHSA-wvpp-8hx9-p66j, PYSEC-2026-3843 | CVE-2026-76220  | High            | 3.1.58                        |
| gitpython 3.1.40    | GHSA-x2qx-6953-8485, PYSEC-2026-2161 | CVE-2026-42284  | High            | 3.1.47                        |
| lxml 4.9.3          | GHSA-vfmq-68hx-4jfw, PYSEC-2026-87   | CVE-2026-41066  | High            | 6.1.0                         |
| msgpack 1.0.7       | GHSA-6v7p-g79w-8964, PYSEC-2026-3625 | CVE-2026-57585  | High            | 1.2.1                         |
| pyasn1 0.5.1        | GHSA-8ppf-4f7h-5ppj, PYSEC-2026-3456 | CVE-2026-59885  | High            | 0.6.4                         |
| pyasn1 0.5.1        | GHSA-hm4w-wwcw-mr6r, PYSEC-2026-3457 | CVE-2026-59886  | High            | 0.6.4                         |
| pyasn1 0.5.1        | GHSA-jr27-m4p2-rc6r, PYSEC-2026-2263 | CVE-2026-30922  | High            | 0.6.3                         |
| pyasn1 0.5.1        | GHSA-m4p7-r5rc-7g4j, PYSEC-2026-3455 | CVE-2026-59884  | High            | 0.6.4                         |
| pyjwt 2.6.0         | GHSA-ffc3-869f-jxw9, PYSEC-2026-4145 | CVE-2026-102268 | Critical        | 2.14.0                        |
| pyjwt 2.6.0         | GHSA-752w-5fwx-jx9f, PYSEC-2026-120  | CVE-2026-32597  | High            | 2.12.0                        |
| pyjwt 2.6.0         | GHSA-9v7f-9g4p-ffgj, PYSEC-2026-4144 | CVE-2026-102267 | High            | 2.14.0                        |
| pyjwt 2.6.0         | GHSA-p4g4-x82p-q773, PYSEC-2026-4149 | CVE-2026-102271 | High            | 2.14.0                        |
| pyjwt 2.6.0         | GHSA-pxh4-856f-4h89                  | none            | High            | 2.14.0                        |
| pyjwt 2.6.0         | GHSA-xgmm-8j9v-c9wx, PYSEC-2026-179  | CVE-2026-48526  | High            | 2.13.0                        |
| pyjwt 2.6.0         | PYSEC-2025-183                       | CVE-2025-45768  | High (CVSS)     | no fix listed                 |
| pyopenssl 25.1.0    | GHSA-5pwr-322w-8jr4, PYSEC-2026-2269 | CVE-2026-27459  | High            | 26.0.0                        |
| setuptools 67.6.0   | GHSA-5rjg-fvgr-3xxf, PYSEC-2025-49   | CVE-2025-47273  | High            | 78.1.1                        |
| setuptools 67.6.0   | GHSA-cx63-2mw6-8hw5, PYSEC-2026-1918 | CVE-2024-6345   | High            | 70.0.0                        |
| soupsieve 2.4       | GHSA-2wc2-fm75-p42x, PYSEC-2026-3071 | CVE-2026-49476  | High            | 2.8.4                         |
| soupsieve 2.4       | GHSA-836r-79rf-4m37, PYSEC-2026-3072 | CVE-2026-49477  | High            | 2.8.4                         |
| thrift 0.16.0       | GHSA-6pjx-3pjc-mrj8, PYSEC-2026-3925 | CVE-2026-41608  | High            | 0.24.0                        |
| thrift 0.16.0       | GHSA-8wv5-x4w7-5gww, PYSEC-2026-3926 | CVE-2026-43871  | High            | 0.24.0                        |
| tornado 6.2         | GHSA-3x9g-8vmp-wqvf, PYSEC-2026-3387 | CVE-2026-49853  | High            | 6.5.6                         |
| tornado 6.2         | GHSA-7cx3-6m66-7c5m, PYSEC-2026-1974 | CVE-2025-47287  | High            | 6.5                           |
| tornado 6.2         | GHSA-8w49-h785-mj3c, PYSEC-2026-1975 | CVE-2024-52804  | High            | 6.4.2                         |
| tornado 6.2         | GHSA-c2m8-h5v5-343r                  | CVE-2026-103263 | High            | 6.5.9                         |
| tornado 6.2         | GHSA-c98p-7wgm-6p64, PYSEC-2025-266  | CVE-2025-67725  | High            | 6.5.3                         |
| tornado 6.2         | GHSA-chx6-46f5-w4vp                  | CVE-2026-103262 | High            | 6.5.9                         |
| tornado 6.2         | GHSA-jhmp-mqwm-3gq8, PYSEC-2025-267  | CVE-2025-67726  | High            | 6.5.3                         |
| tornado 6.2         | GHSA-mgf9-4vpg-hj56, PYSEC-2026-3389 | CVE-2026-49855  | High            | 6.5.6                         |
| tornado 6.2         | GHSA-mpf4-983q-p7j4, PYSEC-2026-3928 | CVE-2026-82397  | High            | 6.5.8                         |
| tornado 6.2         | GHSA-qjxf-f2mg-c6mc, PYSEC-2026-140  | CVE-2026-31958  | High            | 6.5.5                         |
| twisted 23.10.0     | GHSA-3476-c5c2-fr73                  | CVE-2026-115775 | High            | 26.10.0rc1 (pre-release only) |
| twisted 23.10.0     | GHSA-53xc-49m8-p798                  | CVE-2026-115776 | High            | 26.10.0rc1 (pre-release only) |
| twisted 23.10.0     | GHSA-cwm5-jh59-mwxr                  | CVE-2026-115778 | High            | 26.10.0rc1 (pre-release only) |
| twisted 23.10.0     | GHSA-grgv-6hw6-v9g4, PYSEC-2026-160  | CVE-2026-42304  | High            | 26.4.0                        |
| urllib3 2.0.7       | GHSA-2xpw-w6gg-jr37, PYSEC-2026-1994 | CVE-2025-66471  | High            | 2.6.0                         |
| urllib3 2.0.7       | GHSA-38jv-5279-wg99, PYSEC-2026-1996 | CVE-2026-21441  | High            | 2.6.3                         |
| urllib3 2.0.7       | GHSA-8988-9cw3-xx77, PYSEC-2026-4175 | CVE-2026-97687  | High            | 2.8.0                         |
| urllib3 2.0.7       | GHSA-gm62-xv2j-4w53, PYSEC-2026-1998 | CVE-2025-66418  | High            | 2.6.0                         |
| urllib3 2.0.7       | GHSA-qccp-gfcp-xxvc, PYSEC-2026-141  | CVE-2026-44431  | High            | 2.7.0                         |
| urllib3 2.0.7       | GHSA-vxq7-64xx-v4gw, PYSEC-2026-4177 | CVE-2026-97689  | High            | 2.8.0                         |

---

## Proposal: scan the fork's Python dependencies in CI (not implemented)

A raw scan of `poetry.lock` is the wrong thing to gate on, for three reasons:

-   It reports the Pillow 10.1.0 entry that only Python < 3.11 installs.
    Silencing it would mean a 51-entry ignore list.
-   It reports dev-only packages that never ship.
-   Removing `skip-dirs` alone would put the same lockfile in front of Trivy.
    Whether Trivy's Poetry analyzer evaluates markers was not checked.

Gate on what the image installs instead. Two layers:

1. **On pull requests.** A job in `security.yml`. It would run on changes to
   `apps/blackout-server/{pyproject.toml,poetry.lock,docker/**}` and on a
   daily schedule, since advisories land without a code change.
    - Install poetry 1.3.2, the Dockerfile's version, and run
      `poetry lock --check`.
    - Run the Dockerfile's own `poetry export --extras all`.
    - Evaluate the export's markers for the image's Python (`PYTHON_VERSION` in
      `docker/Dockerfile`, now 3.11), as was done above.
    - Run the pinned `osv-scanner-action@v2.3.3` on the result with
      `--no-resolve`. Accepted risks go in an
      `apps/blackout-server/osv-scanner.toml`, each with a reason and an
      `ignoreUntil` date, as the root `osv-scanner.toml` already requires.
    - Separately, scan `--lockfile=apps/blackout-server/Cargo.lock`.
    - Then narrow or remove `skip-dirs`, and correct its comment.
2. **Scheduled and on release.** Build `apps/blackout-server/docker/Dockerfile`
   the way `deploy.sh` does, and run Trivy in `image` mode on it. That sees the
   installed site-packages and the Debian packages of `python:3.11-slim-bookworm`.
   That base layer is a separate surface, and nothing scans it today.

**Sequencing:** with the open items above, the first layer would fail on day
one: 18 packages, 88 vulnerabilities by osv-scanner's count. So the open items
need either fixing or triaging into the allowlist first, or the job can land
report-only (SARIF upload) and turn blocking once that is done. Making it
blocking with an un-triaged backlog would only teach people to ignore it.

---

## Licensing note

The `check_dependencies.py` hunks and the ported test come from upstream PR
#19110 (2025). That is Element's AGPL-3.0-or-later code, ported into files
that still carry the 1.98-era Apache-2.0 header. The situation is the one
described in `upstream-advisory-triage-2026-10-09.md`: the code fits the
repository's AGPL and GPL options, and whether it can be offered under
`LICENSE-COMMERCIAL` is for the maintainer and counsel.

---

## Not verified

-   **The Docker image was not built:** there is no Docker daemon here. The
    tests ran in Python 3.11.17 and 3.10.20 venvs built from the locks, not in
    `python:3.11-slim-bookworm`.
-   **Only GHSA-5xm2 and GHSA-74r2 were reproduced.** Every other reachability
    statement comes from the code. The APNG case was measured at an
    8000×8000 claim only, not at the gigabyte sizes the advisory describes.
-   **Postgres:** the three Postgres-only tests were skipped. `psycopg2` and
    `pyicu` were not installed, because their headers (`libpq-dev`,
    `libicu-dev`) are absent, so the `postgres` and `user-search` extras were
    left out. The tests ran on SQLite.
-   **The `EmailPusherTests` failures** were not investigated. They are the
    same before and after.
-   **Not known:**
    -   Which deployment serves Matrix for theblackout.app.
    -   Whether GHSA-wqgw-9xfh-qf2g affects 10.1.0.
    -   What the published upstream v1.130.0 image contains.
    -   Whether GitHub's Dependabot alerts or the Renovate app are active on this
        repository.
-   **The nginx routing** of `/_matrix/media` was read, not tested against a
    running instance.
-   **mypy** ran on the two changed files only (with followed imports), not on
    the whole fork.
-   **Not triaged here:** the `Cargo.lock` and
    `services/blackout-api/requirements.txt` findings, and the Moderate and Low
    advisories in the lock.
