# Server and desktop dependency advisories — 2026-10-30

Scope: the six High/Critical findings that turned the **Trivy filesystem
scan** check (`security.yml`) red on 2026-10-30. They are in two lockfiles that
the PR which showed them does not touch: the Synapse fork's
`apps/blackout-server/poetry.lock` and the desktop app's
`blackout-desktop/src-tauri/Cargo.lock`. `develop` at `ff7d08b` fails the same
way. This follows `synapse-dependencies-triage-2026-10-25.md`, whose Twisted
entries this record extends.

| Package (lock)        | Advisory                              | Severity | Fixed in   | Outcome                                    |
| --------------------- | ------------------------------------- | -------- | ---------- | ------------------------------------------ |
| authlib 1.6.12 (fork) | GHSA-6v38-4h7w-rj9h (CVE-2026-96760)  | Critical | 1.9.0      | bumped to 1.9.1                            |
| authlib 1.6.12 (fork) | GHSA-7vr2-2fgp-9w7p (CVE-2026-114615) | High     | 1.9.0      | bumped to 1.9.1                            |
| authlib 1.6.12 (fork) | GHSA-8m4g-j4wp-wgcg (CVE-2026-114616) | High     | 1.9.1      | bumped to 1.9.1                            |
| Twisted 26.4.0 (fork) | GHSA-vpp8-g58w-m8mp (no CVE)          | High     | 26.10.0rc1 | not reachable; ignored until 2026-11-30    |
| zip 4.6.1 (desktop)   | GHSA-m665-v7pm-7grj (CVE-2026-115905) | Critical | 9.0.5      | zip 9.1.3, via tauri-plugin-updater 2.14.1 |
| zip 4.6.1 (desktop)   | GHSA-q7v9-x93c-xqv3 (CVE-2026-115909) | High     | 9.0.0      | same                                       |

**Result:**

-   **authlib moves to 1.9.1, the release upstream Synapse took on 2026-10-27.**
    The 2026-10-25 cap below 1.7 is lifted. Upstream's `b20ae98` (#20415) is
    ported: the lock entries and the one test change. The bump also clears five
    Moderate/Low authlib advisories published with the three above.
-   **The integer-`sub` case behaves as upstream's does now.** authlib 1.7+
    rejects an id_token whose `sub` is not a string. An integer id from the
    userinfo endpoint (GitHub-style OAuth2) still logs in. No claim check in
    `oidc.py` was changed or loosened.
-   **None of the three authlib advisories is reachable from the shipped
    configurations.** One of them (the empty HMAC key) is reachable by an
    operator who enables JWT login with an empty secret. It is fixed anyway: the
    default for an authentication bypass is to bump.
-   **Twisted's HTTP/2 advisory is ignored, with an expiry.** No Blackout
    listener can speak HTTP/2: the `h2` package is not installed and Synapse's
    TLS listeners negotiate no ALPN. Twisted **26.10.0 final was published on
    2026-10-30**, hours before this record. It also fixes the three Twisted
    Highs ignored on 2026-10-25. Taking it is a separate change, for the reasons
    in [its section](#twisted-26100-is-now-final).
-   **The desktop app's updater moves to 2.14.1, the first release on zip 9.**
    That release requires tauri 2.12, so tauri moves from 2.10.3 to 2.12.5, and
    the webview stack with it. The vulnerable zip code runs only on Windows, only
    after the updater has checked the minisign signature, and nothing in the app
    calls the updater today.
-   **The gate passes.** Trivy 0.69.3, run as `security.yml` runs it, reports no
    un-ignored High/Critical finding.
-   **Found outside scope, not fixed:** the desktop updater's public key in
    `tauri.conf.json` is a literal `${TAURI_UPDATER_PUBKEY}` placeholder, and no
    PR job compiles the desktop crate. See
    [Found outside scope](#found-outside-scope-not-fixed).

Commits, on top of `ff7d08b`: `21c9591` (authlib, with the `PATCHES.md`
entry), `5ed6382` (the Twisted triage), `e4bc2c0` (the desktop lock), then this
record with the 2026-10-25 record's addendum.

---

## Method

-   **Scanner:** Trivy 0.69.3, the version the failing CI run used, from the
    GitHub release, checked against `trivy_0.69.3_checksums.txt`. Its vulnerability DB was
    published 2026-10-30 19:07 UTC. Run with `security.yml`'s flags: `fs`,
    `--scanners vuln`, `--severity CRITICAL,HIGH`, `--ignore-unfixed`,
    `--ignorefile .trivyignore`, `--exit-code 1`, over the repository root.
    The only addition was `--skip-dirs node_modules,.git`; this worktree has
    no `node_modules`. On `develop` it reports exactly the six findings
    above.
-   **Advisory text:** the OSV API (`/v1/query`, `/v1/vulns/<id>`), GitHub's
    records in `github/advisory-database` (from `raw.githubusercontent.com`),
    and NVD's API for the five that have CVEs. GitHub's and OSV's affected
    ranges are identical for all six. GitHub's advisory pages and REST API were
    not reachable from this session.
-   **Upstream Synapse:** `element-hq/synapse` `develop` at `1a5fec6`, read
    through git (a blobless clone) and `raw.githubusercontent.com`.
-   **Crates:** the crates.io API for `tauri-plugin-updater`, `zip` and
    `tauri` versions and dependency lists. The updater sources that were read
    (2.10.0 and 2.14.1) came from `static.crates.io`, and each one's sha256
    matches the checksum in `Cargo.lock` before and after.
-   **Python:** PyPI's JSON API for authlib, joserfc, Twisted, h2 and
    priority. The lock was regenerated with poetry 1.3.2, the version
    `docker/Dockerfile` installs.
-   **Tests:** trial under Python 3.11.17 (the image builds on 3.11), in two
    venvs built from the lock before and after. Each venv installs the
    Dockerfile's `poetry export --extras all` plus the dev group, minus
    psycopg2 and pyicu, whose system headers are not installed here. Each tree was installed with
    `pip install --no-deps -e .` and trial ran from a copy of it. Each heavy
    run started only when the machine's 1-minute load was under 3. The one
    exception was a 16-second first attempt, before the tree was installed;
    it errored on the missing package metadata and was discarded.

## authlib

### The advisories

| Advisory            | Vulnerable code                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-6v38-4h7w-rj9h | `JsonWebSignature.deserialize_json()` returns the payload as verified when the JWS JSON serialization has an empty `signatures` array. No key is consulted.      |
| GHSA-7vr2-2fgp-9w7p | `OctKey.import_key()` refuses PEM or SSH key text as an HMAC secret only when it starts at byte 0. With one leading byte, a public key becomes the HS256 secret. |
| GHSA-8m4g-j4wp-wgcg | `OctKey.import_key()` and the HMAC algorithms accept a zero-length key, so anyone can compute a valid HS256/384/512 signature when the verifier's key is empty.  |

GHSA-7vr2 also needs a verifier that accepts both HS\* and asymmetric
algorithms, such as authlib's module-level `jwt` object, and a verification key
passed as PEM or certificate text.

Each was reproduced against the two locked versions:

| Probe                                                                 | 1.6.12   | 1.9.1                                                        |
| --------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `deserialize_json` with `"signatures": []`                            | accepted | `BadSignatureError`                                          |
| `JsonWebToken(["HS256"]).decode(token, key="")`, as `jwt.py` calls it | accepted | `ValueError: oct key material must not be empty`             |
| `CodeIDToken` with an integer `sub`, as `oidc.py` validates it        | accepted | `InvalidClaimError: Claim 'sub' must be a StringOrURI value` |

### Our exposure

authlib is imported by four production modules of the fork:

-   `synapse/handlers/oidc.py`, OIDC login: `JsonWebToken(alg_values).decode()`
    on the provider's id_token. `alg_values` is the provider's
    `id_token_signing_alg_values_supported`, and the key is the JWKS fetched
    from its `jwks_uri`.
-   `synapse/handlers/jwt.py`, JWT login (`jwt_config`):
    `JsonWebToken([jwt_algorithm]).decode(token, key=jwt_secret)`.
-   `synapse/api/auth/msc3861_delegated.py`, OAuth delegation: authlib only
    signs client assertions (`ClientSecretJWT`, `PrivateKeyJWT`) and encodes
    client credentials. The access token is checked by introspection, a JSON
    POST to the provider. No JWT is verified here.
-   `synapse/config/experimental.py`: `JsonWebKey.import_key()` on the
    configured JWK, and an import check.

**The production image installs authlib.** `docker/Dockerfile` runs
`poetry export --extras all`, and `all` includes the `oidc` and `jwt` extras.
`infra/single-server-baseline/deploy.sh` builds it as `blackout-synapse:stable`,
and that stack's `homeserver.yaml.template` configures `oidc_providers`.
`services/blackout-server/Dockerfile` exports without extras, so it has no
authlib. `deploy/docker/blackout-backend` runs the upstream image, not the fork.

Per advisory:

-   **GHSA-6v38 (Critical): not reachable.** `JsonWebToken.decode` accepts only
    compact serializations: it counts the dots and calls
    `deserialize_compact`. Nothing in `synapse/` or `blackout_runtime/` calls
    `deserialize_json` or `JsonWebSignature.deserialize`.
-   **GHSA-7vr2 (High): not reachable.**
    -   `jwt.py` pins a single algorithm, so an HS256 token is refused when
        RS256 is configured.
    -   `oidc.py` accepts whatever list the provider advertises, which can mix
        HS\* and RS\*. But its keys arrive as JWK dicts from the provider's
        `jwks_uri`, never as PEM text. For an HS\* header, authlib looks up the
        JWK by `kid` and imports it as an `oct` key. An RSA or EC JWK has no `k`
        member, so that import fails. A probe in `_verify_jwt`'s shape (a mixed
        list, the JWKS dict as key, HS256 signed with the JWK's text or with
        its PEM behind a newline) is refused by 1.6.12 and 1.9.1 alike:
        `Missing required field: "k"`.
-   **GHSA-8m4g (High): reachable only through operator configuration.**
    `config/jwt.py` reads `jwt_config.secret` verbatim and does not reject an
    empty string. A homeserver with JWT login on, an HS\* algorithm and an
    empty secret (for example, a template variable that rendered empty) would
    accept a token anyone can sign, for any user. No Blackout template enables
    `jwt_config`. OIDC id_tokens are checked only against the provider's
    JWKS, never against `client_secret`. With 1.9.1 such a configuration fails
    closed. authlib raises `ValueError` for the empty key, which `jwt.py` does
    not catch (it catches `JoseError`), so each JWT login ends in an error
    rather than a session. That was read from the code, not run.

### What was done

-   `pyproject.toml`: `authlib = ">=1.9.1,<1.10"`. 1.9.1 is the newest
    release; 1.10 does not exist yet, so the cap is below a minor nobody here
    has checked. Upstream has no cap.
-   `poetry.lock`, with `poetry lock --no-update`:

    -   authlib 1.6.12 → 1.9.1;
    -   `joserfc` 1.7.7 is added. authlib 1.7+ requires `joserfc>=1.6.8` and
        `cryptography>=45.0.1`, and the lock already has cryptography 50.0.2;
    -   the `content-hash` changes.

    Nothing else moves. The file hashes match upstream's lock. The image's
    `--extras all` export changes by exactly these two lines. OSV lists no
    advisory against authlib 1.9.1 or joserfc 1.7.7.

-   `tests/handlers/test_oidc.py`: upstream's change to
    `test_map_userinfo_to_user`, described next.
-   `apps/blackout-server/PATCHES.md` has the entry.

### The integer `sub`

From 1.7.0, authlib validates registered claims with joserfc, and joserfc
requires `sub` to be a StringOrURI (RFC 7519 §4.1.2). OIDC Core requires a
string as well. On 2026-10-25 this was the reason for the cap, because
`test_map_userinfo_to_user` fed an integer `sub` through an id_token.

Upstream's `b20ae98` bumped authlib to 1.9.1 and changed only that test. The
integer case now comes from the userinfo endpoint:
`_user_profile_method = "userinfo_endpoint"` and `scope=""`, so the fake
provider issues no id_token. Upstream's comment names GitHub as such a
provider. `synapse/handlers/oidc.py` is unchanged upstream and here.

The behaviour change, stated plainly:

-   A provider that signs an id_token with an integer `sub` is now refused.
    The callback renders `invalid_token`. `oidc.py` parses any id_token the
    token endpoint returns, even when `user_profile_method` is
    `userinfo_endpoint`.
-   A provider whose userinfo endpoint returns an integer `sub` still maps to
    a Matrix user. The subject template renders it as a string.

No claim check was loosened: `iss`, `aud`, `exp`, `iat`, `nonce`, `at_hash` and
the signature are verified as before.

Both halves were run:

-   **`develop`'s test fails under 1.9.1.** `test_map_userinfo_to_user` stops
    at the integer case, and the log shows `Invalid id_token` with joserfc's
    `InvalidClaimError: Claim 'sub' must be a StringOrURI value`.
-   **The ported test file passes under 1.6.12 too.** All 28 tests in
    `test_oidc.py` pass, so the test change does not depend on the new
    version.

Two side effects of 1.9.1 were checked:

-   **Some claim errors now come from joserfc.** `CodeIDToken`'s OIDC checks
    raise joserfc's `InvalidClaimError` and `MissingClaimError`, which are not
    subclasses of `authlib.jose.errors.JoseError`. `oidc.py` catches
    `Exception` around `_parse_id_token`, so they still render
    `invalid_token`. The logout token (`LogoutToken`) and JWT login use
    authlib's `JWTClaims`, which still raises authlib's errors. Their
    `except JoseError` clauses still apply, and their tests pass.
-   **A deprecation warning at import.** Importing `authlib.jose` now emits
    `AuthlibDeprecationWarning` ("please use joserfc instead", removal by
    2.0.0). `oidc.py` and `jwt.py` import it, so the warning appears once when
    either module loads. Upstream is in the same position.

## Twisted: HTTP/2 rapid reset

GHSA-vpp8-g58w-m8mp (High, published 2026-10-29, no CVE): the HTTP/2 Rapid
Reset class (CVE-2023-44487) in `twisted.web._http2.H2Connection`. A client
sends `HEADERS` with `END_STREAM` and an immediate `RST_STREAM` on each new
stream. The server renders each request before it handles the reset, and reset
streams never count against the concurrent-stream limit. One connection can
hold a CPU core. Fixed in 26.10.0rc1.

### No Blackout listener can speak HTTP/2

-   **Twisted's switch to HTTP/2 needs ALPN.**
    `_GenericHTTPChannelProtocol.dataReceived` (26.4.0) moves a connection to
    `H2Connection` only when the transport's `negotiatedProtocol` is `b"h2"`.
    A plain TCP transport has none, so it stays HTTP/1.1. Twisted has no
    cleartext HTTP/2 (h2c).
-   **The HTTP/2 code is not installed.** `twisted.web._http2` imports `h2`
    and `priority`. Neither is in `poetry.lock`, in the image's
    `--extras all` export, or in the test venv. `twisted.web.http.H2_ENABLED`
    is `False` there. Synapse depends on `Twisted[tls]`, not `Twisted[http2]`.
-   **Synapse's TLS listeners negotiate no protocol.**
    `synapse/crypto/context_factory.py`'s `ServerContextFactory` sets no ALPN
    callback, so a `tls: true` listener would also stay HTTP/1.1.
-   **No shipped listener is TLS.** `infra/single-server-baseline` and
    `deploy/docker/blackout-backend` both configure port 8008 with
    `tls: false`. Every nginx config that fronts Synapse reaches it with
    `proxy_pass http://`. The image's built-in config template has a
    `tls: true` listener on 8448, but the stack mounts its own
    `homeserver.yaml`.

HTTP/2 from clients terminates at nginx (`listen 443 ssl http2` in
`infra/single-server-baseline`). Rapid Reset against nginx itself is nginx's to
handle and is outside this record.

The entry is in `.trivyignore` with `exp:2026-11-30`, so the gate fails again
if Twisted 26.10.0 has not been locked by then. The other two lists that
`.trivyignore`'s header names do not get it: `osv-scanner.toml` and
`pnpm.auditConfig` cover `pnpm-lock.yaml` only. `security.yml` runs osv-scanner
with `--lockfile=pnpm-lock.yaml`. The three Twisted entries of 2026-10-25 were
handled the same way.

### Twisted 26.10.0 is now final

PyPI published Twisted 26.10.0 on 2026-10-30 at 09:24 UTC. It fixes this
advisory, the three Highs ignored on 2026-10-25, and the remaining Moderate and
Low ones:

-   GHSA-q7qq-6mhp-9rc4, request smuggling in `twisted.web`;
-   GHSA-2qrf-pqgx-qh9v in the IMAP server (OSV lists the other IMAP one,
    GHSA-8pqf-f4m5-798g, as last affecting 26.4.0);
-   GHSA-jj36-9pvh-vj5r (Low, 2026-10-27), DNS response spoofing in
    `twisted.names`.

It was not taken here, for three reasons:

-   It requires `zope-interface>=8`, and the lock has 6.0, so a second
    package moves a major version.
-   Upstream Synapse `develop` is still on 26.4.0.
-   The last Twisted move (23.10 → 26.4, on 2026-10-25) needed seven
    test-harness ports and a production fix in `synapse/http/proxy.py`. A
    Twisted minor deserves its own full-suite comparison, not a ride-along in a
    gate fix.

**Plan:** lock Twisted 26.10.0 in its own change, with the trial suite compared
before and after. Then remove all four Twisted entries from `.trivyignore`.

## zip in the desktop updater

| Advisory            | Vulnerable code                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GHSA-m665-v7pm-7grj | `ZipArchive` takes names from the central directory and `ZipStreamReader` from the local headers. An archive can list a harmless name to one reader and write another path with the other. |
| GHSA-q7v9-x93c-xqv3 | `ZipArchive::extract()` reserves a symlink target's buffer from the declared (ZIP64) size before reading. A 112-byte archive aborts the process; the abort cannot be caught.               |

OSV also lists three RUSTSEC advisories against 4.6.1, fixed in 9.0.0 and
carrying no severity: SUID bits preserved, symlink targets outside the
destination, and permissions applied through symlinks. It lists one Moderate as
well, GHSA-8hxf, an AES entry's HMAC skipped on early EOF. 9.1.3 clears all of
them, and OSV lists nothing against it.

### How the updater uses zip

From the 2.10.0 source:

-   `zip` is an optional dependency under
    `cfg(target_os = "windows")`, enabled by the default `zip` feature. It is
    not compiled for macOS or Linux.
-   It is used once, in `extract_zip`: `ZipArchive::new(..)` and then
    `extract(temp_dir)`. `install` reaches it only when the bytes are a zip.
    `ZipStreamReader` is never used.
-   `install` is fed only bytes that `download` returned, and `download` runs
    `verify_signature` (minisign, against `plugins.updater.pubkey`) before it
    returns them. The JavaScript `install` command takes the resource id of
    those verified bytes, not raw bytes.

So both advisories need an archive signed with the project's updater key.
Whoever holds that key can already ship an installer that runs as the user.
GHSA-m665's parser differential has no second reader here. The signature
covers the raw file, not a central-directory listing.

Two more facts lower the exposure further:

-   **This app's updater artifacts are not zips.** `tauri-utils` documents
    `createUpdaterArtifacts: "v1Compatible"` as the setting that makes the
    legacy zipped updaters; this app sets `true`.
-   **Nothing calls the updater.** `src-tauri/src/main.rs` registers the plugin
    but never calls `check`, and the client never invokes `plugin:updater|*`.
    The v2 plugin does not check for updates by itself.

### What was done

`cargo update -p tauri-plugin-updater --precise 2.14.1`. 2.14.1 (2026-10-28)
is the only release on `zip ^9`, which resolves to 9.1.3. Every other
release since 2.0.0 is on `zip ^2` or `^4`: 2.14.0 and the four 3.0 alphas
included.

2.14.1 requires `tauri ^2.12`, and `Cargo.toml`'s `tauri = "2.0"` allows it. So
the update also moves:

-   tauri 2.10.3 → 2.12.5, and tauri-build, -codegen, -macros, -plugin, -runtime,
    -runtime-wry and -utils with it;
-   wry 0.54 → 0.57, tao 0.34 → 0.37, tray-icon 0.21 → 0.25, muda 0.17 → 0.20;
-   about thirty smaller crates.

In total 41 crates change version, 28 are added and 54 drop out. `Cargo.toml`
is unchanged. Of the added crates, `dbus` and `libdbus-sys` come from tauri
2.12's default `dbus` feature, through tao. On Linux the build then needs
libdbus-1's development files.

2.14.1 also changes the updater's own checks:

-   `install` verifies the bytes it is given, where 2.10.0 trusted the caller.
-   An opt-in `requireSignedVersion` binds the signature to the announced
    version. It stays off here, which keeps behaviour unchanged.

The effective minimum Rust becomes 1.90, from 1.88 before. `Cargo.toml` says
`rust-version = "1.77"`, which was already untrue; the release job uses
`stable`.

### Verification

-   **`cargo check` could not run.** This host has no GTK 3, WebKitGTK 4.1,
    libsoup 3, dbus-1 or appindicator development files, which tauri's Linux
    backends need. pkg-config finds none of them, and none was installed. A
    cross-target check for Windows, where zip is used, was not attempted:
    ring, behind the updater's default rustls backend, compiles C for the
    target, and this host has no Windows C compiler or SDK.
-   **What was run instead:**
    -   `cargo update --dry-run`, then the update;
    -   `cargo tree -i zip --target all`: zip 9.1.3, only through
        tauri-plugin-updater 2.14.1;
    -   `cargo metadata --locked` before and after, for the rust-version
        figures.
-   **The tauri APIs `main.rs` uses were checked by hand.** Each of them is
    defined, and none is newly deprecated, in tauri 2.12.5's source: the tray,
    menu, window, state and close-request APIs. The other six plugins keep
    their versions.

## The gate

| Run                                                   | High/Critical reported                                                           | Exit |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| `develop` (`ff7d08b`)                                 | the six above                                                                    | 1    |
| this branch                                           | none                                                                             | 0    |
| this branch, `.trivyignore` emptied                   | 7: the four Twisted entries, image-size (2) and react-router, all ignored before | 1    |
| this branch, the new entry's `exp:` set to 2026-10-01 | GHSA-vpp8-g58w-m8mp only                                                         | 1    |

The last row shows that Trivy 0.69.3 honours the `exp:` date. Nothing from
authlib or zip remains with the ignore file emptied.

## Validation

-   **Lock:** `poetry lock --check`, `.ci/scripts/check_lockfile.py` and
    `scripts-dev/check_locked_deps_have_sdists.py` (151 packages) pass.
-   **The auth tests, before and after:** 231 tests in 13 modules. All pass
    on both sides, and none is skipped, so authlib was loaded. The modules:
    -   `tests.handlers.test_oidc`, `test_sso`, `test_auth` and
        `test_oauth_delegation`;
    -   `tests.rest.client.test_login` (JWT login lives here; there is no
        `tests/handlers/test_jwt.py`), `test_auth`, `test_auth_issuer` and
        `test_keys`;
    -   `tests.api.test_auth`, `tests.config.test_oauth_delegation`,
        `tests.rest.admin.test_jwks`, `tests.rest.test_well_known` and
        `tests.blackout_runtime.test_session_length`.
-   **The full trial suite, before and after** (`-j3`):

    |        | Tests | OK    | Skipped | Failure | Error |
    | ------ | ----- | ----- | ------- | ------- | ----- |
    | before | 3,350 | 3,034 | 173     | 110     | 34    |
    | after  | 3,350 | 3,034 | 173     | 110     | 34    |

    Compared test by test, every outcome is the same. The 144 failures and
    errors are the fork's existing ones (see the 2026-10-25 record). None is in
    an auth module.

-   **`blackout_runtime_tests`:** 85 passed before and after, run with
    `pytest -q` as `docs/ops/upstream_sync_runbook.md` says. pytest is not in
    the lock: 8.3.5 was added to each venv with `--no-deps`, because 9.x would
    have moved the locked `packaging`. `tests/blackout_runtime` is part of the
    trial suite above.
-   **Lint:** no root workflow lints or type-checks the fork, and the fork's
    own workflows never run. The changed Python file, `tests/handlers/test_oidc.py`,
    is clean under the locked ruff 0.1.7, black 23.10.1 and isort 5.13.1. mypy
    was not run.
-   **Desktop:** as in [Verification](#verification).
-   **gitleaks 8.21.2** over `origin/develop..HEAD`: no leaks.
-   **prettier 2.8.1**, the root's version, on the changed Markdown: clean.
    This worktree has no `.husky/_` (pnpm's `prepare` script creates it), so
    git ran no pre-commit hook. The hook's two steps were run by hand before
    each commit, and both passed: lint-staged's `prettier --ignore-unknown` on
    the staged files, and `tools/ci/check-auth-secrets.mjs`.

## Found outside scope (not fixed)

1.  **The desktop updater's public key is a placeholder.** `tauri.conf.json`
    sets `"pubkey": "${TAURI_UPDATER_PUBKEY}"`. Tauri's config loader does not
    expand environment variables (`tauri-utils` `config/parse.rs`); it merges
    only a JSON `TAURI_CONFIG`. The release workflow passes
    `TAURI_UPDATER_PUBKEY` to `tauri-action` but does not rewrite the file. If
    nothing else substitutes it, the shipped key is the literal string, which
    is not base64 minisign. Every update would then fail verification: closed,
    not open. Not verified against a release build.
2.  **No PR job compiles the desktop crate.** `blackout-desktop-tauri.yml`
    runs a toolchain-free harness on pull requests to `main`. It runs the
    bundle build only on pushes to `main` and on tags, and the default branch
    is `develop`. A compile error from this update would first show on a
    release build.

## Not verified

-   A desktop build or run on any platform, and the updater against a real
    release.
-   Whether libdbus-1-dev reaches the Linux release job through the packages
    it installs (`libwebkit2gtk-4.1-dev` and others), now that tauri 2.12
    links dbus by default.
-   A Docker build of the fork image, and Synapse against a real OIDC provider.
-   Twisted 26.10.0 against the trial suite.
