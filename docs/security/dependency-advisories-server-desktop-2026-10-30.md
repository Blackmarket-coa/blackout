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
-   **id_token claims are type-checked now, as upstream's are.** authlib 1.7+
    refuses an id_token whose `sub` or `jti` is not a string, or whose `aud`
    holds a non-string. An integer id from the userinfo endpoint (GitHub-style
    OAuth2) still logs in. No claim check was loosened. Two that were already
    weak, and still are, are now written down in
    [their own section](#claim-checks-the-bump-did-not-change): `aud` is
    enforced only through `azp`, and the signature check accepts `none` when
    the provider lists it.
-   **Unsigned back-channel logout tokens are refused (fork patch).** With a
    provider that lists `none`, anyone could end a session whose `sid` they
    knew by POSTing an unsigned logout token. OIDC Back-Channel Logout forbids
    `none` for logout tokens, and `oidc.py` now drops it there. The gap
    predates the bump and is in upstream too.
-   **None of the three authlib advisories is reachable from the shipped
    configurations.** One of them (the empty HMAC key) is reachable by an
    operator who enables JWT login with an empty secret. It is fixed anyway: the
    default for an authentication bypass is to bump.
-   **Twisted's HTTP/2 advisory is ignored, with an expiry.** No Blackout
    listener can speak HTTP/2: the `h2` package is not installed and Synapse's
    TLS listeners negotiate no ALPN. Twisted **26.10.0 final was published on
    2026-10-30**, hours before this record. It also fixes the three Twisted
    Highs ignored on 2026-10-25, which now expire on the same date. Taking it
    is a separate change, for the reasons in
    [its section](#twisted-26100-is-now-final).
-   **The desktop app's updater moves to 2.14.1, the first release on zip 9.**
    That release requires tauri 2.12, so tauri moves from 2.10.3 to 2.12.5, and
    the webview stack with it. The vulnerable zip code runs only on Windows, only
    after the updater has checked the minisign signature, and nothing in the app
    calls the updater today.
-   **The gate passes.** Trivy 0.69.3, run as `security.yml` runs it, reports no
    un-ignored High/Critical finding.
-   **Found outside scope, not fixed:** the desktop updater's public key in
    `tauri.conf.json` is a literal `${TAURI_UPDATER_PUBKEY}` placeholder; no PR
    job compiles the desktop crate; and two older ignores that the gate still
    applies rest on reasons the advisory data no longer supports. One of them,
    react-router's, lapses in `osv-scanner.toml` on 2026-10-31. See
    [Found outside scope](#found-outside-scope-not-fixed).

Commits, on top of `ff7d08b`: `21c9591` (authlib, with the `PATCHES.md`
entry), `5ed6382` (the Twisted triage), `e4bc2c0` (the desktop lock) and
`73e5b29` (this record, first version, with the 2026-10-25 record's addendum).
After review: `ad9bf75` (tests for the paths authlib 1.9.1 rewrote, and the
corrected `PATCHES.md` entry), `d9eed10` (the logout-token fix), `e6b6b5a` (the
Twisted ignore records), then this version of the record.

## What the review changed

A review of the first version found seven problems. Each is answered here:

| Finding                                                                               | Now                                                                                                                   |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| An unsigned token passes when the provider lists `none`; the logout endpoint is open. | Logout tokens: fixed (`d9eed10`). ID tokens: explained, [not changed](#the-signature-check-accepts-none-when-listed). |
| The record and `PATCHES.md` said `aud` is verified; it is only enforced via `azp`.    | Reworded in both, and [explained](#aud-is-enforced-only-through-azp). Not patched.                                    |
| The react-router and image-size ignores rest on stale reasons.                        | Left to the `-v47` advisory work, which found the same; see [Found outside scope](#found-outside-scope-not-fixed).    |
| The 2026-10-25 Twisted ignores had no expiry, and their wording was stale.            | They expire with the HTTP/2 entry (`e6b6b5a`); `security.yml`'s comment is corrected.                                 |
| The behaviour change named the integer `sub` alone.                                   | [The list](#the-claim-type-checks) now has `jti` and `aud` too, measured on both versions.                            |
| The `private_key_jwt` deprecation warning fires per request, not once.                | [Recorded](#two-side-effects), with the fix to make if that path is ever enabled.                                     |
| No test drove MSC3861 client-assertion signing, or an integer `sub` in an id_token.   | Both are tested now (`ad9bf75`).                                                                                      |

---

## Method

-   **Scanner:** Trivy 0.69.3, the version the failing CI run used, from the
    GitHub release, checked against `trivy_0.69.3_checksums.txt`. Its vulnerability DB was
    published 2026-10-30 19:07 UTC. Run with `security.yml`'s flags: `fs`,
    `--scanners vuln`, `--severity CRITICAL,HIGH`, `--ignore-unfixed`,
    `--ignorefile .trivyignore`, `--exit-code 1`, over the repository root.
    The only addition was `--skip-dirs node_modules,.git`; this worktree's
    `node_modules` holds nothing but prettier's cache. On `develop` it reports
    exactly the six findings above.
-   **Advisory text:** the OSV API (`/v1/query`, `/v1/vulns/<id>`), GitHub's
    records in `github/advisory-database` (from `raw.githubusercontent.com`),
    and NVD's API for the five that have CVEs. GitHub's and OSV's affected
    ranges are identical for all six. GitHub's advisory pages and REST API were
    not reachable from this session.
-   **Upstream Synapse:** `element-hq/synapse` `develop` at `1a5fec6`, read
    through git (a blobless clone) and `raw.githubusercontent.com`. Re-checked
    after review at `cc172f7` (2026-10-30 20:47 UTC): `oidc.py` and the lock's
    authlib and Twisted are unchanged since `1a5fec6`.
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

### The claim-type checks

From 1.7.0, authlib validates an id_token's registered claims with joserfc's
`JWTClaimsRegistry`, which type-checks each claim that is present (RFC 7519
§4.1): `iss`, `sub` and every `aud` member must be strings (StringOrURI),
`jti` must be a string, and `exp`, `nbf` and `iat` numbers. authlib 1.6.12
checked only the numbers. On 2026-10-25 this was the reason for the cap,
because `test_map_userinfo_to_user` fed an integer `sub` through an id_token.

Upstream's `b20ae98` bumped authlib to 1.9.1 and changed only that test. The
integer case now comes from the userinfo endpoint:
`_user_profile_method = "userinfo_endpoint"` and `scope=""`, so the fake
provider issues no id_token. Upstream's comment names GitHub as such a
provider. `b20ae98` left `synapse/handlers/oidc.py` unchanged, upstream and
here. (This fork's copy changes later in this record, in the back-channel
logout handler, for another reason.)

The behaviour change, stated plainly. The first version of this record named
the integer `sub` alone, which was incomplete.

-   An id_token is now refused, and the callback renders `invalid_token`, when:

    -   its `sub` is not a string;
    -   its `jti` is not a string;
    -   its `aud` is neither a string nor a list of strings, such as
        `["<client_id>", 5]`, even with an `azp` naming this client.

    `oidc.py` parses any id_token the token endpoint returns, even when
    `user_profile_method` is `userinfo_endpoint`.

-   A non-string `iss` was refused before and still is. `oidc.py` always
    checks `iss` against the issuer, and 1.6.12's value check fails on it.
-   A provider whose userinfo endpoint returns an integer `sub` still maps to
    a Matrix user. The subject template renders it as a string.
-   JWT login (`jwt.py`) and the logout token are not affected. They validate
    with authlib.jose's `JWTClaims`, which accepts an integer `jti` on both
    versions.

Measured with a probe of `_parse_id_token`'s exact call
(`JsonWebToken(algs).decode(token, key=<JWKS dict>, claims_cls=CodeIDToken,
claims_options={iss}, claims_params={nonce, client_id})`, then
`validate(now, leeway=120)`) under each locked version:

| id_token                                             | 1.6.12                       | 1.9.1              |
| ---------------------------------------------------- | ---------------------------- | ------------------ |
| integer `sub`                                        | accepted                     | refused            |
| integer `jti`                                        | accepted                     | refused            |
| `aud: [client, 5]`, `azp: client`                    | accepted                     | refused            |
| integer `iss`                                        | refused                      | refused            |
| string `sub`, string `jti`, `aud: [client]`          | accepted                     | accepted           |
| `aud: "other"` or `[client, "other"]`, `azp: client` | accepted                     | accepted           |
| `aud: "other"` or `["other", client]`, no `azp`      | refused                      | refused            |
| `azp` naming another client                          | refused                      | refused            |
| `nonce` wrong or missing                             | refused                      | refused            |
| `at_hash` wrong / right                              | refused / accepted           | refused / accepted |
| `exp` 100 s ago / 200 s ago                          | accepted / refused           | accepted / refused |
| `nbf` 100 s ahead / 200 s ahead, `iat` 200 s ahead   | accepted / refused / refused | same               |
| `exp`, `iat`, `sub` or `aud` missing                 | refused                      | refused            |
| `iat`, `auth_time` or `amr` of the wrong type        | refused                      | refused            |

Of these 29 cases, three changed, all from accepted to refused. No case that
1.6.12 refused is accepted by 1.9.1. Some refusals now raise joserfc's
exception classes; see the next section.

Both halves of the integer-`sub` change were run:

-   **`develop`'s test fails under 1.9.1.** `test_map_userinfo_to_user` stops
    at the integer case, and the log shows `Invalid id_token` with joserfc's
    `InvalidClaimError: Claim 'sub' must be a StringOrURI value`.
-   **The ported test file passes under 1.6.12 too.** All 28 tests in
    `test_oidc.py` pass, so the test change does not depend on the new
    version.

After review, `tests/blackout_runtime/test_oidc_claim_types.py` (`ad9bf75`)
pins the three refusals through the real callback. The upstream test no longer
puts an integer `sub` in an id_token, so nothing else did. Each refusal's log
line is joserfc's check for that claim. Under 1.6.12 the three tests fail,
because the login completes.

### Two side effects

-   **Some claim errors now come from joserfc.** `CodeIDToken`'s OIDC checks
    raise joserfc's `InvalidClaimError` and `MissingClaimError`, which are not
    subclasses of `authlib.jose.errors.JoseError`. `oidc.py` catches
    `Exception` around `_parse_id_token`, so they still render
    `invalid_token`. The logout token (`LogoutToken`) and JWT login use
    authlib's `JWTClaims`, which still raises authlib's errors. Their
    `except JoseError` clauses still apply, and their tests pass.
-   **Deprecation warnings.** Importing `authlib.jose` emits
    `AuthlibDeprecationWarning` ("please use joserfc instead", removal by
    2.0.0). That happens at startup, when `oidc.py`, `jwt.py` and
    `config/experimental.py` load. Upstream is in the same position.
    -   **One path warns on every request.** This was missed in the first
        version, which said the warning appears once. With MSC3861 and
        `client_auth_method: private_key_jwt`, every token introspection
        signs a client assertion with the configured key. That key is an
        authlib.jose `RSAKey` (`config/experimental.py`'s `_parse_jwks`), and
        1.9.1 converts it on each call with
        `deprecate("Please use joserfc to import keys.")`.
        `authlib/deprecate.py` sets the `always` filter for that warning
        class, so it is never deduplicated. Twisted's log beginner routes
        warnings into Synapse's log, and this fork's `msc3861_delegated` does
        not cache introspection results. The result is one log line per
        authenticated request.
    -   A probe of `MSC3861DelegatedAuth`'s own `ClientAuth`, with authlib's
        filters as installed, counted 3 warnings in 3 calls under 1.9.1 and
        none under 1.6.12. `client_secret_jwt`, `client_secret_post` and
        `client_secret_basic` warn on neither version. The assertion is the
        same on both: header `alg`, `kid` and `typ`; claims `iss`, `sub`,
        `aud`, `exp`, `iat` and `jti`; a 3600-second lifetime.
        `tests/blackout_runtime/test_msc3861_client_assertion.py` (`ad9bf75`)
        now checks it for both JWT methods, verifying the signature without
        authlib.
    -   It is log noise only, and no shipped configuration reaches it.
        `infra/single-server-baseline` uses classic `oidc_providers`, and the
        MAS stack runs the upstream image. If the fork ever enables
        `private_key_jwt`, convert the JWK to a joserfc key once at config
        time. That is a fork change and needs a `PATCHES.md` entry.

## Claim checks the bump did not change

The review compared the two versions claim by claim. It found two weak checks
that predate the bump, behave the same on both versions, and are in upstream
(`develop` at `cc172f7`) too. The first version of this record said "`iss`,
`aud`, `exp`, `iat`, `nonce`, `at_hash` and the signature are verified as
before". That was true as far as it went, and it left out both of these.

### The signature check accepts `none` when listed

`_verify_jwt` passes the provider's `id_token_signing_alg_values_supported` to
`JsonWebToken` as the allowed algorithms, and authlib implements `none`. If
the list has `none`, an unsigned token verifies. Probed on both versions:
with `["ES256", "none"]` an unsigned id_token is accepted; with `["ES256"]` it
is refused (`unsupported_algorithm`); with an empty list every token is
refused.

-   **Logout tokens: fixed (`d9eed10`).**
    -   The back-channel logout endpoint,
        `/_synapse/client/oidc/backchannel_logout`, takes a POST from anyone.
        Every nginx config that fronts Synapse proxies `/_synapse/client`, and
        `infra/single-server-baseline`'s template sets
        `backchannel_logout_enabled: true`.
    -   With a provider that listed `none`, an unsigned token naming a
        session's `sid` revoked that session. That is a forced logout, not a
        takeover, and it needs the `sid`.
    -   OIDC Back-Channel Logout 1.0 §2.6 step 2: "an alg with the value
        none MUST NOT be used for Logout Tokens". `handle_backchannel_logout`
        now drops `none` from the list; if nothing is left, every token is
        refused.
    -   `tests/blackout_runtime/test_backchannel_logout_alg.py` covers both
        cases, and a signed token still ending the session. Both tests fail
        on the code before the patch. `PATCHES.md` has the entry.
    -   It is upstream's gap too. It has not been reported to element-hq;
        whether to report it, privately, is the operator's decision.
-   **ID tokens: not changed.**
    -   Synapse takes the id_token only from the token endpoint's response,
        over the TLS connection that authlib's metadata validation requires
        (an `https` token endpoint, unless `skip_verification` is set).
    -   OIDC Discovery says `none` "MAY be supported but MUST NOT be used
        unless the Response Type used returns no ID Token from the
        Authorization Endpoint (such as when using the Authorization Code
        Flow)". OIDC Core §3.1.3.7 step 6 lets TLS server validation stand in
        for the signature for a token from the token endpoint.
    -   So refusing `none` here could break a compliant provider, and only
        someone who can break TLS to the token endpoint could exploit it.
-   **The shipped examples do not list `none`.** The homeserver template names
    Keycloak and Authentik. Read from source, not from running instances:
    -   Keycloak `main` at `a79e665` (`OIDCWellKnownProvider`) builds
        `id_token_signing_alg_values_supported` without `none`. It adds
        `none` only to the userinfo and request-object lists.
    -   Authentik `main` at `77fe944` (`providers/oauth2/views/provider.py`
        and `models.py`) lists one algorithm: the signing key's, or `HS256`
        when the provider has no signing key.

### `aud` is enforced only through `azp`

`_parse_id_token` passes `claims_options` with `iss` only, so authlib never
compares `aud` with the client id. Instead, `CodeIDToken.validate_azp` (the
same code in both versions) requires an `azp` equal to the client id whenever
`aud` is anything but the client id or a one-element list of it. When that
`azp` is present, `aud` itself is not checked.

So an id_token with `aud: "other"` and `azp: <client_id>` is accepted, and so
is `aud: [<client_id>, "other"]` with that `azp`. OIDC Core §3.1.3.7 step 3
says the token "MUST be rejected if the ID Token does not list the Client as
a valid audience, or if it contains additional audiences not trusted by the
Client". Upstream's `_parse_id_token` has the same `claims_options`.

**Not patched.** The rule here is the one applied to unsigned id_tokens above:
patch what an outside attacker can send, and record what only the configured
provider can produce. Such a token must still be signed with the provider's
key and arrive from its token endpoint. An `aud` entry in `claims_options`
would make authlib compare it with the client id. Whether extra audiences
should also be refused is a separate decision. Both are left as a follow-up.

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
-   **The stack that runs this image has no TLS listener.**
    `infra/single-server-baseline` mounts its own `homeserver.yaml`, with
    port 8008 at `tls: false`, and every nginx config that fronts Synapse
    reaches it with `proxy_pass http://`. The image's built-in config
    template does have a `tls: true` listener on 8448, unless
    `SYNAPSE_NO_TLS` is set. By the point above, it stays HTTP/1.1.
    `deploy/docker/blackout-backend` also uses `tls: false` on 8008, but it
    runs the upstream image, not this lock. (The first version of this
    record, and of the `.trivyignore` comment, said "every shipped listener
    is `tls: false`". That overstated it.)

HTTP/2 from clients terminates at nginx (`listen 443 ssl http2` in
`infra/single-server-baseline`). Rapid Reset against nginx itself is nginx's to
handle and is outside this record.

The entry is in `.trivyignore` with `exp:2026-11-30`, so the gate fails again
if Twisted 26.10.0 has not been locked by then. The other two lists that
`.trivyignore`'s header names do not get it: `osv-scanner.toml` and
`pnpm.auditConfig` cover `pnpm-lock.yaml` only. `security.yml` runs osv-scanner
with `--lockfile=pnpm-lock.yaml`. The three Twisted entries of 2026-10-25 were
handled the same way.

After review (`e6b6b5a`), those three entries carry the same
`exp:2026-11-30`, on their GHSA and CVE lines alike. Before, they had only a
prose "Review by 2026-12-31". On 2026-11-30 the gate would then have failed for
this advisory alone, while the other three stayed ignored with no date. Their
comment no longer calls 26.10.0rc1 their only fix. `security.yml`'s comment
now speaks of four advisories, fixed in a final release that is not locked
yet. Checked: with every Twisted `exp:` set to 2026-10-01, Trivy 0.69.3
reports the four Twisted advisories and nothing else.

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
before and after, before 2026-11-30. Then remove all four Twisted entries
from `.trivyignore`.

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

-   **`cargo check` against the real system libraries could not run.** This
    host has no GTK 3, WebKitGTK 4.1, libsoup 3, dbus-1 or appindicator
    development files, which tauri's Linux backends need. pkg-config finds
    none of them, and none was installed. A cross-target check for Windows,
    where zip is used, was not attempted: ring, behind the updater's default
    rustls backend, compiles C for the target, and this host has no Windows C
    compiler or SDK.
-   **`cargo check` with stub pkg-config files ran, after review.** A check
    does not link, so the `-sys` crates only need pkg-config to answer.
    It was run on a `git archive` export of the branch, with these inputs:

    -   32 stub `.pc` files, one per library the GTK, WebKit, dbus,
        appindicator and xdo crates ask for, each with no flags; the real
        OpenSSL was used;
    -   placeholder icons and an empty `frontendDist`, for
        `generate_context!`;
    -   `--locked --offline`, with its own target directory.

    It finished with no warning and no error, and the lock was unchanged.
    It compiled tauri 2.12.5, tauri-plugin-updater 2.14.1 and the app crate
    (`blackout-desktop`) for the Linux target. That type-checks `main.rs`
    against tauri 2.12.5's API. It is not a build: nothing was linked or
    run. zip is not compiled on Linux.

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

| Run                                                     | High/Critical reported                                                           | Exit |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| `develop` (`ff7d08b`)                                   | the six above                                                                    | 1    |
| this branch                                             | none                                                                             | 0    |
| this branch, `.trivyignore` emptied                     | 7: the four Twisted entries, image-size (2) and react-router, all ignored before | 1    |
| first version, the new entry's `exp:` set to 2026-10-01 | GHSA-vpp8-g58w-m8mp only                                                         | 1    |
| after review, every Twisted `exp:` set to 2026-10-01    | the four Twisted advisories only                                                 | 1    |

The last two rows show that Trivy 0.69.3 honours the `exp:` date, now on all
four Twisted entries. Nothing from authlib or zip remains with the ignore file
emptied. The runs after review used the same Trivy binary (its checksum
re-checked) and the same vulnerability DB, of 2026-10-30 19:07 UTC, which was
still the newest (its next update is due 2026-10-31 19:07 UTC). The scan read
six lockfiles: the fork's `poetry.lock` and `Cargo.lock`, the legacy API's
`requirements.txt`, the desktop `Cargo.lock`, `pnpm-lock.yaml` and
`services/perturbation/requirements.txt`.

## Validation

-   **Lock:** `poetry lock --check`, `.ci/scripts/check_lockfile.py` and
    `scripts-dev/check_locked_deps_have_sdists.py` (151 packages) pass.
-   **The auth tests, before and after:** 231 tests in 13 modules. All pass
    on both sides, and none is skipped, so authlib was loaded. After review,
    with the three new modules (`test_oidc_claim_types`,
    `test_backchannel_logout_alg`, `test_msc3861_client_assertion`): 239,
    all passing, none skipped. The original 13 modules:
    -   `tests.handlers.test_oidc`, `test_sso`, `test_auth` and
        `test_oauth_delegation`;
    -   `tests.rest.client.test_login` (JWT login lives here; there is no
        `tests/handlers/test_jwt.py`), `test_auth`, `test_auth_issuer` and
        `test_keys`;
    -   `tests.api.test_auth`, `tests.config.test_oauth_delegation`,
        `tests.rest.admin.test_jwks`, `tests.rest.test_well_known` and
        `tests.blackout_runtime.test_session_length`.
-   **The full trial suite, before and after** (`-j3`):

    |              | Tests | OK    | Skipped | Failure | Error |
    | ------------ | ----- | ----- | ------- | ------- | ----- |
    | before       | 3,350 | 3,034 | 173     | 110     | 34    |
    | after        | 3,350 | 3,034 | 173     | 110     | 34    |
    | after review | 3,358 | 3,042 | 173     | 110     | 34    |

    Compared test by test, every outcome is the same. After review, the
    failing, erroring and skipped tests are the same ones, by test id, as
    before, and the 8 added tests pass. The 144 failures and errors are the
    fork's existing ones (see the 2026-10-25 record). None is in an auth
    module.

-   **The new tests against the code they pin:**

    -   On the logout code before `d9eed10`, both `test_backchannel_logout_alg`
        tests fail: the unsigned token gets HTTP 200.
    -   Under authlib 1.6.12 (develop's lock, with the fix applied), the three
        `test_oidc_claim_types` refusals fail because the login completes. The
        string-`jti` control, both logout tests and both MSC3861 tests pass.

-   **`blackout_runtime_tests`:** 85 passed before and after, and again after
    review, run with `pytest -q` as the fork's
    `docs/ops/upstream_sync_runbook.md` says. pytest is not in
    the lock: 8.3.5 was added to each venv with `--no-deps`, because 9.x would
    have moved the locked `packaging`. `tests/blackout_runtime` is part of the
    trial suite above.
-   **Lint:** no root workflow lints or type-checks the fork, and the fork's
    own workflows never run. Every changed Python file is clean under the
    locked ruff 0.1.7, black 23.10.1 and isort 5.13.1: `test_oidc.py`,
    `oidc.py` and the three new test modules. After review, mypy (the
    locked version, with the fork's `mypy.ini` and its plugins) was run on
    `oidc.py` and the three new modules. It reports one error, in
    `stubs/txredisapi.pyi`; the same run on `develop` reports the same one.
-   **Desktop:** as in [Verification](#verification).
-   **gitleaks 8.21.2** over `origin/develop..HEAD`: no leaks, after review
    too. The MSC3861 test generates its RSA keys at run time, so no private
    key is committed.
-   **prettier 2.8.1**, the root's version, on the changed Markdown and YAML:
    clean.
-   **No pre-commit hook ran.** `core.hooksPath` is `.husky/_`, which this
    worktree does not have (pnpm's `prepare` script creates it), so git ran no
    hook. The hook's two steps were run by hand before each commit, and both
    passed: lint-staged's `prettier --write --ignore-unknown` on the staged
    files, and `tools/ci/check-auth-secrets.mjs`.

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
    is `develop`. The stub-library `cargo check` above found no compile error
    from this update, but in CI one would first show on a release build.
3.  **Two older ignores rest on reasons the advisory data no longer
    supports.** Both still apply to this branch's gate (see the emptied-file
    row in [The gate](#the-gate)), and both belong to `pnpm-lock.yaml`, not to
    the two lockfiles this record covers.

    -   **react-router GHSA-qwww-vcr4-c8h2, which lapses on 2026-10-31.**
        `.trivyignore` says the fix, react-router 8, needs a React 18 → 19
        migration. OSV (record modified 2026-09-10) and Trivy's DB now list
        **7.18.2** as fixed on the 7.x line, and the lock has 7.18.0. The same
        entry in `osv-scanner.toml` has `ignoreUntil = 2026-10-31`, and the
        OSV scanner step in `security.yml` is blocking. So from 2026-10-31 the
        Security checks workflow fails on every PR, this one included, until
        react-router moves to 7.18.2 or the ignore is re-justified.
    -   **image-size GHSA-5p2g-fcmc-qvqq and GHSA-w3rx-r6r6-pgpr.**
        `.trivyignore` and `osv-scanner.toml` say "No fixed version exists".
        OSV (records modified 2026-09-24) and Trivy now list **2.0.3** as the
        fix for both. The lock has 1.2.1, which metro pins to the 1.x line, so
        the premise to state is "fixed only in 2.x; metro requires 1.x".

    Neither is changed here. The `-v47` advisory branch, which covers
    `pnpm-lock.yaml`, reports both findings in its own record
    (`dependency-advisories-2026-10-30.md` on that branch). It asks the
    operator to choose a react-router option. Editing the same lines here
    would only conflict with it.

## Not verified

-   A desktop build or run on any platform, and the updater against a real
    release.
-   Whether libdbus-1-dev reaches the Linux release job through the packages
    it installs (`libwebkit2gtk-4.1-dev` and others), now that tauri 2.12
    links dbus by default.
-   A Docker build of the fork image, and Synapse against a real OIDC provider.
    In particular, the `none` and `aud`/`azp` behaviour was checked only
    against the test suite's fake provider and in direct probes of authlib.
    What Keycloak and Authentik advertise was read from their source.
-   MSC3861 against a real authorization server. The tests check the form
    Synapse posts, not a server's acceptance of it.
-   Twisted 26.10.0 against the trial suite.
