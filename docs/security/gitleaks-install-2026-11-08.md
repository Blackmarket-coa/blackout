# Gitleaks install: pinned sha256, retried download, verified cache — 2026-11-08

The **Gitleaks secret scan** job in `.github/workflows/security.yml` failed on
PRs #1003 and #1004 in its **Install gitleaks** step, before any scan ran. The
step piped an unverified download into `sudo tar`, with no retry and no cache,
so one refusal from the release host stopped the gate. This record says what
failed, what changed in that step, and what the change does not cover. The scan
steps, the gitleaks version (8.21.2) and the other jobs are unchanged.

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

All of it is in the `gitleaks` job.

### Pin

`GITLEAKS_SHA256` is
`5bc41815076e6ed6ef8fbecc9d9b75bcae31f39029ceb55da08086315316e3ba`, set on the
job next to `GITLEAKS_VERSION`. It was checked against the release's published
checksums file, `gitleaks_8.21.2_checksums.txt`, fetched over TLS from
`https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/` at 10:26Z
(file sha256
`4dc25a47d7e6f8f8284e1b4a4944af42924024f2a31d90ed14b0b8a038d47ff9`). Its
`gitleaks_8.21.2_linux_x64.tar.gz` line has that value. A copy of the
archive downloaded over TLS from the same URL on 2026-10-26 hashes to the same
value, and its `gitleaks` binary reports `8.21.2`.

The install step runs `sha256sum --check --strict` on the archive before
anything is extracted, and extracts only the `gitleaks` member, as before. An
empty or malformed pin fails the check (tested; see Verification).

The two variables are on the job, not the step, so that the cache steps can
key on them. gitleaks 8.21.2 reads one environment variable, `GITLEAKS_CONFIG`
(the only `os.Getenv` in its tree at the `v8.21.2` tag, outside test data), so
the scan steps behave as before.

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
    about 4 minutes 15 seconds (measured at 254.0 s). The step also has
    `timeout-minutes: 10`.
-   A `Retry-After` header replaces the 15 s wait, and one that would carry
    the retries past 180 s ends them (`src/tool_operate.c` at `curl-8_5_0`).
-   Not `--retry-all-errors`: it would also retry a 404 from a wrong version or
    asset name for the full 3 minutes, and curl's own documentation advises
    against it as a default.
-   `--no-progress-meter` instead of `-sS`, so curl's "Will retry in 15
    seconds" lines reach the log.

### Cache

`actions/cache/restore` and `actions/cache/save` at
`caa296126883cff596d87d8935842f9db880ef25`, the commit `v5` and `v5.1.0` named
on 2026-11-08 (`git ls-remote https://github.com/actions/cache`); their
`action.yml` at that commit runs on `node24`. The repository had no SHA pin
for `actions/cache` to reuse: its one use, the nav-audit job in `ci.yml`, is
`actions/cache@v4` by tag. The pin follows the form the repository uses for
`actions/checkout`, `actions/setup-node` and `actions/upload-artifact`: the
full commit SHA, with the major version as a comment.

-   Path `${{ runner.temp }}/gitleaks`, holding only the archive. Key
    `gitleaks-<version>-linux_x64-<sha256>`, exact match only (no
    `restore-keys`), so a version or pin change starts a new entry.
-   The restore step has `continue-on-error: true`: a cache that cannot be
    reached must not fail the scan. The install step then downloads.
-   **A restored archive is not trusted.** The install step checks it against
    the pin before extracting. If it fails, the step removes it, writes a
    warning annotation and downloads; the download is checked in turn. A bad
    entry (a partial restore, or anything else saved under the key) costs a
    download, not the gate.
-   The save step runs only when the install step passed, so only an archive
    that matched the pin is saved, and before the scan, so that a scan that
    finds a leak (and fails the job) still leaves the entry. It is skipped on
    an exact hit. GitHub does not let an existing key be overwritten; at the
    pinned commit `saveImpl` catches every error, logs it and passes.

**Which runs save an entry others can use.** The workflow runs on
`pull_request` (with a `paths` filter), on `push` to `develop`, `master` and
`main`, and on `merge_group`. GitHub's dependency-caching reference (read
2026-11-08) says a run can restore caches created on its current branch or the
default branch, and a pull request run also those of its base branch; a pull
request run's cache is created for its merge ref (`refs/pull/N/merge`), which
neither the base branch nor other pull requests can restore; and `push` is one
of the events that may write to the default branch's scope. `develop` is the
default branch and its `push` trigger has no `paths` filter, so the first push
to `develop` after this merges saves an entry, if the release host answers
then, and every branch and pull request can restore it. A pull request run that
misses before then saves into its own merge ref, which only that pull request's
later runs restore. Merge-queue runs and pushes to `master` or `main` save into
their own refs.

## Not covered

-   **A cold cache still depends on the release host.** That is the first run
    after this merges, the first after a version bump, and any run after
    `develop`'s entry is gone. GitHub's documented rule (same reference): entries
    not accessed in over 7 days are removed, and once a repository reaches its
    cache storage limit (10 GB by default) entries are deleted in order of last
    access, oldest first. Each run of this job that restores `develop`'s entry
    is an access, but the limit is shared with the other jobs' caches (pnpm
    stores, Playwright browsers).
    The repository's cache usage was not checked: the cache API is not
    reachable from this session.
-   **A bad entry persists while it is read.** A hit skips the save and a key
    cannot be overwritten, so an entry that fails the check costs a download on
    every run, with a warning annotation, until it is deleted
    (`gh cache delete <key>`) or stops being read for 7 days.
-   **Failures curl does not retry.** A transfer cut off part way (exit 18), a
    TLS error, or a 4xx other than 408 and 429 (a 404 gave exit 22 after one
    request) fails the step at once. Nothing is extracted and nothing is saved.
-   **The pin moves with the version.** A bump must change `GITLEAKS_VERSION`
    and `GITLEAKS_SHA256` together, the latter from the new release's checksums
    file. A bump that leaves the old value fails closed at the check.
-   **Authenticity beyond the checksums file.** The pin ties the archive to the
    checksums file gitleaks published on the release, as fetched on two dates.
    Both come from the same host; gitleaks' `.goreleaser.yml` at `v8.21.2` has
    no signing section, and no signature was checked.
-   **Not yet run in GitHub Actions.** The restore and save behaviour above is
    from GitHub's documentation and the action's source at the pinned commit;
    the install script itself ran locally (below). This branch's own pull
    request run is the first real run: it will miss, download and save into the
    pull request's merge ref, and a re-run of it should hit.

## Verification

The install step's `run` script was extracted from the workflow with PyYAML and
run under `bash -e`, as the runner runs it, against a local Python HTTP server.
The test harness made three substitutions only: the
`https://github.com/gitleaks/gitleaks/releases/download/` prefix pointed at the
local server, `sudo` dropped, and `/usr/local/bin` replaced by an empty
temporary directory. The server answers the release path with 302 to an asset
path, as GitHub does.

| Case                                                | Exit | Time    | Release-path requests | Extracted                     |
| --------------------------------------------------- | ---- | ------- | --------------------- | ----------------------------- |
| 504 for the first 3 requests, then the archive      | 0    | 45.2 s  | 4                     | real binary, reports `8.21.2` |
| Tampered archive served                             | 1    | 0.0 s   | 1                     | nothing                       |
| 504 on every request                                | 22   | 180.2 s | 13                    | nothing                       |
| 504 after 12.7 s ×7, then a request that hangs      | 28   | 254.0 s | 8                     | nothing                       |
| Transfer cut off half way                           | 18   | 0.0 s   | 1                     | nothing                       |
| Good archive in the cache path, server always 504   | 0    | 0.1 s   | 0                     | real binary, reports `8.21.2` |
| Tampered archive in the cache path, server up       | 0    | 0.1 s   | 1                     | real binary, reports `8.21.2` |
| Tampered archive in the cache path, nothing listens | 7    | 180.2 s | 0 (13 refused)        | nothing                       |
| Empty `GITLEAKS_SHA256`, server up                  | 1    | 0.0 s   | 1                     | nothing                       |
| 404 (wrong path)                                    | 22   | 0.0 s   | 1                     | nothing                       |

"Real binary" means its sha256 equals that of the `gitleaks` member of the
pinned archive (`50b742ab…e359`). Where a tampered archive was involved, the
tampered `gitleaks` (a script printing `TAMPERED`) was never written to the
binary directory.

Also run on the changed files: actionlint 1.7.12 with shellcheck 0.9.0 on
`PATH` (no findings; a seeded unquoted variable in the step was reported, so
shellcheck did run), a PyYAML parse, Prettier 2.8.1 (`--check`), and gitleaks
8.21.2 over this branch's commits.
