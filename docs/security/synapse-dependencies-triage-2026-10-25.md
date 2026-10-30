# Synapse fork dependency triage — 2026-10-25

Scope: the dependency locks of the Synapse fork, `apps/blackout-server`
(`pyproject.toml`, `poetry.lock`, `Cargo.lock`); the upstream Synapse image that
the compose stack in `deploy/docker/blackout-backend` pins; and whether the
Trivy gate looks at the fork at all. This follows
`synapse-dependencies-triage-2026-10-24.md`. That record left 16 packages with
High or Critical advisories as open items, 12 of them in the image, and noted
that no CI gate looks at the fork's dependencies. Advisories against Synapse's
own code are a separate record,
`synapse-upstream-advisories-triage-2026-10-25.md` (PR #977), and are not
repeated here.

**Result:**

-   **The fork's Python floor is now 3.11, and the lock was regenerated with
    as little churn as possible.** 27 packages change version and three drop
    out. The dev tools stay where they were.
-   **High/Critical advisories, as osv-scanner reports them:**

    |                                  | before                                 | after                                        |
    | -------------------------------- | -------------------------------------- | -------------------------------------------- |
    | Whole `poetry.lock`              | 17 packages, 195 advisory groups (all) | 2 packages (black, Twisted), 12 groups (all) |
    | What the image installs (py3.11) | 12 packages, 88 groups (all)           | 1 package (Twisted, 3 High), 7 groups (all)  |
    | `Cargo.lock`                     | pyo3 (1 High), anyhow (1 RUSTSEC)      | none                                         |

-   **Two packages keep High advisories, both explained below.** Twisted's
    three Highs are fixed only in the 26.10.0rc1 pre-release and sit in modules
    Synapse never loads. Black's are in a dev-only formatter; bumping it would
    reformat 207 fork files.
-   **The relock broke two things at runtime, and the test suite caught both.**

    1. service-identity 23.1.0 calls an API that pyOpenSSL 26 removed. Every
       hostname-verified outbound TLS connection would have failed.
    2. `synapse/http/proxy.py` called a private Twisted method that Twisted
       26 removed.

    Both are fixed. authlib is capped below 1.7, because 1.7 rejects OIDC
    providers that send an integer `sub`.

-   **The Trivy gate now scans the fork.** Only the legacy FastAPI service
    under it stays skipped. The gate passes with three documented
    `.trivyignore` entries.
-   **The compose stack moves from Synapse v1.130.0 to v1.163.2.** That cuts
    fixable High/Critical image findings from 231 to 34. v1.163.2 refuses the
    old `experimental_features.msc3861` block, so the template now uses the
    stable `matrix_authentication_service` block. Synapse 1.163.2's config
    loader accepts the new template in both auth modes.
-   **Found outside scope, not fixed:**
    1. The compose stack's Synapse service cannot start as written, before or
       after this change.
    2. Its synapse-admin image tag does not exist.

Commits, on top of `3c19d0e`: `abcc492` (`.prettierignore`), `e4860d6`
(pyo3), `0f80ea0` (bcrypt), `850081b` (floor and lock), `8ab032a` (runtime
fixes), `0e060ec` (test harness), `42a1257` (compose), `eca7b42` (Trivy
gate), then this record with the `PATCHES.md` entry.

---

## Method

-   **Lock:** poetry 1.3.2, the version `docker/Dockerfile` installs, in an
    isolated Python 3.11 venv.
    -   `poetry lock --no-update` from the previous lock.
    -   Then `poetry update --lock` for the six packages with only Moderate
        advisories that move within their current major version: bleach,
        idna, jinja2, pynacl, requests and zipp.
    -   A first attempt used a full `poetry lock`, which moved about 120
        packages, mypy and black included. It was discarded: mypy 2.4.0
        crashes on this tree, and black 26 reformats 207 of its 944 files.
-   **Scanners:**
    -   osv-scanner 2.7.0, the GitHub release binary, checked against
        `osv-scanner_SHA256SUMS`.
    -   Trivy 0.76.1, checked against the release checksums. Its
        vulnerability DB was published 2026-10-25 07:10 UTC, the newest
        available when the scans ran.
    -   The OSV API (`/v1/query`, `/v1/vulns/<id>`) for single records,
        queried 2026-10-25 and 2026-10-26.
-   **What the image installs:** the Dockerfile's own
    `poetry export --extras all`, with environment markers evaluated under
    Python 3.11 (the image's `PYTHON_VERSION`). The result was scanned with
    `osv-scanner --no-resolve`, as on 2026-10-24.
-   **Severity:** GitHub's, where the advisory group has a GHSA; otherwise the
    CVSS band, marked "(CVSS)".
-   **Tests:** the full trial suite (`python -m twisted.trial -j4 tests`) was
    run twice:

    -   before: on the unchanged tree with the old lock (Python 3.11.17,
        Twisted 23.10.0);
    -   after: on the committed tree with the new lock, installed with
        `pip install --no-deps -r` from the same export.

    Each test's outcome was compared one by one. The Rust crate was built
    and tested with cargo 1.97.

-   **Upstream:** `raw.githubusercontent.com` for element-hq/synapse develop
    (`poetry.lock`, the files whose fixes were ported, `docs/upgrade.md`) and
    tag v1.163.2. matrix-synapse 1.163.2 from PyPI, for loading configs.

## The Python floor

`python = "^3.11"` (was `^3.8.0`). The image already runs 3.11. Most of the
fixed releases cannot install on 3.8, per PyPI:

| Requires    | Releases                                                              |
| ----------- | --------------------------------------------------------------------- |
| Python 3.11 | Pillow 13.0.0 (the 2026-10-24 fix), tornado 6.6                       |
| Python 3.10 | urllib3 2.8.0, setuptools 84.2.1, msgpack 1.2.3                       |
| Python 3.9  | pyOpenSSL 26.4.0, cryptography 50.0.2, Twisted 26.4.0, authlib 1.6.12 |

Changed with it:

-   `tox.ini`, `mypy.ini`, and the black and cibuildwheel targets;
-   the version check in `synapse/__init__.py`;
-   the build-arg example in `docker/Dockerfile`;
-   `docs/setup/installation.md`;
-   the Debian/Ubuntu targets in `scripts-dev/build_debian_packages.py`
    (bullseye, focal and jammy ship Python below 3.11);
-   the fork's own workflows. GitHub never runs those; only the repository
    root's workflows run.

## The lock

27 version changes. Three entries drop out: `importlib-resources`,
`pkgutil-resolve-name` and `twisted-iocpsupport`.

| Package                                      | Before             | After               | Why                                                                                     |
| -------------------------------------------- | ------------------ | ------------------- | --------------------------------------------------------------------------------------- |
| Twisted                                      | 23.10.0            | 26.4.0              | GHSA-grgv-6hw6-v9g4 (High, `twisted.names`, which Synapse loads for SRV lookups)        |
| cryptography                                 | 41.0.7             | 50.0.2              | five High; the last, CVE-2026-69249, is fixed in 49.0.0                                 |
| pyOpenSSL                                    | 25.1.0             | 26.4.0              | GHSA-5pwr-322w-8jr4 (High)                                                              |
| service-identity                             | 23.1.0             | 24.2.0              | needed for pyOpenSSL 26 (below)                                                         |
| authlib                                      | 1.2.1              | 1.6.12              | six High/Critical (GHSA-wvwj-cvrp-7pv5 Critical); 1.6.12 also clears all five Moderates |
| certifi                                      | 2023.7.22          | 2026.10.23          | GHSA-6q48-6c7w-9gw2 (Critical, compromised emSign intermediates)                        |
| urllib3                                      | 2.0.7              | 2.8.0               | six High                                                                                |
| setuptools                                   | 67.6.0             | 84.2.1              | two High; 84 has no `pkg_resources` (below)                                             |
| lxml                                         | 4.9.3              | 6.1.3               | GHSA-vfmq-68hx-4jfw (High)                                                              |
| msgpack                                      | 1.0.7              | 1.2.3               | GHSA-6v7p-g79w-8964 (High)                                                              |
| pyasn1                                       | 0.5.1              | 0.6.4               | four High                                                                               |
| thrift, tornado                              | 0.16.0, 6.2        | 0.25.0, 6.6         | two and ten High (jaeger-client's; now in the `opentracing` extra)                      |
| Pillow                                       | 10.1.0 + 13.0.0    | 13.0.0              | the 10.1.0 entry existed only for Python < 3.11                                         |
| GitPython, pyjwt, soupsieve (dev)            | 3.1.40, 2.6.0, 2.4 | 3.2.1, 2.15.1, 2.10 | 26, 7 and 2 High/Critical                                                               |
| bleach, idna, jinja2, pynacl, requests, zipp |                    | patch/minor         | Moderate advisories                                                                     |
| automat, incremental, cffi, pyasn1-modules   |                    | minor/major         | required by the packages above                                                          |

Each floor in `pyproject.toml` is the first release that clears that package's
High/Critical advisories, with the advisory named in a comment. Two bounds are
deliberate:

-   **authlib `<1.7`.** From 1.7.0, authlib validates id_token claims with
    joserfc. joserfc rejects a `sub` that is not a string:
    `Claim 'sub' must be a StringOrURI value`. The fork's `oidc.py` accepts
    providers that send an integer `sub`, and
    `test_oidc.test_map_userinfo_to_user` covers that case. Under authlib
    1.9.1 that test fails, and such a provider's users can no longer log in.
    Upstream's lock is on 1.6.12 too. 1.6.12 (2026-05-04) came after 1.7.0,
    but no 1.6.x release has followed 1.8 or 1.9. A future fix shipped only
    in 1.7+ would mean dealing with the integer `sub`. That decision belongs
    to `oidc.py` and `test_oidc.py`, which PR #977 changes, so it is not
    taken here.
-   **Pympler `<1.1`.** 1.1 pulls in `pywin32`, which ships no sdist, and
    `scripts-dev/check_locked_deps_have_sdists.py` fails on it. Upstream's lock
    is also on 1.0.1.

## What the new versions broke, and the fixes

The relock alone made 160 tests fail that pass on the old lock. Grouped by
cause:

-   **service-identity vs pyOpenSSL 26 (production).** service-identity 23.1.0
    reads certificate extensions with `X509.get_extension`, which pyOpenSSL 26
    removed. Twisted verifies TLS hostnames through service-identity. So every
    hostname-verified outbound connection would have failed with
    AttributeError: federation, push, OIDC and URL previews. 24.2.0
    reimplements the extraction with cryptography (pyca/service-identity#70),
    and upstream's lock is on it. Fixed in `8ab032a`.
-   **`synapse/http/proxy.py` (production).** It called Twisted's private
    `Headers._canonicalNameCaps()`, which 26.4.0 no longer has. Every proxied
    federation response that carried a `Connection` header raised.
    `getAllRawHeaders()` still returns canonical names in 26.4.0, which was
    checked, so the hop-by-hop filtering itself was not affected. Ported
    upstream's lowercased comparison.
-   **setuptools 84 has no `pkg_resources` (production).**
    `synapse.config._base` failed at import. `config/_base.py`,
    `config/oembed.py` and four test modules now use `importlib.resources`,
    and `handlers/send_email.py` drops `parse_version` together with the
    pre-Twisted-21.2 branch it selected. All of this matches upstream.
-   **The test harness and Twisted 26 (tests only), ported from upstream:**
    -   `FakeChannel` now gets a `Headers` object rather than a list of
        tuples.
    -   `FakeSite` needs `_parsePOSTFormSubmission`.
    -   `MemoryReactor.__init__` now installs its own name resolver, which
        silently replaced the fake one.
    -   `FakeTransport` needs `setTcpNoDelay` and friends.
    -   `Deferred.__next__` is gone, so the cancellation helper patches
        `__await__`.
    -   `HostnameEndpoint._hostStr` is gone.
    -   One stack-trace assertion now ignores Twisted's frames.
-   **authlib 1.6 quoting (tests only).** 1.6.12 quotes claim names in JWT
    errors with single quotes (`Invalid claim 'aud'`) where 1.2.1 used double
    quotes, so the assertions use upstream's regexes, which accept both.
-   **lxml 6 (tests only).** libxml2 2.14 recovers a lone NUL byte into a
    document where lxml 4 returned None. `test_no_tree` now checks only that
    such a body does not raise and yields no title. One behaviour change goes
    with it: a URL preview of a body that is only a NUL byte now carries
    `og:description` U+FFFD instead of nothing.

bcrypt stays on 4.0.1 in this lock. `0f80ea0` truncates password + pepper to
72 bytes before calling bcrypt, as upstream does. Under bcrypt 4 that changes
nothing, because 4.x truncated silently. It keeps registration and login
working when bcrypt moves to 5.x, which raises instead. The first, full relock
did move it to 5.0.0, and upstream has it.

## Twisted: three Highs fixed only in a pre-release

Twisted 26.4.0 is the newest final release; 26.10.0rc1 was published on
2026-10-22. Three High denial-of-service advisories are fixed only there:

| Advisory            | CVE             | Where                                    |
| ------------------- | --------------- | ---------------------------------------- |
| GHSA-3476-c5c2-fr73 | CVE-2026-115775 | `twisted.words` XML stream (XMPP)        |
| GHSA-53xc-49m8-p798 | CVE-2026-115776 | `twisted.words.protocols.irc` IRC server |
| GHSA-cwm5-jh59-mwxr | CVE-2026-115778 | `twisted.conch.telnet` transport         |

Synapse imports neither `twisted.words` nor `twisted.conch.telnet`. The
manhole uses `twisted.conch.manhole_ssh`. This was checked: after importing
`synapse.app.homeserver` and `synapse.util.manhole`, `sys.modules` holds no
`twisted.words` or `twisted.conch.telnet` module. It does hold
`twisted.names`, which is why the advisory fixed in 26.4.0 mattered.

The three are in `.trivyignore` under their CVE IDs, which Trivy matches, and
their GHSA IDs. The entries carry a review date of 2026-12-31 and should come
out when Twisted 26.10.0 final is locked.

Three Moderate advisories also remain on 26.4.0:

-   GHSA-2qrf-pqgx-qh9v and GHSA-8pqf-f4m5-798g are in the IMAP4 server,
    which Synapse does not use.
-   **GHSA-q7qq-6mhp-9rc4** (CVE-2026-115877, CVSS 4.8) is reachable in
    principle. It is request smuggling in `twisted.web`'s header parsing: a
    bare LF in a header value. Synapse serves HTTP with `twisted.web`.
    Exploiting it needs a front end that treats the bare LF as a line end and
    forwards the raw bytes. Both stacks put nginx in front, and nginx rebuilds
    the header block it proxies, which should remove that disagreement. That
    was not verified against a running nginx. The fix is the same Twisted
    26.10.0 final.

## Black: dev-only, not bumped

black 23.10.1 has four advisories:

| Advisory                         | Severity        | Fixed in | What it concerns                                               |
| -------------------------------- | --------------- | -------- | -------------------------------------------------------------- |
| PYSEC-2026-2120 (CVE-2026-31900) | Critical (CVSS) | 26.3.0   | Black's GitHub Action with `use_pyproject: true`               |
| GHSA-cg8m-r9f2-5wm2              | High            | 26.10.1  | the GitHub Action installing an unvalidated `required-version` |
| PYSEC-2026-2121 (CVE-2026-32274) | High (CVSS)     | 26.3.1   | cache file name built from the `--python-cell-magics` option   |
| GHSA-fj7x-q9j7-g6q6              | Moderate        | 24.3.0   | ReDoS                                                          |

-   Two of them are about black's GitHub Action, which no workflow here uses.
    No root workflow references `psf/black`, and the fork's workflows never
    run.
-   The third needs control over black's command-line options.
-   black is never installed in the image, and Trivy's Poetry analyzer skips
    dev dependencies.
-   26.10.1 would clear all four, but it would reformat 207 of the 944
    Python files black checks here; 23.10.1 would reformat 26. That would
    grow the diff against upstream that `PATCHES.md` tries to keep small.

Upstream has since replaced black with `ruff format` (`scripts-dev/lint.sh`
on develop), so the formatter is better settled during a reconciliation with
upstream than by a bump here.

## pyo3

pyo3 0.20.0 had GHSA-36hh-v3qg-5jq4 (High), GHSA-chgr-c6px-7xpp (Moderate)
and GHSA-pph8-gcv7-4qj5 (Low), and anyhow 1.0.75 had RUSTSEC-2026-0190.

The fix moves pyo3 to 0.29.3, migrates the four Rust files to the Bound API
in upstream develop's shapes, and switches to `abi3-py311`; `rust-version` is
now 1.83. `PATCHES.md` has the detail. The Dockerfile installs Rust `stable`
through rustup, so the new MSRV and the lockfile format 4 are fine there.

Results:

-   `cargo build` passes.
-   `cargo test --lib` passes all 16 tests, with and without default
    features.
-   `cargo clippy` is clean.
-   osv-scanner reports nothing in `Cargo.lock`.

The compiled extension is built but never imported in this fork.
`synapse/synapse_rust/` is a pure-Python package that shadows
`synapse_rust.abi3.so`, and `tests/test_rust.py` fails on the unchanged
tree for that reason. The advisory was therefore in the built artifact, not
on any executed path.

## The Trivy gate

Before this change, `security.yml` skipped all of `apps/blackout-server`, on
the grounds that production runs the upstream image. That is not true of
`infra/single-server-baseline`: its `deploy.sh` builds the fork's Dockerfile
into `blackout-synapse:stable`.

`skip-dirs` is now `apps/blackout-server/services/blackout-api`. That
directory holds a legacy FastAPI service whose `requirements.txt` pins
PyJWT 2.10.1, with six High/Critical advisories fixed in 2.14.0. `deploy.sh`
builds it as `blackout-api:stable`, but the stack runs the Hono API
(`API_TAG=hono`). Bumping it needs its own test run. (Done on 2026-10-26 and
the skip removed; see the last section.)

Run as the workflow runs it (`trivy fs --scanners vuln --severity
CRITICAL,HIGH --ignore-unfixed --exit-code 1 --ignorefile .trivyignore
--skip-dirs apps/blackout-server/services/blackout-api .`), the gate passes
with exit 0. With an empty ignore file, the fork's `poetry.lock` shows exactly
the three Twisted CVEs above and nothing else.

Trivy's Poetry analyzer skips dev dependencies. On the old lock it listed
only main-category packages (79 findings in 13 packages) and no black,
GitPython or pyjwt. So black's advisories do not reach the gate. They are
explained above, not hidden.

## The compose stack: Synapse v1.130.0 → v1.163.2

`deploy/docker/blackout-backend` runs the upstream image, not the fork. Both
tags were scanned with Trivy against the same DB:

| Image    | Fixable High/Critical | OS                | Python packages                                        | gosu (Go stdlib) |
| -------- | --------------------- | ----------------- | ------------------------------------------------------ | ---------------- |
| v1.130.0 | 231 (19 Critical)     | Debian 12.10: 108 | 87, including 1 High against matrix-synapse itself     | 36               |
| v1.163.2 | 34 (1 Critical)       | Debian 13.7: 1    | 7: Twisted's three above, msgpack, setuptools, urllib3 | 26               |

v1.157.0 removed `experimental_features.msc3861`. v1.163.2's config loader
rejects the old template with "experimental_features.msc3861 was removed",
and it does so even with `enabled: false`. The template now renders
`matrix_authentication_service` from `SYNAPSE_MSC3861_ENABLED` and
`MAS_MATRIX_SECRET`. The synapse service passes `MAS_MATRIX_SECRET`, because
`envsubst` sees only the service's `environment:` block.

Each case was rendered with `.env.example`'s values and loaded with
`HomeServerConfig.load_config` from matrix-synapse 1.163.2. Three
adjustments were made to the rendered copy:

-   The seven variables the service never passes (see "Found outside scope")
    were filled in from `.env.example`.
-   `/data` paths were redirected to a temporary directory holding a
    generated signing key.
-   `app_service_config_files` was dropped, since the `integrations` profile
    renders those files.

| Case                                                      | Result                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| old template, Mode A                                      | ConfigError: `experimental_features.msc3861 was removed`                       |
| new template, Mode A                                      | loads                                                                          |
| new template, Mode B as the README described it           | ConfigError: `Registration cannot be enabled when OAuth delegation is enabled` |
| new template, Mode B, `SYNAPSE_ENABLE_REGISTRATION=false` | loads                                                                          |
| new template, Mode B, empty `MAS_MATRIX_SECRET`           | ConfigError (rejected, as it should be)                                        |

The README's Mode B steps now set `SYNAPSE_ENABLE_REGISTRATION=false`. They
also gain upgrade notes for every release between the two tags, each checked
against upstream's `docs/upgrade.md`.

One of those is user-visible: v1.144.0 made the MSC2666 mutual-rooms endpoint
opt-in. The client's "rooms in common" view checks `/versions` and shows
nothing without it. Turning `msc2666_enabled` on is left to the operator.

## Found outside scope (not fixed)

1.  **The compose stack's Synapse service cannot start as written, before or
    after this change.** Its command runs `envsubst` inside the upstream
    image, but Trivy's package inventory of both v1.130.0 and v1.163.2 lists
    no `gettext-base`, the Debian package that provides `envsubst`. Even with
    `envsubst`, seven template variables are not in the service's
    `environment:` block, so they render empty:

    -   `MATRIX_SERVER_NAME`
    -   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
    -   `REDIS_PASSWORD`
    -   `SYNAPSE_ENABLE_REGISTRATION_WITHOUT_VERIFICATION`
    -   `SYNAPSE_REGISTRATION_REQUIRES_TOKEN`

    Rendered that way, 1.163.2 rejects the config with "Server name '' has
    an invalid format", and so does the old template.

2.  **`ghcr.io/etkecc/synapse-admin:0.10.3` does not exist.** ghcr has no
    `0.10.3` or `v0.10.3` tag, only `v0.10.3-etke1` to `v0.10.3-etke12`; the
    newest is `v0.11.4-etke54`. A pull of that service fails.
3.  **`services/blackout-api` pins PyJWT 2.10.1**, as above. Fixed on
    2026-10-26 (last section).

## Validation

-   **Lock:** `poetry lock --check`, `.ci/scripts/check_lockfile.py` and
    `scripts-dev/check_locked_deps_have_sdists.py` (150 packages) pass.
-   **Trial suite, before and after** (`-j4`, outcomes compared test by
    test):

    |        | Tests | OK    | Skipped | Failure | Error |
    | ------ | ----- | ----- | ------- | ------- | ----- |
    | before | 3,337 | 3,022 | 173     | 106     | 36    |
    | after  | 3,338 | 3,022 | 173     | 109     | 34    |

    -   The one added test is `test_hash_long_password`, which passes.
    -   No test that failed before passes now. Several failing tests changed
        kind between Failure and Error.
    -   The 142 failures that remain were already failing on the unchanged
        tree. They are this fork's existing failures, for example those
        caused by the `synapse_rust` shadowing and the `m.blackout.signal`
        validation tests. This change does not address them.
    -   **One regression:**
        `test_events_worker.DatabaseOutageTestCase.test_recovery`. It fails
        only in trial's `-j` worker mode, with `twisted.protocols.amp.TooLong`,
        and the failure reproduces in a `-j2` run of that class alone. Twisted
        26's trial worker forwards each log event as one AMP value, and this
        test logs one longer than 64 KiB. Run without `-j`, it passes. It is
        a test-runner artifact, not a behaviour change.
    -   Before the fixes in `8ab032a` and `0e060ec`, the relock alone made
        160 previously passing tests fail.

-   **mypy** (1.5.1, unchanged; not run by any workflow): 99 errors before,
    312 after.
    -   After normalising type spellings (`Optional[X]` is printed `X | None`
        under 3.11), 217 are new.
    -   22 of those are existing errors in `blackout_runtime/` that the 3.11
        setting now reaches. The same 22 appear when mypy checks those files
        on the untouched tree.
    -   The rest come from Twisted 26's stricter annotations: transports
        typed `ITransport | None`, `buildProtocol(addr: IAddress | None)`,
        typed `clientConnectionFailed`. 25 are in `synapse/`, the rest in
        tests.
    -   None of them showed up as a test failure.
-   **Lint**, with the locked black 23.10.1, isort 5.13.1 and ruff 0.1.7: every
    changed Python file is clean. The one ruff finding, EXE001 on
    `scripts-dev/build_debian_packages.py`, was there before.
-   **Rust, scans and the compose config:** as above.

## Not verified

-   No Docker daemon was available, so neither the fork image
    (`docker/Dockerfile`) nor the compose stack was built or run. The
    compose change was checked by loading the rendered template, not by
    starting Synapse.
-   The fork's own workflows were not run; GitHub does not run them.
-   The nginx behaviour for GHSA-q7qq-6mhp-9rc4, as above.

## 2026-10-26: the legacy FastAPI service, bumped and scanned

`apps/blackout-server/services/blackout-api` is Blackout's own service, with no
upstream counterpart. `infra/single-server-baseline/deploy.sh` builds it as
`blackout-api:stable` and `blackout-api:stable-pg`. That stack runs
`blackout-api:${API_TAG:-hono}`, so the image is not run by default, but
setting `API_TAG=stable` would run it. Its pins, checked against OSV on
2026-10-26:

| Package   | Pinned  | Advisories at the pin                                                      | Now     |
| --------- | ------- | -------------------------------------------------------------------------- | ------- |
| PyJWT     | 2.10.1  | 16 (1 Critical, 5 High, all fixed by 2.14.0; two Moderates only in 2.15.0) | 2.15.1  |
| Starlette | 0.47.3  | 6 (3 High, fixed in 0.49.1, 1.1.0 and 1.3.1); not pinned before            | 1.10.0  |
| FastAPI   | 0.116.1 | none, but it capped Starlette below 0.48                                   | 0.162.0 |
| pytest    | 8.4.2   | 1 Moderate (tmpdir handling), fixed in 9.0.3                               | 9.1.1   |

Uvicorn, SQLAlchemy, Alembic and httpx have no advisories at their pins and
are unchanged. Starlette is now pinned directly: FastAPI 0.162.0 accepts any
Starlette from 0.46, and the scan reads only what `requirements.txt` names. All
the new pins show no OSV advisories.

The service's own tests (`tests/test_api.py` and `tests/test_db_guard.py`,
Python 3.12 as its Dockerfile uses) pass before and after: 15 of 15 each. The
only new output is PyJWT's `InsecureKeyLengthWarning` for the tests'
11-byte HMAC secret; PyJWT warns and does not refuse, so a deployment with a
short `JWT_SECRET` keeps working and logs the warning.

With the pins moved, the Trivy gate's `skip-dirs` is removed and the gate
scans the whole tree. Not verified: a Docker build of the image, and the
service against a running Synapse or Postgres.

## 2026-10-30: authlib past 1.7, and a fourth Twisted High

Two entries above have changed. The detail is in
`dependency-advisories-server-desktop-2026-10-30.md`.

-   **The authlib `<1.7` bound is gone.** Three new advisories (one Critical,
    two High) are fixed only in 1.9.0 and 1.9.1, so the fork now locks 1.9.1,
    as upstream does since `b20ae98` (#20415). The integer-`sub` question
    above was settled upstream's way. An integer `sub` from the userinfo
    endpoint still logs in; one inside a signed id_token is refused, as
    joserfc requires. `test_map_userinfo_to_user` carries upstream's change.
    joserfc also refuses an id_token whose `jti` is not a string, or whose
    `aud` holds a non-string. The 2026-10-30 record lists the whole change.
-   **Twisted 26.4.0 has a fourth High:** GHSA-vpp8-g58w-m8mp, HTTP/2 rapid
    reset, fixed in 26.10.0rc1. No Blackout listener can speak HTTP/2, so it
    joins the three above in `.trivyignore`, with an expiry of 2026-11-30.
    **Twisted 26.10.0 final was published on 2026-10-30.** It fixes all four.
    The plan is to lock it in its own change before 2026-11-30, then delete
    the four entries.
-   **The three Twisted entries above now expire on 2026-11-30 too.** The
    [Twisted section](#twisted-three-highs-fixed-only-in-a-pre-release) gives
    them a review date of 2026-12-31, which was only prose: Trivy would have
    gone on ignoring them after it. Each now carries `exp:2026-11-30`, on its
    GHSA and CVE lines both, so all four Twisted entries come back together.
    Their `.trivyignore` comment no longer calls the pre-release their only
    fix.
