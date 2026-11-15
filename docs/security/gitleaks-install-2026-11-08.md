# Gitleaks install: pinned sha256, retried download, cache kept out of the scan job — 2026-11-08

The **Gitleaks secret scan** job in `.github/workflows/security.yml` failed on
PRs #1003 and #1004 in its **Install gitleaks** step, before any scan ran. The
step piped an unverified download into `sudo tar`, with no retry and no cache,
so one refusal from the release host stopped the gate. This record says what
failed, what changed, and what the change does not cover. One job is added
and the `gitleaks` job now waits for it; the scan steps, the gitleaks version
(8.21.2) and the other jobs are unchanged. The first version
of this change restored the cache inside the scan job, which a review showed
to be unsafe; see **Corrected after review**, **Changed after the first
review** and **After the second review** at the end.

## What failed

`security.yml` run 42470890783 (#1003, head `ba196ea353`) and run 42470980836
(#1004, head `f085c70857`), both on 2026-11-08 and each re-run once. All four
job attempts (128701133296, 128701987073, 128701416377, 128701912284) failed in
**Install gitleaks** with the same lines:

```
curl: (22) The requested URL returned error: 504

gzip: stdin: unexpected end of file
tar: Child returned status 1
tar: Error is not recoverable: exiting now
##[error]Process completed with exit code 2.
```

-   In three attempts the 504 came about 0.1 s after the step started (job
    128701133296: 10:19:12.060Z to 10:19:12.167Z); in the fourth
    (128701987073) after about 11 s.
-   Runner image ubuntu-24.04 20261101.360.1. The step ran under
    `/usr/bin/bash -e {0}`, without `pipefail`, so it failed because `tar` read
    an empty stream and exited 2, not because of curl's exit 22.
-   The run before them, 42463329485 (#1002) at 08:31Z, passed.
-   From the sandbox this work ran in, at about 10:20–10:25Z, the same URL
    answered 504 on 8 of 8 attempts, each in about 85 ms from GitHub's `iad`
    edge, while githubstatus.com reported all systems operational. Other
    release assets (Trivy's checksums file, gitleaks' checksums file) answered
    200 or 504 on and off. At 10:35Z the archive URL answered 502 after 30 s
    once, then 200 twice. That sandbox reaches GitHub through an HTTPS proxy,
    so the 502 may be the proxy's own timeout rather than GitHub's answer.

## What changed

A new job, `gitleaks_archive` (**Gitleaks archive from the cache**), restores
the archive from the Actions cache and hands it over as an artifact of the
run. The `gitleaks` job no longer restores a cache: it checks what it is
handed against the pin, downloads the archive itself when that check fails or
there is nothing, and saves a verified download to the cache.

### Pin

`GITLEAKS_SHA256` is
`5bc41815076e6ed6ef8fbecc9d9b75bcae31f39029ceb55da08086315316e3ba`. It was
checked against the release's published checksums file,
`gitleaks_8.21.2_checksums.txt`, fetched over TLS from
`https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/` at 10:26Z
(file sha256
`4dc25a47d7e6f8f8284e1b4a4944af42924024f2a31d90ed14b0b8a038d47ff9`) and fetched
again during the first review round with the same file sha256. Its
`gitleaks_8.21.2_linux_x64.tar.gz` line has that value. A copy of the
archive downloaded over TLS from the same URL on 2026-10-26 hashes to the same
value, and its `gitleaks` binary reports `8.21.2`.

The install step runs `/usr/bin/sha256sum --check --strict` on the archive
before anything is extracted, and `sudo /usr/bin/tar` extracts only the
`gitleaks` member, as before. An empty or malformed pin fails the check
(tested; see Verification).

`GITLEAKS_VERSION` and `GITLEAKS_SHA256` are set on the `gitleaks` job, so that
the save step can key on them, and repeated on `gitleaks_archive`, which needs
them for the key and its own check. If the two copies differ, the `gitleaks`
job finds no archive it accepts and downloads one: the cache stops helping and
nothing else changes. gitleaks 8.21.2 reads one environment variable,
`GITLEAKS_CONFIG` (the only `os.Getenv` in its tree at the `v8.21.2` tag,
outside test data), so the scan steps behave as before.

### Retry

```
curl --fail --location --no-progress-meter \
    --connect-timeout 10 --max-time 60 \
    --retry 12 --retry-connrefused --retry-delay 15 --retry-max-time 180
```

ubuntu-24.04 runners ship curl 8.5.0; the simulations below ran curl 8.5.0.

-   `--retry` retries timeouts and HTTP 408, 429, 500, 502, 503 and 504; with
    `--fail` an HTTP error is exit 22. `--retry-connrefused` adds a refused
    connection.
-   `--retry-delay 15` waits 15 s between attempts. Without it the wait starts
    at 1 s and doubles, which puts most attempts in the first few seconds; the
    edge here failed on and off, so evenly spread attempts sample it better.
-   `--retry-max-time 180` starts no retry once 3 minutes have passed. Against
    fast 504s that is 13 attempts in 180 s (measured). `--max-time 60` bounds a
    single attempt; the archive is 3,039,336 bytes. The longest case is a
    failure just under 180 s, a 15 s wait and an attempt that runs to 60 s:
    about 4 minutes 15 seconds (measured at 254 s). The step also has
    `timeout-minutes: 10`.
-   A `Retry-After` header on the error replaces the 15 s wait, shorter or
    longer, and one that would carry the retries past 180 s ends them
    (`src/tool_operate.c` at `curl-8_5_0`). curl 8.5.0 has no flag to ignore
    it. Against 504s that all carry `Retry-After: 1`, the 13 attempts took
    12 s (measured). Whether GitHub's edge sends the header on these 504s is
    not known: the failed job logs show only curl's error line.
-   Not `--retry-all-errors`: it would also retry a 404 from a wrong version or
    asset name for the full 3 minutes, and curl's own documentation advises
    against it as a default.
-   `--no-progress-meter` instead of `-sS`, so curl's "Will retry in 15
    seconds" lines reach the log.

### Cache

**Why the restore is not in the scan job.** A cache entry is not signed, and
restoring one writes outside the cache path. `actions/cache` at the pinned
commit extracts the entry with `tar -xf <archive> -P -C $GITHUB_WORKSPACE`
(`dist/restore-only/index.js`); `-P` keeps absolute and `../` member names,
and members are not filtered. Whoever saved the entry the restore finds
(under the key or, as below, under a longer key that begins with it) therefore
decides what lands anywhere the runner user can write. In the scan job, where
the first version restored it, two routes turn that into a disabled scan:
`~/.local/bin`, which the ubuntu image puts on `PATH` ahead of
`/usr/local/bin` (`images/ubuntu/scripts/build/install-python.sh` in
`actions/runner-images`), so a planted `gitleaks` answers both
`gitleaks version` and the scan; and a `.gitleaks.toml` in the checkout, which
`gitleaks detect` uses as its config when there is no `--config` and no
`GITLEAKS_CONFIG` (the repository tracks none), so an allowlist of `.*` makes
the real binary report no leaks. The review demonstrated both locally against
the first version, whose install step printed `OK` for the genuine archive the
planted entry also carried. GitHub's dependency-caching reference says the
same in general: "Cache contents are not signed or verified, and any workflow
run that can read a cache may extract its contents. Extracted caches may
modify files that are subsequently executed in a workflow run, leading to
malicious code execution."

**`gitleaks_archive`.** Each job runs on its own runner ("Each job will run
inside its own virtual machine runner, or inside a container", GitHub's
Actions overview), so what a restore writes stays on that job's runner. The
job has no checkout, `permissions: {}`, and a 10-minute timeout.

-   `actions/cache/restore` at `caa296126883cff596d87d8935842f9db880ef25`, the
    commit `v5` and `v5.1.0` named on 2026-11-08 (`git ls-remote
https://github.com/actions/cache`); its `action.yml` at that commit runs on
    `node24`. The repository had no SHA pin for `actions/cache` to reuse: its
    one use, the nav-audit job in `ci.yml`, is `actions/cache@v4` by tag. The
    pin follows the form the repository uses for `actions/checkout`,
    `actions/setup-node` and `actions/upload-artifact`: the full commit SHA,
    with the major version as a comment.
-   Path `${{ runner.temp }}/gitleaks`, holding only the archive. Key
    `gitleaks-<version>-linux_x64-<sha256>`, with no `restore-keys`, so a
    version or pin change starts a new entry. That does not make the restore
    an exact match only. GitHub's dependency-caching reference (Cache key
    matching) says the cache action searches for the key, then for
    prefix-matches for the key, then for `restore-keys`, first in the run's
    own branch and then in the default branch. `actions/cache` at the pinned
    commit extracts whatever entry comes back and sets `cache-hit` to `true`
    only when its key equals the key (`isExactKeyMatch`, which ignores case).
    So when there is no exact entry, an entry whose key begins with this key
    is extracted on this job's runner with `cache-hit` false: nothing is
    checked or handed over, and the `gitleaks` job downloads. The step has
    `continue-on-error: true` and `timeout-minutes: 3`: an unreachable, failed
    or slow cache is a miss.
-   On a hit, the archive is checked against the pin with `/usr/bin/sha256sum`.
    A mismatch fails this job, with an error annotation naming the
    `gh cache delete` command, and nothing is handed over. `sha256sum` is
    called by absolute path, but the runner looks up the step's own `bash` on
    `PATH` (`WhichUtil.Which("bash", ...)` in `actions/runner`'s
    `src/Runner.Worker/Handlers/ScriptHandler.cs`; the failed jobs ran
    `/usr/bin/bash -e {0}`), so an entry that planted a `bash` in
    `~/.local/bin` gets round the check. The check is a diagnostic that names
    a bad entry, not a defence; the `gitleaks` job checks again.
-   The archive is uploaded as the artifact `gitleaks-archive` with
    `actions/upload-artifact` at the SHA the repository already pins
    (`b7c566a772e6b6bfb58ed0dc250532a479d7789f`, v6), retention 1 day,
    `overwrite: true` so that a re-run of all jobs replaces the earlier
    attempt's artifact, `continue-on-error: true` and `timeout-minutes: 3`.

**`gitleaks` job.**

-   `needs: gitleaks_archive` with `if: ${{ !cancelled() }}`: it waits for the
    archive job and runs whether that job succeeds or fails, except when the
    run is cancelled (for the archive job reaching its own timeout, see **Not
    yet run: the archive job reaching its own timeout**). Without the
    condition a failed archive job would skip the scan, and GitHub reports "A
    job that is skipped will report its status as "Success". It will not
    prevent a pull request from merging, even if it is a required check." It
    reads no output of the archive job.
-   `actions/download-artifact` at `9000827ccba6bdab643e8b6fd33ac0654aef8333`
    (`v8` and `v8.0.2`, 2026-10-07), into `${{ runner.temp }}/gitleaks-artifact`,
    outside the checkout and off `PATH`, with `continue-on-error: true` and
    `timeout-minutes: 3`. It selects the artifact with
    `pattern: gitleaks-archive` and `merge-multiple: true`, not
    `name: gitleaks-archive`. At the pinned commit `name:` with no such
    artifact throws, and `core.setFailed` marks the step failed with an error
    annotation (`continue-on-error` keeps the job going), which every run
    after a cache miss would show; a pattern that matches nothing logs
    `Total of 0 artifact(s) downloaded` and passes, and a single match is
    extracted into `path` itself, as with `name:`. The repository used
    `download-artifact` only as `@v4` by tag (`release.yml`), so there was no
    SHA to reuse. v8 rather than the v6 that matches the upload: the zip
    extraction in v8 (and v7) uses unzip-stream's sanitiser from 0.3.2 on,
    which turns every `..` segment of an entry name into `.`; v6.0.0, v4.3.0
    and v4.1.3 bundle 0.3.1's, which strips only leading `../`. A zip with an
    entry `a/../../escaped-mid.txt`, extracted with unzip-stream 0.3.1 from
    npm, wrote the file one level above the target; with 0.3.4 it landed
    inside, as `a/escaped-mid.txt`. download-artifact's own test workflow at
    v8.0.2 uploads with `upload-artifact@v4` and downloads with v8.
-   The install step uses the artifact's archive only if it is a regular file
    that passes the check. Otherwise it writes a warning (when something was
    there), downloads the archive into `${{ runner.temp }}/gitleaks`, a
    directory nothing else in the job writes to, and checks it; a download
    that fails the check fails the step. After a verified download it sets the
    step output `downloaded=true`.
-   `actions/cache/save` (same pinned commit) saves `${{ runner.temp }}/gitleaks`
    only when `downloaded` is `true`, so only an archive this job downloaded
    and checked is saved. Saving reads files and uploads them and extracts
    nothing. It runs before the scan, so that a scan that finds a leak (and
    fails the job) still leaves the entry, with `continue-on-error: true` and
    `timeout-minutes: 3` so that a cache problem cannot fail the scan. GitHub
    does not let an existing key be overwritten; at the pinned commit
    `saveImpl` catches every error and logs it, and the step passes.

**Which runs save an entry others can use.** The workflow runs on
`pull_request` (with a `paths` filter), on `push` to `develop`, `master` and
`main`, and on `merge_group`. GitHub's dependency-caching reference (read
2026-11-08) says a run can restore caches created on its current branch or the
default branch, and a pull request run also those of its base branch; a pull
request run's cache is created for its merge ref (`refs/pull/N/merge`), which
neither the base branch nor other pull requests can restore; and only runs
triggered by `push`, `workflow_dispatch`, `repository_dispatch`, `delete`,
`registry_package`, `page_build` or `schedule` may write to the default
branch's scope. `develop` is the default branch and its `push` trigger has no
`paths` filter, so the first push to `develop` after this merges, if the cache
misses and the release host answers, saves an entry every branch and pull
request can restore. A pull request run that misses before then saves into its
own merge ref, which only that pull request's later runs restore. Merge-queue
runs and pushes to `master` or `main` save into their own refs.

## Not covered

-   **A cold cache still depends on the release host.** That is the first run
    after this merges, the first after a version bump, and any run after
    `develop`'s entry is gone. GitHub's documented rule (same reference): entries
    not accessed in over 7 days are removed, and once a repository reaches its
    cache storage limit (10 GB by default) entries are deleted in order of last
    access, oldest first. Each run that restores `develop`'s entry is an
    access, but the limit is shared with the other jobs' caches (pnpm stores,
    Playwright browsers). The repository's cache usage was not checked: the
    cache API is not reachable from this session.
-   **Anyone who can save under the key, or under any longer key that begins
    with it, can run code in `gitleaks_archive`.** The key is public (it is in
    this file). An entry under the key itself can be saved whenever none
    exists (before the first save, after a version bump, after eviction, which
    whoever can save entries can force by filling the cache). An entry under a
    longer key can be saved at any time, even while the genuine entry exists,
    and is extracted whenever the exact key misses (see **Cache**). Because a
    run's own branch is searched before the default branch, that includes a
    pull request run whose own scope holds such an entry while `develop` holds
    the genuine one. Either kind can be saved by any job, in any workflow of
    the repository, of a run on `develop` started by one of the triggers above
    (for example a dependency's install script during a `pnpm install`), and
    by a pull request run into that pull request's own merge ref. Such an
    entry has to be assumed to run code in `gitleaks_archive`, which has no
    checkout and no token permissions. From there it can fail or stall that
    job, save caches in the run's own scope, and upload artifacts to the run.
    A stall delays the scan by up to the job's 10-minute timeout, provided
    GitHub does not count a job cancelled by its timeout as cancelled for
    `!cancelled()`; that is untested (see **Not yet run: the archive job
    reaching its own timeout**).
    The `gitleaks` job uses the archive in the `gitleaks-archive` artifact
    only after the pin check, and otherwise downloads; this rests on
    `download-artifact` v8 keeping the extracted files inside its target
    directory, as above.
-   **Any job of the same run can hand the scan job an artifact.** The
    `gitleaks` job takes the run's `gitleaks-archive` artifact whoever
    uploaded it. Code in any job of the run that can reach the runner's
    artifact token can upload one under that name when there is none, or
    replace one (`upload-artifact`'s `overwrite` deletes and re-uploads),
    before the `gitleaks` job fetches it. In this workflow that includes the
    jobs that run beside `gitleaks_archive`: `dependency_audit` runs
    `pnpm/action-setup@v5` and `google/osv-scanner-action@v2.3.3`, both pinned
    by tag, and `pnpm install --frozen-lockfile` with pnpm 9.15.4, which runs
    dependencies' install scripts (there is no `onlyBuiltDependencies` or
    `ignore-scripts` setting in `package.json` or `pnpm-workspace.yaml`, and no
    `.npmrc`); `semgrep` and `trivy` run `semgrep/semgrep-action@v1` and
    `aquasecurity/trivy-action@v0.35.0`, also by tag. Before this change the
    scan job took nothing from other jobs. Against such an artifact it relies
    on the same two things as above: the pin check, and `download-artifact` v8
    keeping the files it writes inside its target directory. In the local runs
    of the install step, a tampered artifact led to a download, or, with the
    release host also unreachable, to a failed step with nothing extracted.
-   **A bad entry persists while it is read.** When an entry under the key
    fails the check, the `gitleaks` job downloads and its save step runs, but
    a key cannot be overwritten, so the save into the entry's own scope is
    refused (`saveImpl` logs the error and the step passes). The entry keeps
    failing `gitleaks_archive` and costing a download in the scan on every run
    that restores it, until it is deleted (`gh cache delete <key>`) or stops
    being read for 7 days. Whether a pull request run's save of the same key
    into its own merge ref succeeds while `develop` holds the bad entry was
    not checked. An entry that carries the genuine archive and extra files
    passes the check and raises nothing; its extra files stay on the archive
    job's runner.
-   **The scan waits for `gitleaks_archive`.** Every run now schedules one more
    short job before the scan; the delay was not measured.
-   **GitHub's `cache-mode` job key is not used.** It would let
    `gitleaks_archive` only restore and the `gitleaks` job only save, enforced
    by scoped cache tokens. actionlint 1.7.12 rejects the key ("unexpected key
    "cache-mode" for "job" section"), so it was left out.
-   **Failures curl does not retry.** A transfer cut off part way (exit 18), a
    TLS error, or a 4xx other than 408 and 429 (a 404 gave exit 22 after one
    request) fails the step at once. Nothing is extracted and nothing is saved.
-   **The pin moves with the version.** A bump must change `GITLEAKS_VERSION`
    and `GITLEAKS_SHA256` together, the latter from the new release's checksums
    file, in both jobs. A bump that leaves the old value fails closed at the
    check.
-   **Authenticity beyond the checksums file.** The pin ties the archive to the
    checksums file gitleaks published on the release, as fetched on two dates.
    Both come from the same host; gitleaks' `.goreleaser.yml` at `v8.21.2` has
    no signing section, and no signature was checked.
-   **Not yet run in GitHub Actions.** The restore, upload, download and save
    behaviour above is from GitHub's documentation and the actions' source at
    the pinned commits, not from a run. In particular `permissions: {}` is
    expected not to affect the cache and artifact actions, which use the
    runner's own token rather than `GITHUB_TOKEN`. If that is wrong, or the
    restore, upload or download fails for another reason, the `gitleaks` job
    downloads the archive, as it does on a miss. This branch's own pull
    request run is the first real run: it will miss, download and save into
    the pull request's merge ref, and a re-run of it should restore, hand over
    and use the artifact. The download step's behaviour with and without an
    artifact was run only against a local stand-in for the artifact service
    (see Verification).
-   **Not yet run: the archive job reaching its own timeout.** GitHub cancels a
    job that reaches its `timeout-minutes`, and its expressions reference says
    only that `cancelled()` "Returns true if the workflow was canceled". It
    does not say whether a `gitleaks_archive` cancelled by its own 10-minute
    timeout makes `!cancelled()` false for the `gitleaks` job. If it does,
    whoever can stall `gitleaks_archive` past 10 minutes (see above) skips the
    scan, and a skipped job reports as a success. Settling it takes a
    throwaway workflow: a needed job that sleeps past `timeout-minutes: 1`,
    and a dependent job with `if: ${{ !cancelled() }}`.
-   **Seen while doing this, not changed here.** `release.yml` uses
    `actions/download-artifact@v4`, which today resolves to v4.3.0 and its
    unzip-stream 0.3.1 sanitiser. It downloads artifacts uploaded by earlier
    jobs of the same run.

## Verification

Both scripts were extracted from the workflow with PyYAML and run under
`bash -e`, as the runner runs them. The extractor also asserts the structure
described above: the `gitleaks` job has no cache restore, `gitleaks_archive`
has no checkout and `permissions: {}`, the `gitleaks` job has
`needs: gitleaks_archive` and `if: ${{ !cancelled() }}`, the two jobs' `env`
are equal, `gitleaks version` is the install step's last line, and the
download step selects `pattern: gitleaks-archive` with `merge-multiple: true`
(no `name:`) into the directory the install step reads.

**Install step (`gitleaks` job)**, against a local Python HTTP server. The test
harness made three substitutions only: the
`https://github.com/gitleaks/gitleaks/releases/download/` prefix pointed at the
local server, `sudo` dropped, and `/usr/local/bin` replaced by an empty
temporary directory. The server answers the release path with 302 to an asset
path, as GitHub does. "Artifact" is a file placed where `download-artifact`
puts the archive.

| Case                                                  | Exit | Time  | Release-path requests | `downloaded` | Extracted                     |
| ----------------------------------------------------- | ---- | ----- | --------------------- | ------------ | ----------------------------- |
| No artifact, 504 for the first 3 requests             | 0    | 45 s  | 4                     | `true`       | real binary, reports `8.21.2` |
| No artifact, tampered archive served                  | 1    | 0 s   | 1                     | not set      | nothing                       |
| No artifact, 504 on every request                     | 22   | 180 s | 13                    | not set      | nothing                       |
| No artifact, 504 on every request with Retry-After: 1 | 22   | 12 s  | 13                    | not set      | nothing                       |
| No artifact, 504 after 12.7 s ×7, then a hang         | 28   | 254 s | 8                     | not set      | nothing                       |
| No artifact, transfer cut off half way                | 18   | 0 s   | 1                     | not set      | nothing                       |
| No artifact, empty `GITLEAKS_SHA256`                  | 1    | 0 s   | 1                     | not set      | nothing                       |
| No artifact, 404 (wrong path)                         | 22   | 0 s   | 1                     | not set      | nothing                       |
| Good artifact, server always 504                      | 0    | 0 s   | 0                     | not set      | real binary, reports `8.21.2` |
| Tampered artifact, server up                          | 0    | 0 s   | 1                     | `true`       | real binary, reports `8.21.2` |
| A directory where the artifact's archive should be    | 0    | 0 s   | 1                     | `true`       | real binary, reports `8.21.2` |
| Tampered artifact, nothing listens                    | 7    | 180 s | 0 (13 refused)        | not set      | nothing                       |

"Real binary" means its sha256 equals that of the `gitleaks` member of the
pinned archive (`50b742ab…e359`). The tampered `gitleaks` (a script printing
`TAMPERED`) was never written to the binary directory. Where the artifact was
tampered with, the download went to the cache path and the tampered file was
not copied there, so the save step would save only the verified download.

**Check step (`gitleaks_archive`)**: with the genuine archive in the cache path
it exits 0; with the tampered one it exits 1 and prints the error annotation
with the `gh cache delete` command.

**Download step (`gitleaks` job).** `download-artifact`'s bundled
`dist/index.js` at the pinned commit, run with the inputs the runner passes
(the `action.yml` defaults included) against a local Python stand-in for the
artifact service's `ListArtifacts` and `GetSignedArtifactURL` calls and the
blob download. The action declares `node24`; it ran under Node 22.

| Inputs                                              | Run's artifacts    | Exit | Annotation                                                                  | Written to `path`             |
| --------------------------------------------------- | ------------------ | ---- | --------------------------------------------------------------------------- | ----------------------------- |
| `name: gitleaks-archive`                            | none               | 1    | `::error::Unable to download artifact(s): Artifact not found for name: ...` | nothing                       |
| `pattern: gitleaks-archive`, `merge-multiple: true` | none               | 0    | none (`Total of 0 artifact(s) downloaded`)                                  | nothing                       |
| `pattern: gitleaks-archive`, `merge-multiple: true` | `gitleaks-archive` | 0    | none                                                                        | the archive, sha256 = the pin |
| `name: gitleaks-archive`                            | `gitleaks-archive` | 0    | none                                                                        | the archive, at the same path |

**Zip extraction.** A zip holding `ok.txt`, `a/../../escaped-mid.txt`,
`../escaped-lead.txt` and `/abs-escape.txt`, extracted with unzip-stream's
`Extract` into `outer/dest`: 0.3.1 wrote `outer/escaped-mid.txt`, outside the
target, and the other three inside it; 0.3.4 wrote all four inside
(`a/escaped-mid.txt`). The sanitiser line in `download-artifact`'s bundled
`dist/index.js` is 0.3.1's at v4.1.3, v4.3.0 and v6.0.0, and 0.3.2's (the same
as 0.3.4's) at v7.0.0 and v8.0.2.

Also run on the changed files: actionlint 1.7.12 with shellcheck 0.9.0 on
`PATH` (no findings; a seeded unquoted variable in the install step was
reported, so shellcheck did run), a PyYAML parse, Prettier 2.8.1 (`--check`),
the **Hardening guards** job's four commands plus the duplicate-paths,
deployment-readiness and trust-page guards, and gitleaks 8.21.2 over this
branch's commits.

## Corrected after review

The first version of this change (`fb90f148d1`) restored the cache inside the
scan job and said that was safe. It was not; see **Cache**. These sentences in
its workflow comments and in this record were untrue, and its commit message
repeats the substance of the first:

1. "Nothing restored here is trusted: the install step checks it against
   GITLEAKS_SHA256 before extracting." The check covered the archive file
   only. The rest of the cache entry was extracted without a check, anywhere
   the runner user could write.
2. "A bad entry (a partial restore, or anything else saved under the key)
   costs a download, not the gate." A crafted entry that carried the genuine
   archive plus a `gitleaks` in `~/.local/bin` or a `.gitleaks.toml` in the
   checkout passed the check and disabled the scan.
3. "**A restored archive is not trusted.**" The same overstatement, in the
   Cache section of this record.
4. A bad entry costs "a download on every run, with a warning annotation".
   An entry carrying the genuine archive raised no warning at all.
5. The workflow comment said `--retry-delay 15` "waits 15 s between
   attempts" and that fast 504s get "13 attempts in about 3 minutes", without
   saying that a `Retry-After` header replaces the wait. The record's Retry
   section already said so.

## Changed after the first review

1. **The cache restore moved to its own job**, `gitleaks_archive`, with no
   checkout and no token permissions, which hands the archive over as an
   artifact. The `gitleaks` job restores no cache, waits for the archive job
   with `if: ${{ !cancelled() }}`, checks the artifact against the pin and
   downloads when that fails, and saves only its own verified download.
2. **`sha256sum` and `tar` are called by absolute path** in the install step,
   and `sha256sum` in the archive job's check.
3. **The retry comment** now says what `Retry-After` does.
4. **Timeouts and `continue-on-error`** on the cache and artifact steps, so that
   a slow or failing cache or artifact service delays the scan by at most a
   few minutes and never fails it.

## After the second review

These sentences in the version before this one (`5a29ee3703`) were untrue or
gave a wrong reason:

1. "exact match only (no `restore-keys`)": when there is no exact entry,
   GitHub also restores one whose key begins with the key; see **Cache**. The
   "Anyone who can save under the key" item said an entry could be saved only
   while none existed under the key; one under a longer key can be saved at
   any time.
2. "The check calls sha256sum by absolute path because the restore may have
   put files on PATH" (workflow comment, and the same reason in this record):
   the step's own `bash` is still looked up on `PATH`, so the absolute path
   protects nothing against a planted entry.
3. "No artifact is not an error" was true of the job's result, but with
   `name:` the download step was marked failed, with an error annotation, on
   every run without the artifact. Neither the comment nor this record said
   so.
4. "A hit skips the save": the `gitleaks` job's save runs after its own
   download and is refused because the key exists.
5. "runs whatever that job's result" and "the scan then starts up to 10
   minutes later": the archive job reaching its own timeout is untested.

Changed:

1. **The download step selects the artifact by pattern**
   (`pattern: gitleaks-archive`, `merge-multiple: true`) instead of `name:`,
   so a run without the artifact passes the step with no error annotation.
   The install step's path is unchanged.
2. **Not covered** now names the artifact as a channel from every job of the
   run, the longer-key case, and the untested timeout case; the workflow
   comments and the sentences above are corrected.

Re-run on this version: the extractor's structure checks, the install-step
cases for 504 on the first 3 requests, a tampered archive, 504 on every
request, a good and a tampered artifact, and a tampered artifact with nothing
listening, and the check step with a good and a tampered archive; each gave
the result recorded above.
