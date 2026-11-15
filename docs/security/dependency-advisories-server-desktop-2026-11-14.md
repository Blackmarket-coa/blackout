# Server, sidecar and desktop dependency advisories — 2026-11-14

Scope: every advisory osv-scanner reports against the five lockfiles that are
not `pnpm-lock.yaml`: the Synapse fork's `apps/blackout-server/poetry.lock` and
`Cargo.lock`, the legacy API's
`apps/blackout-server/services/blackout-api/requirements.txt`, the perturbation
sidecar's `services/perturbation/requirements.txt` and the desktop app's
`blackout-desktop/src-tauri/Cargo.lock`.

Why now: the operator asked for every advisory to be cleared before a
redeploy. On 2026-11-14 a full run over `develop` (`7a9814ebc9`),
`osv-scanner scan source -r --config osv-scanner.toml .`, reported 47 advisory
groups: 7 in `pnpm-lock.yaml` (hono and `@hono/node-server`, which another
branch fixes and this one does not touch) and 40 in three of the five files
above. Nothing in CI is red because of the 40. Run as `security.yml` runs it,
Trivy reports none of them: it stops at HIGH, skips dev dependencies, loads no
RustSec-only advisory and reads only the names a `requirements.txt` lists. The
OSV steps in `security.yml` and `ci.yml` scan `pnpm-lock.yaml` alone.

Earlier records had already looked at part of this, and they are not redone
here: `synapse-dependencies-triage-2026-10-25.md` (black),
`dependency-advisories-server-desktop-2026-10-30.md` ("Found outside scope",
item 4: most of the desktop lock, with each crate's path and exposure, "left
for its own change") and `dependency-advisories-twisted-2026-11-02.md` ("Found
outside scope", item 1: sentry-sdk and pygments). This is the change those
records left the findings for. The "Recorded" column says where each one was
written down first.

"Ships" says where the package ends up: in an image a deploy script builds, in
the desktop app for a target the release job builds, or only on a developer's
machine. The severity is GitHub's where the advisory has one, otherwise the
CVSS base score OSV shows, otherwise the RustSec class.

| Lockfile     | Package                 | Advisory                                                 | Severity     | Fixed in       | Ships                                                         | Recorded          | Decision                                                  |
| ------------ | ----------------------- | -------------------------------------------------------- | ------------ | -------------- | ------------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| fork poetry  | black 23.10.1           | GHSA-fj7x-q9j7-g6q6 (PYSEC-2024-48, CVE-2024-21503)      | Moderate     | 24.3.0         | no: dev group                                                 | 2026-10-25        | not bumped: the 2026-10-25 triage holds                   |
| fork poetry  | black 23.10.1           | PYSEC-2026-2120 (GHSA-v53h-f6m7-xcgm, CVE-2026-31900)    | 9.8 (CVSS)   | 26.3.0         | no: dev group                                                 | 2026-10-25        | same                                                      |
| fork poetry  | black 23.10.1           | PYSEC-2026-2121 (GHSA-3936-cmfr-pm3m, CVE-2026-32274)    | 7.5 (CVSS)   | 26.3.1         | no: dev group                                                 | 2026-10-25        | same                                                      |
| fork poetry  | black 23.10.1           | GHSA-cg8m-r9f2-5wm2 (CVE-2026-114134)                    | High         | 26.10.1        | no: dev group                                                 | 2026-10-25        | same                                                      |
| fork poetry  | pygments 2.15.1         | GHSA-5239-wwwm-4pmq (PYSEC-2026-2987, CVE-2026-4539)     | Low          | 2.20.0         | no: dev group                                                 | 2026-11-02        | bumped to 2.20.0                                          |
| fork poetry  | sentry-sdk 1.35.0       | GHSA-g92j-qhmh-64v2 (PYSEC-2026-1917, CVE-2024-40647)    | Low          | 1.45.1, 2.8.0  | Synapse image (`sentry` extra)                                | 2026-11-02        | bumped to 1.45.1                                          |
| fork poetry  | soupsieve 2.10          | GHSA-6655-6qjp-jx7x (CVE-2026-126191)                    | High         | 3.0.2          | no: optional `dev-docs` group                                 | new               | not bumped: no fixed release fits the fork's Python floor |
| fork poetry  | soupsieve 2.10          | GHSA-7g44-g9rc-x53w (CVE-2026-126193)                    | Moderate     | 3.0.2          | no: optional `dev-docs` group                                 | new               | same                                                      |
| fork poetry  | soupsieve 2.10          | GHSA-mmhr-3c5m-f64f (CVE-2026-126190)                    | High         | 4.0            | no: optional `dev-docs` group                                 | new               | same                                                      |
| fork poetry  | tornado 6.6             | GHSA-5cjw-f85j-cv6r (CVE-2026-126347)                    | Low          | 6.6.1          | Synapse image (`opentracing` extra)                           | new               | bumped to 6.6.1                                           |
| perturbation | starlette 0.41.3        | GHSA-86qp-5c8j-p5mr (PYSEC-2026-161, CVE-2026-48710)     | Moderate     | 1.0.1          | sidecar image, through fastapi 0.115.6; not named in the file | new               | starlette 1.10.0 pinned, fastapi 0.162.0                  |
| perturbation | starlette 0.41.3        | GHSA-2c2j-9gv5-cj73 (PYSEC-2026-1941, CVE-2025-54121)    | Moderate     | 0.47.2         | same                                                          | new               | same                                                      |
| perturbation | starlette 0.41.3        | GHSA-7f5h-v6xp-fcq8 (PYSEC-2026-1942, CVE-2025-62727)    | High         | 0.49.1         | same                                                          | new               | same                                                      |
| perturbation | starlette 0.41.3        | GHSA-x746-7m8f-x49c (PYSEC-2026-2280, CVE-2026-48817)    | Moderate     | 1.1.0          | same                                                          | new               | same                                                      |
| perturbation | starlette 0.41.3        | GHSA-wqp7-x3pw-xc5r (PYSEC-2026-2281, CVE-2026-48818)    | High         | 1.1.0          | same                                                          | new               | same                                                      |
| perturbation | starlette 0.41.3        | GHSA-jp82-jpqv-5vv3 (PYSEC-2026-248, CVE-2026-54282)     | Low          | 1.3.0          | same                                                          | new               | same                                                      |
| perturbation | starlette 0.41.3        | GHSA-82w8-qh3p-5jfq (PYSEC-2026-249, CVE-2026-54283)     | High         | 1.3.1          | same                                                          | new               | same                                                      |
| desktop      | anyhow 1.0.102          | RUSTSEC-2026-0190                                        | unsound      | 1.0.103        | Linux, macOS, Windows                                         | 2026-10-30, named | bumped to 1.0.103                                         |
| desktop      | event-listener 5.4.1    | RUSTSEC-2026-0221                                        | unsound      | 5.4.2          | Linux                                                         | 2026-10-30, named | bumped to 5.4.2                                           |
| desktop      | glib 0.18.5             | GHSA-wrw7-89jp-8q8g (RUSTSEC-2024-0429)                  | Moderate     | 0.20.0         | Linux                                                         | 2026-10-30        | not bumped: gtk 0.18 pins it; the affected type is unused |
| desktop      | pin-utils 0.1.0         | RUSTSEC-2026-0441                                        | unmaintained | none           | Linux, macOS, Windows                                         | new               | removed: hyper 1.9.0 no longer depends on it              |
| desktop      | proc-macro-error 1.0.4  | RUSTSEC-2024-0370                                        | unmaintained | none           | no: a build-time macro helper, Linux builds only              | 2026-10-30, named | explained                                                 |
| desktop      | quick-xml 0.37.5        | RUSTSEC-2026-0194                                        | 7.5 (CVSS)   | 0.41.0         | Windows                                                       | 2026-10-30        | removed: tauri-winrt-notification 0.7.3 drops it          |
| desktop      | quick-xml 0.37.5        | RUSTSEC-2026-0195                                        | 7.5 (CVSS)   | 0.41.0         | Windows                                                       | 2026-10-30        | same                                                      |
| desktop      | quick-xml 0.38.4        | RUSTSEC-2026-0194                                        | 7.5 (CVSS)   | 0.41.0         | Linux, macOS, Windows                                         | 2026-10-30        | 0.41.0, through plist 1.10.0                              |
| desktop      | quick-xml 0.38.4        | RUSTSEC-2026-0195                                        | 7.5 (CVSS)   | 0.41.0         | Linux, macOS, Windows                                         | 2026-10-30        | same                                                      |
| desktop      | rand 0.9.2              | GHSA-cq8v-f236-94qc (RUSTSEC-2026-0097)                  | Low          | 0.9.3          | Linux, macOS, Windows                                         | 2026-10-30        | bumped to 0.9.3                                           |
| desktop      | rustix 1.1.4            | RUSTSEC-2026-0486 (GHSA-jh2m-fhpj-3vr7)                  | unsound      | 1.1.6          | Linux, macOS                                                  | new               | bumped to 1.1.6                                           |
| desktop      | rustls 0.23.37          | GHSA-2mjx-qc3c-rqvc (RUSTSEC-2026-0285, CVE-2026-123613) | Moderate     | 0.23.45        | Linux, macOS, Windows                                         | 2026-10-30        | bumped to 0.23.46                                         |
| desktop      | rustls 0.23.37          | GHSA-c8m5-c952-6cm4 (RUSTSEC-2026-0346, CVE-2026-123609) | Moderate     | 0.23.46        | Linux, macOS, Windows                                         | 2026-10-30        | same                                                      |
| desktop      | rustls 0.23.37          | GHSA-h2v8-394m-p7vv (RUSTSEC-2026-0348, CVE-2026-123610) | Low          | 0.23.46        | Linux, macOS, Windows                                         | 2026-10-30        | same                                                      |
| desktop      | rustls 0.23.37          | GHSA-w44r-93j7-qv28 (RUSTSEC-2026-0349, CVE-2026-123611) | Low          | 0.23.46        | Linux, macOS, Windows                                         | 2026-10-30        | same                                                      |
| desktop      | rustls-webpki 0.103.13  | RUSTSEC-2026-0382 (CVE-2026-111943)                      | none given   | 0.103.16       | Linux, macOS, Windows                                         | 2026-10-30        | bumped to 0.103.16                                        |
| desktop      | serde_with 3.18.0       | GHSA-7gcf-g7xr-8hxj                                      | Moderate     | 3.21.0         | Linux, macOS, Windows                                         | 2026-10-30        | bumped to 3.21.0                                          |
| desktop      | tar 0.4.45              | GHSA-3pv8-6f4r-ffg2                                      | Moderate     | 0.4.46         | Linux, macOS                                                  | 2026-10-30        | bumped to 0.4.46                                          |
| desktop      | tokio 1.50.0            | RUSTSEC-2026-0386                                        | unsound      | 1.51.6, 1.53.3 | Linux, macOS, Windows                                         | 2026-10-30, named | bumped to 1.51.6                                          |
| desktop      | webpki-root-certs 1.0.6 | RUSTSEC-2026-0383 (CVE-2026-111943)                      | none given   | 1.0.10         | no: in the lock for wasm32 only                               | 2026-10-30        | bumped to 1.0.10                                          |
| desktop      | zbus_names 4.3.1        | RUSTSEC-2026-0371                                        | unmaintained | none           | Linux                                                         | 2026-10-30, named | explained                                                 |
| desktop      | zvariant 5.10.0         | RUSTSEC-2026-0370                                        | unmaintained | none           | Linux                                                         | 2026-10-30, named | explained                                                 |
| desktop      | zvariant_derive 5.10.0  | RUSTSEC-2026-0372                                        | unmaintained | none           | no: a build-time derive macro, Linux builds only              | 2026-10-30, named | explained                                                 |

"2026-10-30, named" means that record listed the crate among "seven RustSec
notices ... not triaged here" and said no more. The fork's `Cargo.lock` (40
packages) and the legacy API's `requirements.txt` (8) have no finding.

**Result:**

-   **28 of the 40 are cleared. 12 advisories in 7 packages remain:** two
    Python tools that only a developer installs (black 4, soupsieve 3) and
    five crates of the Linux desktop build (glib, and four "unmaintained"
    notices: proc-macro-error, zbus_names, zvariant, zvariant_derive).
    osv-scanner reports nothing in the other three files. Each of the 12 is
    explained below; none has an ignore entry, because no gate reports them.
-   **A running service had three High advisories that no gate could see.**
    `services/perturbation/requirements.txt` named no Starlette, so its image
    was built with whatever FastAPI 0.115.6 allows, 0.41.3. None of the seven
    advisories is reached by the sidecar's code. Starlette is now named in the
    file, at 1.10.0, with FastAPI 0.162.0.
-   **The fork's image changes by two packages:** tornado 6.6.1 and sentry-sdk
    1.45.1. The affected code of neither is loaded in a deployment as
    shipped: sentry-sdk is imported only when the config has a `sentry`
    section, which no template has, and the tornado module with the flaw,
    `tornado.web`, is never imported.
-   **The desktop lock moves 13 crates, one at a time, each to the smallest
    release that clears it.** Three of them are parents moved for the sake
    of a child: tauri-winrt-notification 0.7.3 and plist 1.10.0 for
    quick-xml, and hyper 1.9.0 for pin-utils. No tauri crate or plugin
    moves, so the npm packages they are paired with stay as they are.
-   **The Trivy gate passes before and after**, with nothing reported either
    time, so it shows no difference; the scans it does not run are in
    [Scans](#scans).
-   **Not built here for macOS or Windows.** The desktop crate type-checks on
    Linux with the new lock. One of the bumps is Windows-only code. The
    repository's desktop build check builds all three on the pull request,
    and that run is the proof.

Commits, on top of `7a9814ebc9`: `8da7864591` (the desktop lock), `77b21a72b1`
(the fork's lock, with the `PATCHES.md` entry), `02edf2a48b` (the sidecar's
pins), `dd3bd88a30` (mio 1.2.4 instead of 1.2.5), then this record, with
dated notes in the three earlier records it follows and a correction to the
new `PATCHES.md` entry ([Corrections](#corrections)).

---

## Method

-   **Scanners:** osv-scanner 2.3.3 (the version `security.yml`'s action pins)
    and Trivy 0.69.3, both binaries from earlier passes. Trivy's database was
    downloaded at 23:50 UTC on 2026-11-14 and is dated 2026-11-14 19:00 UTC;
    every Trivy run here used it, and whether a newer one existed by the
    last run was not looked at. The "before" scans ran on `develop`
    (`7a9814ebc9`), unchanged or as a `git archive` export: the per-file
    osv-scanner runs and Trivy between 23:46 and 23:51 UTC, the recursive
    run and the runs with the root config at 00:10 UTC on 2026-11-15. The
    "after" scans ran on a `git archive` of `dd3bd88a30` at 00:27 UTC.
-   **osv-scanner, per lockfile:** `scan source --lockfile=<file>`, which
    applies no ignore file. The root `osv-scanner.toml` holds one entry,
    GHSA-gcqx-w48m-w2h4 (deepmerge), which is in `pnpm-lock.yaml` only: with
    `--config osv-scanner.toml` each of the five files gives the same counts,
    and osv-scanner calls the entry unused. So nothing in these files is
    filtered by it.
-   **osv-scanner resolves a `requirements.txt`.** For
    `services/perturbation/requirements.txt` it reads the 5 names in the file
    and then resolves 15 more through deps.dev (`--all-packages` lists them).
    starlette 0.41.3 is one of the 15. A venv built from the file with pip
    under Python 3.11 has the same starlette.
-   **Trivy:** once as `security.yml` runs it (`fs`, `--scanners vuln`,
    `--severity CRITICAL,HIGH`, `--ignore-unfixed`,
    `--ignorefile .trivyignore`, `--exit-code 1`), once with every severity,
    unfixed findings and an empty ignore file, and once more with
    `--include-dev-deps`.
-   **Advisory text:** the records osv-scanner printed (its JSON output
    carries each one in full).
-   **Registries:** the crates.io API for versions, dates, dependency
    requirements and checksums; PyPI's JSON API for versions, dates,
    `requires_python`, `requires_dist` and file hashes. Queried on 2026-11-14
    and 2026-11-15.
-   **Upstream Synapse:** `element-hq/synapse` `develop` at `e5ac865`
    (`git ls-remote` on 2026-11-15 at 00:16 UTC), its `poetry.lock`,
    `pyproject.toml` and `synapse/app/_base.py` read from
    `raw.githubusercontent.com` at that commit.
-   **Rust:** cargo 1.97.0.
    `cargo tree --locked -e normal,build --target <triple>` for
    `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin` and
    `x86_64-pc-windows-msvc`, the three the release job builds. Crate sources
    were read in cargo's registry cache, whose archives cargo checks against
    the lock's checksums.
-   **Python:** poetry 1.3.2, the version `docker/Dockerfile` installs, in its
    own venv. Tests ran under Python 3.11.17 in two venvs: one with the lock's
    packages as of `develop`, and a copy of it with tornado 6.6.1, sentry-sdk
    1.45.1 and pygments 2.20.0 installed with `--no-deps` (`pip check` clean).
    Scripts ran from a scratch directory with `PYTHONPATH` set to the fork, so
    nothing was written into the worktree.
-   **Load and disk:** the three `cargo check` runs and the test runs started
    with the 1-minute load under 3.5; target directories and venvs were kept
    in the session's scratch directory.

## What installs these packages

-   **The Synapse image.** `infra/single-server-baseline/deploy.sh` (line 27)
    builds `apps/blackout-server/docker/Dockerfile` as
    `blackout-synapse:stable`. The Dockerfile installs poetry 1.3.2 (line 61)
    and the output of `poetry export --extras all` (line 82). On `develop`
    that is 79 requirements. sentry-sdk and tornado are among them; black,
    pygments and soupsieve are not, because the export leaves out the dev
    group and the optional `dev-docs` group. `deploy/docker/blackout-backend`
    runs upstream's image, not the fork
    (`synapse-dependencies-triage-2026-10-25.md`).
-   **The perturbation sidecar.**
    `infra/single-server-baseline/docker-compose.yml` builds
    `services/perturbation` (line 344) and points the API at it
    (`PERTURBATION_SERVICE_URL`, line 162). Its Dockerfile runs
    `pip install -r requirements.txt` on `python:3.11-slim`.
-   **The legacy API.** `deploy.sh` (line 24) builds it; it has no finding.
-   **The desktop app.** The release job builds on ubuntu-22.04,
    macos-latest (aarch64) and windows-latest, and
    `blackout-desktop-build-check.yml` builds the same three on a pull
    request that touches `blackout-desktop/**`. A crate is in a build only
    if `cargo tree` lists it for that target.
-   **The dev group.** Nothing Blackout builds installs it. The fork's own
    workflows would (`poetry install` for lint and tests), and GitHub does
    not run them: only the repository root's workflows run. No root workflow
    names black, sphinx or `dev-docs`.

## The fork's lock

`poetry lock --no-update` under poetry 1.3.2. Three entries and `content-hash`
change, and nothing else: 151 packages before and after. Every file hash of
the three new entries matches PyPI's.

### tornado 6.6 → 6.6.1

GHSA-5cjw-f85j-cv6r (Low, published 2026-11-13): the open-redirect fix in
`tornado.web.RedirectHandler` that 6.6 shipped was incomplete for paths that
start with three slashes. 6.6.1 was published on 2026-11-09.

tornado is in the lock for jaeger-client. Nothing under `synapse/` or
`blackout_runtime/` imports it. jaeger-client 4.8.0 imports `tornado.gen`,
`ioloop`, `queues`, `concurrent`, `httpclient` and `httputil`, and never
`tornado.web`, so the handler is not reachable. Measured in the venv with the
new versions: importing `synapse.app.homeserver` loads eleven `tornado`
submodules and not `tornado.web`.

jaeger-client, and tornado with it, is loaded at startup wherever it is
installed, the image included, whether or not tracing is configured:
`synapse/logging/opentracing.py:252` imports it at module level, inside a
`try`. No homeserver template in the repository has an `opentracing` section,
so the tracer itself is never started as shipped.

`pyproject.toml`: `tornado = "^6.6.1"`, from `>=6.5.9`. The caret keeps it
below 7, which has not been released or checked.

### sentry-sdk 1.35.0 → 1.45.1

GHSA-g92j-qhmh-64v2 (Low): with the SDK's stdlib integration on, which is the
default, a child process started with `env={}` received the parent's whole
environment. Fixed in 1.45.1 for the 1.x line (PyPI, 2024-07-26) and in
2.8.0.

Synapse reads a `sentry` section in `synapse/config/metrics.py:59` and calls
`setup_sentry` (`synapse/app/_base.py:657`, called at line 597) only when it
is present; `sentry_sdk` is imported inside that function and nowhere else.
No homeserver template in the repository has a `sentry` section. The only
code under `synapse/` or `blackout_runtime/` that starts a subprocess is
`synapse/_scripts/synctl.py`, a command-line tool that does not set Sentry
up. So the advisory is not reachable as shipped; it is fixed because the bump
is cheap.

1.45.1 is the last 1.x release, and the constraint is `^1.45.1`, capped below
2 on purpose. `setup_sentry` sets its three tags inside
`sentry_sdk.configure_scope()` (line 672), which 2.x deprecates
("will be removed in the next major version", read in 2.57.0's `api.py`).
Upstream's file calls `sentry_sdk.Scope.get_global_scope()` and its lock is on
2.57.0. Moving to 2.x means porting that change first; that is a behaviour
change for another day, not an advisory fix.

Measured, with the same script under both versions:

-   `MetricsConfig` accepts a `sentry` section and `setup_sentry` runs; an
    event captured afterwards carries `matrix_server_name`, `worker_app` and
    `worker_name` under 1.35.0 and under 1.45.1.
-   `subprocess.check_output(["/usr/bin/env"], env={})` after
    `sentry_sdk.init`: under 1.35.0 the child prints the parent's environment
    (9,631 bytes, a canary variable among them); under 1.45.1 it prints two
    variables, `SUBPROCESS_SENTRY_TRACE` and `SUBPROCESS_BAGGAGE`, which the
    SDK adds itself.

### pygments 2.15.1 → 2.20.0

GHSA-5239-wwwm-4pmq (Low): a slow regular expression in one lexer, local
access only. Dev only: twine's rich and readme-renderer, sphinx and furo
depend on it. 2.20.0 is the first fixed release (PyPI, 2026-03-29) and the one
upstream's lock carries; the two lock entries are identical.

pygments has no line in `pyproject.toml`. The lock was moved by adding
`pygments = "2.20.0"` to the dev dependencies, locking, removing the line and
locking again, which keeps the version because it still satisfies every
requirement. `poetry lock --check` passes against the committed
`pyproject.toml`.

### soupsieve 2.10: not bumped

Three advisories, all published on 2026-11-13: GHSA-6655-6qjp-jx7x (High,
exponential backtracking while compiling a selector), GHSA-7g44-g9rc-x53w
(Moderate, unbounded recursion on nested pseudo-classes), both fixed in 3.0.2,
and GHSA-mmhr-3c5m-f64f (High, polynomial time matching a descendant
combinator against a deeply nested document), fixed in 4.0.

**No fixed release can be locked.** Every release from 3.0.2 on (3.0.2, 3.0.3,
3.0.4, 4.0, 4.0.1, 4.1, 4.1.1) declares `requires_python >=3.11.5`; 3.0 and
3.0.1 are yanked. The fork's floor is `python = "^3.11"`, which includes 3.11.0
to 3.11.4, and poetry refuses:

```
The current project's Python requirement (>=3.11,<4.0) is not compatible with
some of the required packages Python requirement:
  - soupsieve requires Python >=3.11.5, so it will not be satisfied for
    Python >=3.11,<3.11.5
```

Two ways round it were tried or weighed, and neither is taken here:

-   **A split entry** (`^4.0` for Python 3.11.5 and later, the old line below
    that) locks, but the lock then holds soupsieve 4.1.1 and 2.10 side by
    side. The scanners read lock entries, not markers, so they would report
    2.10 as before, and the lock would diverge from upstream's for nothing.
-   **Raising the floor to 3.11.5** would lock 4.x. The image is built on
    `python:3.11-slim-bookworm` (`docker/Dockerfile`, line 23 and the three
    `FROM` lines), a tag that follows the newest 3.11 release; it was not
    pulled here. But `scripts-dev/build_debian_packages.py` still lists
    `debian:bookworm`, whose own Python is 3.11.2, and the floor is also
    written in `synapse/__init__.py` (line 37), which checks only the minor
    version. That is a decision about the fork's supported Pythons, not a
    dependency bump, and it is the operator's
    ([What is left](#what-is-left)).

**Why leaving it is defensible.** soupsieve is installed only with
`poetry install --with dev-docs`: the group is optional, the image's export
does not include it, and Trivy's poetry analyzer leaves it out unless asked
for dev dependencies. Its one dependant in the lock is beautifulsoup4, whose
one dependant is furo, the Sphinx theme of `dev-docs/`. furo 2023.9.10 uses
BeautifulSoup in one file, `furo/navigation.py`, and calls `find_all()` and
`find()` there (lines 33, 40 and 61), never `select()`: soupsieve is imported
and no selector is ever compiled or matched. The input is the table of
contents Sphinx renders from the repository's own pages. Nothing under
`synapse/` or `blackout_runtime/` imports bs4 or soupsieve; the fork's
`url-preview` extra is lxml alone.

Upstream differs, and a reconciliation should look at this again: at
`e5ac865` upstream also locks soupsieve 2.10, and there it is a runtime
package of the `url-preview` extra. Upstream's floor is 3.11.0 too.

The reason is written over the `soupsieve` line in `pyproject.toml`.

### black 23.10.1: not bumped, as before

Four advisories, unchanged since
`synapse-dependencies-triage-2026-10-25.md` ("Black: dev-only, not bumped"),
which gives each one's subject: two are about black's GitHub Action, one needs
control of black's command line, one is a ReDoS on untrusted input. That
triage holds. Checked again on this tree:

-   No workflow in the repository uses black's action: outside
    `docs/security`, no tracked file contains `psf/black`. The fork's
    never-run workflows call `poetry run black`.
-   The formatting cost is the same size: black 26.10.1, the release that
    clears all four, would reformat 212 of the 966 files `black .` checks in
    the fork; the locked 23.10.1 would reformat 27. The 2026-10-25 figures
    were 207 of 944 and 26.
-   Upstream replaced black with `ruff format`, so the formatter is still
    better settled by a reconciliation than by a bump.

## The perturbation sidecar

`requirements.txt` pinned `fastapi==0.115.6` and did not name Starlette.
FastAPI 0.115.6 requires `starlette>=0.40.0,<0.42.0`, so pip installs 0.41.3.
Seven advisories apply to it, three of them High.

| Advisory            | What it needs                                               | In `app.py`?               |
| ------------------- | ----------------------------------------------------------- | -------------------------- |
| GHSA-7f5h-v6xp-fcq8 | a `FileResponse` answering a `Range` request                | no file or static response |
| GHSA-wqp7-x3pw-xc5r | `StaticFiles` on Windows                                    | no; the image is Linux     |
| GHSA-82w8-qh3p-5jfq | `request.form()` on a urlencoded body                       | no form                    |
| GHSA-86qp-5c8j-p5mr | code that trusts `request.url.path` for a security decision | `request.url` is not read  |
| GHSA-jp82-jpqv-5vv3 | code that reads `request.url.hostname`                      | same                       |
| GHSA-2c2j-9gv5-cj73 | a multipart upload                                          | no form                    |
| GHSA-x746-7m8f-x49c | an `HTTPEndpoint` class                                     | two function routes        |

`app.py` has two routes, `GET /health` (line 71) and `POST /perturb` (line
76), which takes a JSON body through a pydantic model. It imports only
`FastAPI` and `HTTPException` from the framework. None of the seven is
reached. The service has no authentication of its own; the compose file
exposes its port to the `app` network and publishes none.

**What was done.** `fastapi==0.162.0` and `starlette==1.10.0`, the pair
`apps/blackout-server/services/blackout-api` has pinned since 2026-10-26.
FastAPI 0.162.0 (PyPI, 2026-10-23) requires `starlette>=0.46.0` and
`pydantic>=2.9.0`; the file's pydantic 2.10.4 satisfies it. Starlette 1.10.0
(PyPI, 2026-10-24) is past all seven and requires Python 3.11, which the image
has. Starlette is named in the file so that the scanners and pip see the same
version: FastAPI's own range has no upper bound. FastAPI 0.163.0 was published
on 2026-11-14, hours before this change, and was not taken. uvicorn, pillow,
numpy and pydantic keep their pins; OSV lists nothing against them or against
the 17 packages osv-scanner resolves behind the new file.

**Checked.** Two Python 3.11 venvs, one from the old file and one from the
new (`pip check` clean in both; the old one does contain starlette 0.41.3).
The service was started in each as the Dockerfile starts it
(`uvicorn app:app`), and thirteen requests were sent to both: `/health`; a
PNG, a JPEG and a WebP through `/perturb`; the 415, 400, 422 and 413 refusals;
a body with a missing field; malformed JSON; `GET /perturb`; an unknown path;
`/openapi.json`. Status codes and bodies are identical, and so are the bytes
of the three perturbed images.

One difference was found outside those thirteen. A `POST /perturb` with no
`Content-Type` header was parsed as JSON under FastAPI 0.115.6 and is a 422
under 0.162.0. The only caller,
`packages/api/src/integrations/perturbation-client.ts`, sends
`Content-Type: application/json` (line 35).

## The desktop lock

### What moved

Each step was `cargo update -p <crate> --precise <version>` for one crate.
"Published" is the crates.io date of the version taken.

| Step                                   | Published  | Clears                                                                 | Also moved in the lock                             |
| -------------------------------------- | ---------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| anyhow 1.0.102 → 1.0.103               | 2026-06-25 | RUSTSEC-2026-0190                                                      |                                                    |
| event-listener 5.4.1 → 5.4.2           | 2026-07-27 | RUSTSEC-2026-0221                                                      |                                                    |
| rand 0.9.2 → 0.9.3                     | 2026-04-11 | GHSA-cq8v-f236-94qc                                                    |                                                    |
| rustix 1.1.4 → 1.1.6                   | 2026-10-27 | RUSTSEC-2026-0486                                                      |                                                    |
| rustls-webpki 0.103.13 → 0.103.16      | 2026-10-20 | RUSTSEC-2026-0382                                                      |                                                    |
| rustls 0.23.37 → 0.23.46               | 2026-10-14 | GHSA-2mjx-qc3c-rqvc, -c8m5-c952-6cm4, -h2v8-394m-p7vv, -w44r-93j7-qv28 |                                                    |
| serde_with 3.18.0 → 3.21.0             | 2026-06-04 | GHSA-7gcf-g7xr-8hxj                                                    | serde_with_macros; adds bs58 0.5.1, tinyvec 1.13.3 |
| tar 0.4.45 → 0.4.46                    | 2026-05-18 | GHSA-3pv8-6f4r-ffg2                                                    |                                                    |
| tokio 1.50.0 → 1.51.6                  | 2026-10-13 | RUSTSEC-2026-0386                                                      | mio 1.1.1 → 1.2.4 (below)                          |
| webpki-root-certs 1.0.6 → 1.0.10       | 2026-10-19 | RUSTSEC-2026-0383                                                      |                                                    |
| plist 1.8.0 → 1.10.0                   | 2026-07-04 | RUSTSEC-2026-0194, -0195 (quick-xml 0.38.4)                            | quick-xml 0.38.4 → 0.41.0                          |
| tauri-winrt-notification 0.7.2 → 0.7.3 | 2026-07-02 | RUSTSEC-2026-0194, -0195 (quick-xml 0.37.5)                            | quick-xml 0.37.5 leaves the lock                   |
| hyper 1.8.1 → 1.9.0                    | 2026-03-31 | RUSTSEC-2026-0441 (pin-utils)                                          | pin-utils leaves the lock                          |

555 packages before and after: quick-xml 0.37.5 and pin-utils leave, bs58 and
tinyvec arrive. The highest `rust-version` any package declares is 1.90
before and after (tauri's own crates), and the build uses stable.

-   **The smallest fixed release each time.** rustls takes 0.23.46 because
    three of its four advisories are fixed only there. tokio takes 1.51.6,
    the fixed release of the older of its two patched lines. Newer releases
    exist for most of these crates and were not taken.
-   **quick-xml has no fixed 0.37 or 0.38 release**, so its two parents
    moved. plist 1.10.0 is the first plist that requires quick-xml 0.41
    (1.9.0 still requires 0.39); tauri-utils accepts any plist 1.
    tauri-winrt-notification 0.7.3 is the first without quick-xml, and
    notify-rust 4.12.0 accepts any 0.7. Its diff against 0.7.2 was read:
    the only change is that nine `quick_xml::escape::escape` calls now call
    a private `xml_escape::escape`, a copy of quick-xml's function that
    escapes the same five characters (`<`, `>`, `&`, `'`, `"`). That is the
    code that puts a notification's title and body into a Windows toast's
    XML. The lock now holds one quick-xml, 0.41.0, where it held two.
-   **pin-utils has no fixed release**: the notice is that its repository
    was archived. Only hyper 1.8.1 depended on it, and hyper 1.9.0, the next
    release, does not. hyper is in the tree only for the updater's reqwest.
-   **serde_with 3.21.0 adds two lock entries**, bs58 0.5.1 and tinyvec
    1.13.3, behind an optional feature. `cargo tree -i bs58 --target all`
    prints nothing: no target compiles them. OSV lists nothing against
    either.
-   **webpki-root-certs is compiled for no desktop target** (it is in the
    lock for rustls-platform-verifier on wasm32, as the 2026-10-30 record
    found). It is bumped so that the lock does not carry a root list with a
    distrusted root in it.

### mio: 1.2.4, not 1.2.5

tokio 1.51.6 requires `mio ^1.2.0`, where 1.50.0 accepted 1.0.1, and cargo
resolved it to the newest release, 1.2.5. That release was published on
2026-11-13 at 17:07 UTC, about 31 hours before this change, and its changelog
includes a rewrite of mio's Windows named-pipe code. Nothing here can run a
Windows build. `dd3bd88a30` takes 1.2.4 instead (2026-10-03), which satisfies
tokio equally and includes a fix for a named-pipe use-after-free. OSV lists
nothing against either.

### The windows-sys edges were put back by hand

Ten crates that did not move (dirs-sys, errno, muda,
rustls-platform-verifier, socket2, tempfile, tray-icon, uds_windows,
winapi-util, window-vibrancy) and rustix accept several windows-sys lines at
once (`>=0.52, <0.62` and similar), and the lock holds five windows-sys
versions. Each `cargo update` that had to re-resolve re-pointed some of them
from 0.61.2 to 0.52.0, 0.59.0 or 0.60.2, differently from step to step. All
of those are valid, but it rewires what ten untouched crates compile against
on Windows, in a change that cannot build for Windows here.

The eleven edges were set back to `windows-sys 0.61.2`, as `develop` has
them. After that, no package whose version did not change has a changed
entry, and the last commit differs from the one before it in mio's version
and checksum alone. `cargo metadata --locked` accepts the lock, and a plain
`cargo metadata` leaves it byte for byte as it is, which is what the build
check's "the build changed Cargo.lock" step tests after a build. Whoever next
runs `cargo update` on this lock will see the same reshuffling; it is a
property of the dependency ranges, not of this change.

### What the bumped advisories could reach

This is short because all of it is fixed. The 2026-10-30 record has the
paths in full.

-   **The updater's HTTP and TLS stack** (rustls, rustls-webpki, hyper, and
    tar on Linux and macOS): `tauri_plugin_updater` is registered
    (`src/main.rs:66`) and the main window is granted `updater:default`
    (`capabilities/default.json:11`), but nothing calls it: `main.rs` only
    registers the plugin, and no tracked file outside `Cargo.toml` names
    `plugin-updater` or `plugin:updater`. A package it fetched would still
    have to pass the minisign check.
-   **tokio's `AsyncFd`**: no crate in the Linux or macOS tree other than
    tokio itself names it.
-   **serde_with's `KeyValueMap`**: no crate in any of the three trees other
    than serde_with names it.
-   **rand**: unsound only when a custom `log` logger calls `rand::rng()`;
    `src/main.rs` installs no logger.
-   **quick-xml**: as the 2026-10-30 record found, neither advisory's code
    path ran (the Windows crate only escaped text, and plist never asks for
    a tag's attributes); not traced again here.
-   **anyhow, event-listener and rustix**: not traced. They are fixed.

### What remains in the desktop lock

**glib 0.18.5, GHSA-wrw7-89jp-8q8g (Moderate; RUSTSEC-2024-0429,
unsound).** The iterator impls of `glib::VariantStrIter` pass a pointer to C
through an immutable reference; built with a recent compiler and
optimizations, iterating dereferences NULL and crashes. Fixed in 0.20.0.

-   glib is built for Linux only, for the GTK 3 stack tauri uses there. Its
    twelve dependants in the lock are that stack: atk, cairo-rs, gdk,
    gdk-pixbuf, gdkx11, gio, gtk, javascriptcore-rs, libappindicator, pango,
    soup3 and webkit2gtk.
-   0.20 is not a compatible release, and gtk 0.18.2 requires `glib ^0.18`.
    Everything above it requires `gtk ^0.18`: tauri 2.12.5, tao 0.37.2, wry
    0.57.2, muda 0.21.2 and webkit2gtk 2.0.2, the newest of each, and tauri
    3.0.0-alpha.6 as well. gtk 0.19.0 (2026-09-08) is the release that moves
    to glib 0.22. What would lift this is a tauri, tao, wry and webkit2gtk
    release built on gtk 0.19; none exists.
-   **The affected type is not used.** A `VariantStrIter` comes only from
    `Variant::array_iter_str()` (`glib-0.18.5/src/variant.rs:843`). The
    sources of all 384 dependencies of the Linux build were searched for
    either name: only glib's own files contain them, and outside the
    definitions only its tests call the method. The 2026-10-30 record left
    this question open ("whether a dependency iterates a `VariantStrIter`
    was not checked"); it is answered now.

**proc-macro-error 1.0.4, RUSTSEC-2024-0370 (unmaintained, no fixed
version).** A helper for writing procedural macros. glib-macros 0.18.5 and
gtk3-macros 0.18.2 depend on it, so it is compiled for the build machine when
the Linux app is built and its code runs inside rustc; it is not linked into
the app. The notice is about maintenance (no release since 2020), not a flaw.
gtk3-macros 0.19.0 and glib-macros 0.22 no longer depend on it, so the same
GTK move that lifts glib removes it.

**zbus_names 4.3.1, zvariant 5.10.0 and zvariant_derive 5.10.0,
RUSTSEC-2026-0371, -0370 and -0372 (unmaintained, no fixed version).** The
notices, published on 2026-10-16, say the three crates were merged into zbus
6.0.0 and are no longer released on their own. They report no flaw, and every
version is "affected", so moving to their last releases (4.3.5 and 5.15.1,
published the same day) would change nothing a scanner reports.

-   They are built for Linux only, as zbus 5.14.0's D-Bus types
    (zvariant_derive is a derive macro, so it runs in the compiler). zbus
    is there for three plugins the app registers: notifications
    (notify-rust 4.12.0, `src/main.rs:61`), single-instance (line 67) and
    opener (line 76).
-   Only zbus 6 drops them. notify-rust has required zbus 6 since 4.19.0,
    but the newest tauri-plugin-opener (2.7.3, 2026-11-10) and
    tauri-plugin-single-instance (2.5.5), and their 3.0.0-alpha.3
    pre-releases, all still require `zbus ^5.9`. Until those two plugins
    move, zbus 5 and its three crates stay in the tree; moving notify-rust
    alone would add a second zbus. Moving plugins also means moving the
    npm packages they are paired with, which this change does not touch.

## Scans

osv-scanner counts are advisory groups (aliases merged), with the number of
packages after them.

| Scan                                                       | `develop` (`7a9814ebc9`)     | `dd3bd88a30`             |
| ---------------------------------------------------------- | ---------------------------- | ------------------------ |
| osv-scanner, fork `poetry.lock` (151 packages)             | 10 in 5                      | 7 in 2                   |
| osv-scanner, fork `Cargo.lock` (40)                        | 0                            | 0                        |
| osv-scanner, desktop `Cargo.lock` (555)                    | 23 in 18                     | 5 in 5                   |
| osv-scanner, perturbation `requirements.txt`               | 7 in 1                       | 0                        |
| osv-scanner, legacy API `requirements.txt` (8)             | 0                            | 0                        |
| osv-scanner `-r` with the root config, all six lockfiles   | 47 (7 of them `pnpm-lock`'s) | 19 (the same 7)          |
| Trivy as `security.yml` runs it                            | none, exit 0                 | none, exit 0             |
| Trivy, every severity, unfixed included, empty ignore file | 17 (7 of them `pnpm-lock`'s) | 8 (the same 7, and glib) |
| the same with `--include-dev-deps`                         | 23 (the same 7)              | 13 (the same 7)          |

-   The recursive run filters one advisory both times, deepmerge's, in
    `pnpm-lock.yaml`.
-   Of the 40 groups this record covers, Trivy's widest run showed 16 on
    `develop`: 8 in the desktop lock (glib, rand, serde_with, tar and
    rustls's four), sentry-sdk, tornado, pygments, soupsieve's three and two
    of black's four. It showed none of the 14 desktop groups that have no
    GHSA record, nor rustix's (which has a GHSA alias its database does not
    carry), black's other two or starlette's seven. After, it shows 6: glib,
    black's two and soupsieve's three.
-   The gate's `ignore-unfixed` and severity filter are why it stays silent
    on what remains: glib is Moderate, and black and soupsieve are dev
    dependencies, which Trivy's poetry analyzer skips.

## Checks

| Check                              | Command                                                                                                                  | Result                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| desktop lock is consistent         | `cargo metadata --locked`; `cargo tree --locked` for the three targets                                                   | exit 0; plain `cargo metadata` leaves the lock unchanged                                                     |
| no vulnerable copy remains         | the crate lists of the three targets, before and after                                                                   | they differ only by the crates in the table above: Linux 386 → 385, macOS 309 → 308, Windows 315 → 313       |
| desktop type-checks on Linux       | `cargo check --locked -j 3`, real GTK 3 and WebKitGTK 4.1 headers, icons from `tauri icon`, a placeholder `frontendDist` | 385 crates, no warning, exit 0, lock unchanged; run three times, the last on the committed lock (1 min 42 s) |
| fork lock matches `pyproject.toml` | `poetry lock --check` (poetry 1.3.2)                                                                                     | consistent                                                                                                   |
| fork lock checks                   | `.ci/scripts/check_lockfile.py`; `scripts-dev/check_locked_deps_have_sdists.py`                                          | pass; 151 packages                                                                                           |
| the image's install set            | `poetry export --extras all --without-hashes`, before and after                                                          | 79 requirements both times; two differ, sentry-sdk and tornado                                               |
| fork tests                         | `python -m twisted.trial -j2 tests.logging tests.config tests.app`, old and new venv                                     | 133 pass, none skipped, both times (`tests.logging` includes the jaeger tracer tests)                        |
| Sentry path                        | the script described under sentry-sdk, old and new venv                                                                  | tags set both times; `env={}` leaks under 1.35.0 and not under 1.45.1                                        |
| homeserver boot                    | a generated config with `sentry` and `opentracing` sections added, old and new venv                                      | both serve `/_matrix/client/versions`, log the jaeger tracer starting, and exit 0 on SIGTERM                 |
| sidecar                            | thirteen requests against the old and the new venv                                                                       | identical statuses, bodies and image bytes                                                                   |
| black, to decide                   | `black --check .` in the fork with 23.10.1 and 26.10.1                                                                   | 27 and 212 of 966 files would be reformatted                                                                 |
| formatting                         | the repository's prettier 2.8.1, `--check`, on the changed Markdown                                                      | pass                                                                                                         |
| guards                             | `node tools/ci/check-duplicate-paths.mjs`; `node tools/ci/check-auth-secrets.mjs` before each commit                     | pass                                                                                                         |
| secrets                            | gitleaks 8.21.2 over `origin/develop..HEAD`                                                                              | no leaks                                                                                                     |

No Python file changed, so the fork's ruff, black and isort had nothing to
check.

## Found outside scope (not fixed here)

1.  **No gate runs osv-scanner on these five lockfiles.** That is how
    starlette 0.41.3 sat in a built and running service with three High
    advisories: Trivy cannot see a package a `requirements.txt` does not
    name, and the two OSV steps read `pnpm-lock.yaml` only. An OSV step over
    the other lockfiles would have caught it, and would catch the next
    RustSec-only advisory in the desktop lock. It is not added here because
    it would start red on the 12 advisories that remain, and making it green
    means an ignore entry for each of them, with a reason and an expiry.
    That is a decision about the gates, and it is the operator's.
2.  **`services/perturbation/requirements.txt` pins five direct packages and
    lets pip choose the rest** (17 more today, by osv-scanner's resolution).
    Naming Starlette closes the one that mattered. A full pinned export
    (`pip freeze` or `pip-compile`) would make the image reproducible and put
    every package in front of Trivy.
3.  **The fork's `black --check .` is not clean under its own locked black**
    (27 files). Nothing runs it, since the fork's workflows never run; noted
    because the 2026-10-25 figure, 26, has grown by one.

## What is left

For the operator:

-   **soupsieve.** Either raise the fork's Python floor to 3.11.5, which
    drops Debian bookworm's Python 3.11.2 as a packaging target, or leave it
    until upstream settles the same question (it has the same lock entry, on
    a runtime path).
-   **An OSV gate over the non-pnpm lockfiles** (item 1 above).
-   **sentry-sdk 2.x**, by porting upstream's `get_global_scope()` change, if
    Sentry is ever turned on for the homeserver. Not needed for any advisory
    today.

Waiting on upstream releases, nothing to do here: glib and proc-macro-error
(a tauri stack on gtk 0.19), and zbus_names, zvariant and zvariant_derive
(tauri-plugin-opener and tauri-plugin-single-instance on zbus 6). black waits
for a reconciliation with upstream's formatter.

## Corrections

Three statements in this change's own commits are wrong or loose, and the
commits are not rewritten:

-   **`PATCHES.md`, as `77b21a72b1` wrote it, said neither tornado nor
    sentry-sdk is imported in a deployment as shipped.** True of sentry-sdk.
    tornado is loaded at startup wherever jaeger-client is installed, the
    image included ([tornado](#tornado-66--661)); what is never loaded is
    `tornado.web`. The entry is corrected in the commit that adds this
    record.
-   **`8da7864591`'s message says "no crate in the Linux tree names
    VariantStrIter".** glib itself does; no other crate does.
-   **`dd3bd88a30`'s title calls mio 1.2.5 "day-old".** It was published
    about 31 hours before that commit.

## Not verified

-   **A desktop build for macOS or Windows, and any bundle.** Only
    `cargo check` on Linux ran here; nothing was linked or started.
    tauri-winrt-notification 0.7.3 and the windows-sys edges are compiled on
    Windows only, and tauri's own use of plist is macOS-only code (the
    2026-10-30 record). The desktop build check on the pull request builds
    all three.
-   **A run of the desktop app**, on any platform, and the updater against a
    real release.
-   **A Docker build** of the Synapse image or the sidecar image: there is no
    Docker daemon here. The Synapse image's install set was compared through
    `poetry export`; the sidecar ran from a venv, not from its image.
-   **The fork's full trial suite.** Three packages of it ran (133 tests),
    with a boot check. sentry-sdk is imported only behind configuration no
    template sets, and tornado only by jaeger-client.
-   **The CI run of the Trivy check** was not read from here. The gate's
    result above is a local run with Trivy 0.69.3 and the workflow's flags.
-   **GitHub's advisory pages.** The advisory text is OSV's copy.
