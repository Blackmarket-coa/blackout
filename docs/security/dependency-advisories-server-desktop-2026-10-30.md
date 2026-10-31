# Server and desktop dependency advisories — 2026-10-30

Scope: the six High/Critical findings that turned the **Trivy filesystem
scan** check (`security.yml`) red on 2026-10-30. They are in two lockfiles that
the PR which showed them does not touch: the Synapse fork's
`apps/blackout-server/poetry.lock` and the desktop app's
`blackout-desktop/src-tauri/Cargo.lock`. `develop` at `ff7d08b` fails the same
way. This follows `synapse-dependencies-triage-2026-10-25.md`, whose Twisted
entries this record extends.

After a fourth review it also covers five more High advisories against the
same `poetry.lock`. GitHub reviewed them after the Trivy database the gate used
(2026-10-30 19:07 UTC), so the gate did not report them: four against pyasn1
0.6.4, and a fourth against authlib 1.6.12. Trivy's database of 2026-10-31
01:14 UTC has all five, and on `develop` it reports them next to the six
(measured after the sixth review).

A fifth review (2026-10-31) found that the fourth review's JWT startup check
missed a key-set `kid` that is not a string, which left open the login bypass
that `develop` has, and three smaller gaps in the code and this record.

A sixth review (2026-10-31) found that one of Blackout's own templates, the
Railway service's, turned JWT login on with a secret anyone can read in the
repository, held back only by two unrelated faults in the same service. So
this record's statement that no Blackout template enables `jwt_config` was
false. It also found five smaller gaps. The answers to both reviews are in
[What the review changed](#what-the-review-changed).

| Package (lock)        | Advisory                              | Severity | Fixed in   | Outcome                                         |
| --------------------- | ------------------------------------- | -------- | ---------- | ----------------------------------------------- |
| authlib 1.6.12 (fork) | GHSA-6v38-4h7w-rj9h (CVE-2026-96760)  | Critical | 1.9.0      | bumped to 1.9.1                                 |
| authlib 1.6.12 (fork) | GHSA-7vr2-2fgp-9w7p (CVE-2026-114615) | High     | 1.9.0      | bumped to 1.9.1                                 |
| authlib 1.6.12 (fork) | GHSA-8m4g-j4wp-wgcg (CVE-2026-114616) | High     | 1.9.1      | bumped to 1.9.1                                 |
| authlib 1.6.12 (fork) | GHSA-c73q-w75p-j82v (CVE-2026-116672) | High     | 1.9.1      | not reachable; cleared by 1.9.1 (fourth review) |
| Twisted 26.4.0 (fork) | GHSA-vpp8-g58w-m8mp (no CVE)          | High     | 26.10.0rc1 | not reachable; ignored until 2026-11-30         |
| pyasn1 0.6.4 (fork)   | GHSA-fm9c-5rcf-2q5p (CVE-2026-119194) | High     | 0.6.5      | bumped to 0.6.5 (fourth review)                 |
| pyasn1 0.6.4 (fork)   | GHSA-9m75-vc3g-4x39 (CVE-2026-119195) | High     | 0.6.5      | same                                            |
| pyasn1 0.6.4 (fork)   | GHSA-2qm8-x737-gmw5 (CVE-2026-119196) | High     | 0.6.5      | same                                            |
| pyasn1 0.6.4 (fork)   | GHSA-mm57-4v3p-rchx (CVE-2026-119197) | High     | 0.6.5      | same                                            |
| zip 4.6.1 (desktop)   | GHSA-m665-v7pm-7grj (CVE-2026-115905) | Critical | 9.0.5      | zip 9.1.3, via tauri-plugin-updater 2.14.1      |
| zip 4.6.1 (desktop)   | GHSA-q7v9-x93c-xqv3 (CVE-2026-115909) | High     | 9.0.0      | same                                            |

**Result:**

-   **authlib moves to 1.9.1, the release upstream Synapse took on 2026-10-27.**
    The 2026-10-25 cap below 1.7 is lifted. Upstream's `b20ae98` (#20415) is
    ported: the lock entries and the one test change. The bump also clears five
    Moderate/Low authlib advisories published with the three above, and a
    fourth High that GitHub reviewed later, GHSA-c73q-w75p-j82v, in RFC 7592
    server code that Synapse does not use (fourth review).
-   **id_token claims are type-checked now, as upstream's are.** authlib 1.7+
    refuses an id_token whose `sub` or `jti` is not a string, or whose `aud`
    holds a non-string, even with `user_profile_method: userinfo_endpoint`.
    An integer id from the userinfo endpoint (GitHub-style OAuth2) still logs
    in when the provider sends no id_token. No claim check was loosened. Two
    that were already
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
-   **The Railway template's JWT login is off, and `enabled` must be a
    boolean (sixth review, `48ab32d`).** That template wrote
    `enabled: ${JWT_ENABLED:-false}` and `secret: "${JWT_SECRET:-}"`, and its
    entrypoint renders it with `envsubst`, which leaves both as text. Synapse
    read the string as on, with that literal as the HS256 secret; the startup
    check accepted it, and a token signed with it verified as any user. The
    service cannot start today, for two unrelated reasons (its listener port
    renders as text too, and its image has no authlib), and each alone stops
    it; fixing both, which making the service work needs, would have opened
    that login. It is not one of the advisories, but it is the kind of hole
    they are. `JWTConfig` now refuses an `enabled` that is not a YAML
    boolean, and the template writes `enabled: false`. Every other
    `${VAR:-default}` in the template, all deploy defects, is
    [found outside scope](#found-outside-scope-not-fixed-here).
-   **JWT login and the logout token change too.** The first two versions of
    this record said they did not. Under 1.9.1 both refuse a boolean `exp`,
    `nbf` or `iat`, and an HMAC secret that is empty or holds PEM or SSH key
    text made every JWT login answer 500. A fork patch now refuses such a
    secret at startup by making the login's own verify call once. Since the
    third review that covers a secret given as a JWK too, and an empty or
    missing secret is refused on any authlib version. Provider metadata
    validation now accepts more
    `http://` loopback URLs (no port, or `[::1]`). See
    [JWT login, the logout token and provider metadata](#jwt-login-the-logout-token-and-provider-metadata).
    After the fourth review, `algorithm: none` is refused at startup too:
    with it an unsigned token logged in as any user. And a key set is
    refused only when none of its keys can be used. The third review's
    version refused a set that `develop` serves, for one key HS\* cannot
    use; that key is now a warning. After the fifth review, a key-set member
    whose `kid` is not a string is refused too (`6484756`). The check had
    tried only the string `kid`s, and authlib matches a token's `kid` with
    `==`: `k: "AA"` (one zero byte, which HMAC pads into the empty key)
    under `kid: 5`, beside a usable key, started, and a token with `kid` 5
    signed with the empty key logged in as anyone. `develop`, with no
    check, lets the same token in.
-   **A logout token whose key authlib cannot use gets 400, not 500 (fork
    patch).** An unknown `kid`, or HS256 naming the provider's EC key, raised
    `ValueError` past the handler. Each such token still makes Synapse refetch
    the provider's JWKS once; that is [recorded, not patched](#malformed-logout-tokens).
-   **MSC3861 refuses at startup a client credential that cannot sign (fork
    patch, third review).** Under 1.9.1 a `private_key_jwt` JWK whose `alg`
    is not RS256 let the homeserver start and then answer every
    authenticated request with 503. Such a JWK, a JWK that cannot sign at
    all, and an empty `client_secret` are now refused when the config loads.
    No shipped configuration enables MSC3861 on the fork image. Since the
    fifth review the fork's signer is annotated as returning `str`, which
    it has under authlib 1.7+ (`823530e`); nothing behaved differently. See
    [Two side effects](#two-side-effects).
-   **pyasn1 moves to 0.6.5 (fourth review).** GitHub reviewed four High
    advisories against 0.6.4, all quadratic CPU in pyasn1's decoder, between
    23:03 and 23:07 UTC on 2026-10-30, four hours after the Trivy database
    the gate used. Trivy's database of 2026-10-31 01:14 UTC has them, and
    reports all four on `develop`; this branch passes on it (sixth review).
    `service_identity`
    decodes the SRV-ID of each peer certificate the hostname check reads,
    with no schema. A probe of that call took 4.4 s of CPU for a 100 KB
    crafted certificate under 0.6.4, and 0.14 s under 0.6.5. A peer reaches
    it only with a certificate that chains to a root Synapse trusts. See
    [pyasn1](#pyasn1-quadratic-decoding).
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
-   **The gate passes on the newest database (sixth review).** Trivy
    0.69.3, run as `security.yml` runs it over a `git archive` of
    `ae70358`, reports no un-ignored High/Critical finding against the
    database of 2026-10-31 01:14 UTC, the newest when it was downloaded at
    03:07 UTC. That database has the five advisories added in the fourth
    review, and over `develop` the same run reports eleven findings: the six
    above and those five. The earlier rounds ran against the database of
    2026-10-30 19:07 UTC. This record called it "still the newest" at the
    fifth review's run (02:09 UTC), which reused a cache from 00:58 UTC and
    never looked for another; that was not checked, and the 01:14 UTC
    database was downloadable by 02:19 UTC ([The gate](#the-gate)). OSV,
    queried on 2026-10-31 between 00:35 and 00:58 UTC over every package of
    the five lockfiles other than `pnpm-lock.yaml`, lists on this branch no
    advisory whose GHSA severity is High or Critical beyond the four ignored
    Twisted entries and black, a dev dependency, which Trivy skips. That
    sentence counts GHSA severity labels only (corrected after the fifth
    review). RustSec advisories carry none, and four in the desktop lock
    score High or have no rating: RUSTSEC-2026-0194 and -0195 (quick-xml),
    RUSTSEC-2026-0382 (rustls-webpki) and RUSTSEC-2026-0383
    (webpki-root-certs). Trivy does not load RustSec-only advisories. The
    same lock also has eight GHSA-rated Moderate and Low advisories, below
    the gate's severity (sixth review). All are on `develop` at the same
    versions, and they are
    [found outside scope](#found-outside-scope-not-fixed-here) with their
    exposure. `pnpm-lock.yaml` is `-v47`'s and was not queried here.
-   **The Trivy check now runs on more pull requests (fourth review,
    `b3cd1b3`).** A PR that changed only `blackout-desktop/**`,
    `services/**` or `.trivyignore` got no Trivy result before the push to
    `develop`: `security.yml`'s paths filter listed none of them.
-   **The desktop app builds and links on Linux (third review).**
    `cargo build --release --locked` ran on Ubuntu 24.04 with the workflow's
    apt packages: tauri 2.12.5, wry 0.57.1, tao 0.37.2 and
    tauri-plugin-updater 2.14.1 compiled with no warning and the binary
    links WebKitGTK 4.1, GTK 3, libsoup 3 and libdbus. It was not run, and
    nothing was built for Windows, where zip is compiled, or macOS. No CI
    job builds the desktop app before a release tag, so the release job's
    own build is still the first on ubuntu-22.04 and the other platforms;
    see [Before merge or release](#before-merge-or-release).
-   **The two id_token gaps are now in `KNOWN_LIMITATIONS.md`** ("OIDC sign-in
    checks") and in `THREAT_MODEL.md`'s OIDC tokens row, which said only "OIDC
    sigs". Since the fourth review the same `KNOWN_LIMITATIONS.md` section
    also says what the bump refuses: an id_token whose `sub` or `jti` is not
    a string, or whose `aud` has a non-string member.
-   **Found outside scope, not fixed here:** the desktop updater's public key
    in `tauri.conf.json` is a literal `${TAURI_UPDATER_PUBKEY}` placeholder; no
    PR job compiles the desktop crate; and two older ignores rested on reasons
    the advisory data no longer supports. The `-v47` branch (PR #994) fixes
    the react-router one (react-router 7.18.2, `71548f0350`) and corrects
    `.trivyignore`'s header (`26e6ce5`). The plan is to merge this branch
    into PR #994, so that the two land together. After the fifth review the
    list also has the four RustSec advisories above: the quick-xml code
    paths do not run, webpki-root-certs is not built for any desktop target,
    and rustls-webpki is reached only by the updater on Linux, which nothing
    calls. After the sixth review it also has the desktop lock's eight
    GHSA-rated Moderate and Low advisories, and every other
    `${VAR:-default}` in the Railway template: the listener port, the
    database name, user and port, the Redis port and TURN render as text,
    so that service cannot start as rendered. See
    [Found outside scope](#found-outside-scope-not-fixed-here).

Commits, on top of `ff7d08b`: `21c9591` (authlib, with the `PATCHES.md`
entry), `5ed6382` (the Twisted triage), `e4bc2c0` (the desktop lock) and
`73e5b29` (this record, first version, with the 2026-10-25 record's addendum).
After review: `ad9bf75` (tests for the paths authlib 1.9.1 rewrote, and the
corrected `PATCHES.md` entry), `d9eed10` (the logout-token fix), `e6b6b5a` (the
Twisted ignore records) and `b1cad1e` (the record). After the second review:
`85df7cc` (400 for an unusable logout-token key), `5bad47c` (the JWT secret
check, and the corrected `PATCHES.md` authlib entry), `b37a2cd` (the Twisted
comments in `pyproject.toml` and `.trivyignore`), then `cfd9ab0` (the
record, with `KNOWN_LIMITATIONS.md` and `THREAT_MODEL.md`). After the third
review: `93d3024` (the JWT secret check rewritten), `7babe24` (MSC3861 client
credentials), `3ca628a` (the authlib comment in `pyproject.toml`), `4403f4c`
(the release each authlib refusal arrived in, in the docstrings and
`PATCHES.md`), then `4c69c78` (the record). After the fourth review:
`a8ba5a3` (pyasn1 0.6.5, with its `PATCHES.md` entry), `d084e96` (the JWT
algorithm and key-set checks), `bd9ceae` (GHSA-c73q and `prepare_raw_key` in
the authlib `PATCHES.md` entry), `b3cd1b3` (the Security checks paths filter),
then `b0b738f` (the record, with `KNOWN_LIMITATIONS.md` and the 2026-10-25
record's addendum). After the fifth review: `6484756` (the JWT key-set `kid`
type, with its `PATCHES.md` entry), `823530e` (the MSC3861 signer's return
type, with the authlib `PATCHES.md` entry), then `05dfc10` (the record).
After the sixth review: `48ab32d` (`jwt_config.enabled` must be a boolean,
and the Railway template's JWT login is off, with `PATCHES.md`), `ae70358`
(the operator notes in `docs/upgrade.md`), then this version of the record,
with one sentence of `PATCHES.md` corrected (below).

## What the review changed

A review of the first version found seven problems. Each is answered here:

| Finding                                                                               | Now                                                                                                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| An unsigned token passes when the provider lists `none`; the logout endpoint is open. | Logout tokens: fixed (`d9eed10`). ID tokens: explained, [not changed](#the-signature-check-accepts-none-when-listed).   |
| The record and `PATCHES.md` said `aud` is verified; it is only enforced via `azp`.    | Reworded in both, and [explained](#aud-is-enforced-only-through-azp). Not patched.                                      |
| The react-router and image-size ignores rest on stale reasons.                        | Left to the `-v47` advisory work, which found the same; see [Found outside scope](#found-outside-scope-not-fixed-here). |
| The 2026-10-25 Twisted ignores had no expiry, and their wording was stale.            | They expire with the HTTP/2 entry (`e6b6b5a`); `security.yml`'s comment is corrected.                                   |
| The behaviour change named the integer `sub` alone.                                   | [The list](#the-claim-type-checks) now has `jti` and `aud` too, measured on both versions.                              |
| The `private_key_jwt` deprecation warning fires per request, not once.                | [Recorded](#two-side-effects), with the fix to make if that path is ever enabled.                                       |
| No test drove MSC3861 client-assertion signing, or an integer `sub` in an id_token.   | Both are tested now (`ad9bf75`).                                                                                        |

A second review found seven more. Each is answered here:

| Finding                                                                                                                                                      | Now                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pyproject.toml`'s Twisted comment still called 26.10.0 a pre-release and named three advisories.                                                            | It names all four, says 26.10.0 is final and not locked, and gives the ignore's expiry (`b37a2cd`).                                                                                       |
| This record said `-v47` asks the operator to choose a react-router option; `-v47` has since bumped it. `.trivyignore`'s header says every entry is mirrored. | [Found outside scope](#found-outside-scope-not-fixed-here) points at `71548f0`. The header is `-v47`'s to correct (`26e6ce5`); the Twisted block now says it is not mirrored (`b37a2cd`). |
| A logout token with an unknown `kid`, or HS256 naming an EC key, got a 500 and a JWKS refetch.                                                               | 400 now (`85df7cc`). The refetch is [recorded, not patched](#malformed-logout-tokens).                                                                                                    |
| The two id_token gaps were not in `THREAT_MODEL.md` or `KNOWN_LIMITATIONS.md`.                                                                               | Both are, in this version.                                                                                                                                                                |
| `PATCHES.md` and this record said JWT login and the logout token were unchanged.                                                                             | Corrected: boolean time claims are refused, and an unusable HMAC secret gave 500. That secret is now refused at startup (`5bad47c`).                                                      |
| Metadata validation's new acceptance of `http://` loopback URLs was not recorded.                                                                            | [Recorded](#jwt-login-the-logout-token-and-provider-metadata), in `PATCHES.md` too. No code change.                                                                                       |
| The desktop lock was only checked, never built, and no CI job builds it before a release.                                                                    | Still true. The build to run, and how not to run it, are under [Before merge or release](#before-merge-or-release).                                                                       |

A third review found six more, and asked for a real desktop build. Each is
answered here:

| Finding                                                                                                                                                                                                                       | Now                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The JWT secret check missed a secret given as a JWK. `{kty: oct, k: ""}`, its JSON text, or a PEM `k` passed startup and gave 500 per login under 1.9.1; under 1.6.12 the empty `k` logged in with a token anyone could sign. | The check makes the login's own verify call now, and refuses an empty or missing secret first (`93d3024`). [Below](#jwt-login-the-logout-token-and-provider-metadata).                                                                              |
| The second round's report said the secret is refused at startup "on any authlib version".                                                                                                                                     | Not repeated in this record or `PATCHES.md`. Only an empty or missing secret, and every empty-key form, are refused on any version. PEM or SSH text after the first byte is refused only under the locked `>=1.9.1`.                                |
| The gate passes partly through the react-router ignore, whose reason is stale, and `.trivyignore`'s header contradicts the Twisted block.                                                                                     | Not changed here. `-v47` (PR #994) fixes both (`71548f0350`, `26e6ce5`), and this branch is to be merged into PR #994. [Found outside scope](#found-outside-scope-not-fixed-here).                                                                  |
| MSC3861 `private_key_jwt` with a JWK whose `alg` is not RS256: every authenticated request 503 under 1.9.1. This record said the assertion is "the same on both" and the change "log noise only".                             | Refused at startup (`7babe24`); both sentences corrected in [Two side effects](#two-side-effects). Upstream never ran MSC3861 on authlib 1.7+, so there was nothing to port.                                                                        |
| MSC3861 `client_secret_jwt` with an empty secret fails every request.                                                                                                                                                         | Measured through a homeserver: it never got that far. `MSC3861DelegatedAuth` asserts the secret, so the homeserver stopped at setup on both versions (run for `client_secret_jwt` and `client_secret_post`). It is a `ConfigError` now (`7babe24`). |
| `pyproject.toml` said an integer `sub` from the userinfo endpoint is "still accepted", without the condition.                                                                                                                 | Reworded there and in `PATCHES.md` (`3ca628a`): only when the provider sends no id_token.                                                                                                                                                           |
| (Asked for, not a finding) a real desktop build, which round three could not do for want of disk and system libraries.                                                                                                        | Done on Linux: it compiles and links with no warning. [Verification](#verification).                                                                                                                                                                |

A fourth review found eight more. Each is answered here:

| Finding                                                                                                                                              | Now                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Four High pyasn1 advisories, reviewed after the gate's Trivy database, would turn the gate red at the next one, and the record did not mention them. | pyasn1 0.6.5 (`a8ba5a3`), and [their own section](#pyasn1-quadratic-decoding), with the SRV-ID decode measured.                                        |
| authlib GHSA-c73q (High), also fixed by 1.9.1, was in neither this record nor `PATCHES.md`.                                                          | In both, with why it is not reachable (`bd9ceae`).                                                                                                     |
| `algorithm: none` passed the JWT startup check, and an unsigned token then logged in as any user.                                                    | Refused at `jwt_config.algorithm`, with every name authlib does not implement (`d084e96`). [Below](#jwt-login-the-logout-token-and-provider-metadata). |
| "Our exposure" named four modules that import authlib; `config/jwt.py` is a fifth, and it uses `prepare_raw_key`.                                    | [Five now](#our-exposure); the cap's reasons name `prepare_raw_key`.                                                                                   |
| The Trivy check did not run on a PR that changes only the desktop lock, `services/` or `.trivyignore`.                                               | The paths filter lists them (`b3cd1b3`).                                                                                                               |
| The record did not say that the upstream image which `deploy/docker/blackout-backend` runs still ships authlib 1.6.12.                               | [Said](#our-exposure), with why it is not exposed and when it moves.                                                                                   |
| The JWT secret check refused a key set that `develop` serves, because one member could not be used for HS\*.                                         | That member is a warning naming its `kid` now; a set with no usable key is still refused (`d084e96`).                                                  |
| `KNOWN_LIMITATIONS.md` did not say that an id_token with a non-string `sub`, `jti` or `aud` member can no longer sign in.                            | It does.                                                                                                                                               |

A fifth review found four more. Each is answered here:

| Finding                                                                                                                                                                                                                                                                                                         | Now                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The JWT startup check tried a key set only under its string `kid`s. authlib matches a token's `kid` with `==`, so `k: "AA"` under `kid: 5` or `kid: true`, beside a usable key, started, and an empty-key token whose `kid` is 5, `true` or 1 logged in as anyone. `develop` has no check and the same opening. | Such a member is refused at startup, naming its index, before any other key-set check (`6484756`). [Below](#jwt-login-the-logout-token-and-provider-metadata). |
| `PrivateKeyJWTWithKid.sign` is annotated `-> bytes`, but under 1.9.1 both MSC3861 signers return `str`. Neither this record nor `PATCHES.md` said so.                                                                                                                                                           | Annotated `-> str` (`823530e`), and recorded in both. No behaviour changed. [Two side effects](#two-side-effects).                                             |
| "OSV lists no High/Critical beyond" counted GHSA severity labels only; four RustSec advisories in the desktop lock score High or are unrated.                                                                                                                                                                   | The sentence says what it counts, and the four are [found outside scope](#found-outside-scope-not-fixed-here), each with its path and exposure.                |
| The record called the HTTP-test failures the fork's. The federation-agent ones come from this sandbox's proxy variables, so no passing test reaches the certificate check after a handshake.                                                                                                                    | [Validation](#validation) gives the cause, with the evidence, and says that those TLS tests could not run here.                                                |

A sixth review found six more. Each is answered here:

| Finding                                                                                                                                                                                                                                                                                                                                                           | Now                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This record and `PATCHES.md` said no Blackout template enables `jwt_config`. The Railway template does: `envsubst` leaves `${JWT_ENABLED:-false}` and `${JWT_SECRET:-}` as text, so JWT login rendered as on with a secret anyone can read, and the startup check accepted it. Only a broken listener port and a missing authlib keep that service from starting. | `jwt_config.enabled` must be a YAML boolean, and the template writes `enabled: false` (`48ab32d`). Both statements are corrected ([Our exposure](#our-exposure), [JWT login](#jwt-login-the-logout-token-and-provider-metadata)), and the template's other renders are [found outside scope](#found-outside-scope-not-fixed-here). |
| The Trivy database timeline was wrong. `NextUpdate` is when the client looks again, not when a database comes out, and a newer one (2026-10-31 01:14 UTC) was out before the fifth review's run.                                                                                                                                                                  | Run on it: no finding on this branch, eleven on `develop` ([The gate](#the-gate)). The item is gone from [Not verified](#not-verified).                                                                                                                                                                                            |
| Found outside scope gave seven RustSec notices as the rest of OSV's report for the desktop lock. OSV also has eight GHSA-rated Moderate and Low advisories there, four of them against rustls on the updater's TLS path.                                                                                                                                          | [Listed](#found-outside-scope-not-fixed-here), each with its path and exposure.                                                                                                                                                                                                                                                    |
| "How the updater uses zip" cited the tauri-plugin-updater 2.10.0 source; 2.14.1 is locked.                                                                                                                                                                                                                                                                        | [It cites 2.14.1](#how-the-updater-uses-zip), with line references. The conclusion is the same.                                                                                                                                                                                                                                    |
| The non-string `kid` refusal stops at startup key sets that `develop` starts and serves, whatever their keys.                                                                                                                                                                                                                                                     | Kept, to fail closed. `PATCHES.md`, [this record](#jwt-login-the-logout-token-and-provider-metadata) and the operator notes say so now.                                                                                                                                                                                            |
| Configurations refused at startup or at sign-in since the bump were written down only in `PATCHES.md` and this record, not in the fork's operator upgrade guide.                                                                                                                                                                                                  | `apps/blackout-server/docs/upgrade.md` has an "Upgrading to authlib 1.9.1 (2026-10-30)" section, with each error text and its fix (`ae70358`).                                                                                                                                                                                     |

`48ab32d`'s commit message says that fixing either of the Railway service's
two faults would have opened JWT login. Each alone stops startup, so it would
take both; the `PATCHES.md` entry it added said the same and is corrected in
this version.

---

## Method

-   **Scanner:** Trivy 0.69.3, the version the failing CI run used, from the
    GitHub release, checked against `trivy_0.69.3_checksums.txt`. Its vulnerability DB was
    published 2026-10-30 19:07 UTC; after the sixth review, the one of
    2026-10-31 01:14 UTC, over `git archive` exports of this branch and of
    `develop`, with no flag beyond `security.yml`'s. Run with `security.yml`'s flags: `fs`,
    `--scanners vuln`, `--severity CRITICAL,HIGH`, `--ignore-unfixed`,
    `--ignorefile .trivyignore`, `--exit-code 1`, over the repository root.
    The only addition was `--skip-dirs node_modules,.git`; this worktree's
    `node_modules` holds nothing but prettier's cache. On `develop` it reports
    exactly the six findings above.
-   **Advisory text:** the OSV API (`/v1/query`, `/v1/vulns/<id>`), GitHub's
    records in `github/advisory-database` (from `raw.githubusercontent.com`),
    and NVD's API for the five that have CVEs. GitHub's and OSV's affected
    ranges are identical for all six. GitHub's advisory pages and REST API were
    not reachable from this session. After the fourth review, OSV's
    `/v1/querybatch` over every package of the fork's `poetry.lock` and
    `Cargo.lock`, the desktop `Cargo.lock` and both `requirements.txt`
    files, and `/v1/vulns/<id>` for each hit; the five new advisories were
    read in full there. After the fifth review the same sweep ran again on
    2026-10-31 at 02:09 UTC, now with each advisory's CVSS v3 base score
    computed from its vector, so that advisories with no GHSA severity are
    counted too.
-   **Upstream Synapse:** `element-hq/synapse` `develop` at `1a5fec6`, read
    through git (a blobless clone) and `raw.githubusercontent.com`. Re-checked
    after review at `cc172f7` (2026-10-30 20:47 UTC): `oidc.py` and the lock's
    authlib and Twisted are unchanged since `1a5fec6`. Fetched again on
    2026-10-31 at 00:40 UTC: `develop` is still `cc172f7`, and locks pyasn1
    0.6.4.
-   **Crates:** the crates.io API for `tauri-plugin-updater`, `zip` and
    `tauri` versions and dependency lists. The updater sources that were read
    (2.10.0 and 2.14.1) came from `static.crates.io`, and each one's sha256
    matches the checksum in `Cargo.lock` before and after.
-   **Python:** PyPI's JSON API for authlib, joserfc, Twisted, h2,
    priority and, after the fourth review, pyasn1 and pyasn1-modules. The
    lock was regenerated with poetry 1.3.2, the version `docker/Dockerfile`
    installs.
-   **envsubst (sixth review):** gettext-base 0.21-14ubuntu2 from Ubuntu's
    archive, fetched with `apt-get download` into a scratch directory and
    not installed; its sha256 matches apt's index. The Railway image installs
    Debian bookworm's gettext-base 0.21-12, the same upstream release. Each
    render was parsed with `HomeServerConfig`, on this branch's code and with
    `05dfc10`'s `config/jwt.py`.
-   **Tests:** trial under Python 3.11.17 (the image builds on 3.11), in two
    venvs built from the lock before and after. Each venv installs the
    Dockerfile's `poetry export --extras all` plus the dev group, minus
    psycopg2 and pyicu, whose system headers are not installed here. Each tree was installed with
    `pip install --no-deps -e .` and trial ran from a copy of it. Each heavy
    run started only when the machine's 1-minute load was under 3. The one
    exception was a 16-second first attempt, before the tree was installed;
    it errored on the missing package metadata and was discarded. After the
    fourth review, a copy of the after venv with pyasn1 0.6.5 installed
    from the lock's hashes, and nothing else changed (`pip check` clean).

## authlib

### The advisories

| Advisory            | Vulnerable code                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-6v38-4h7w-rj9h | `JsonWebSignature.deserialize_json()` returns the payload as verified when the JWS JSON serialization has an empty `signatures` array. No key is consulted.                                                                                                                     |
| GHSA-7vr2-2fgp-9w7p | `OctKey.import_key()` refuses PEM or SSH key text as an HMAC secret only when it starts at byte 0. With one leading byte, a public key becomes the HS256 secret.                                                                                                                |
| GHSA-8m4g-j4wp-wgcg | `OctKey.import_key()` and the HMAC algorithms accept a zero-length key, so anyone can compute a valid HS256/384/512 signature when the verifier's key is empty.                                                                                                                 |
| GHSA-c73q-w75p-j82v | The documented examples for RFC 7592's `ClientConfigurationEndpoint` look the target client up by `client_id` and never check that the registration access token was issued to it. 1.9.1 makes that check itself (`token.check_client(client)`). Added after the fourth review. |

GHSA-7vr2 also needs a verifier that accepts both HS\* and asymmetric
algorithms, such as authlib's module-level `jwt` object, and a verification key
passed as PEM or certificate text.

Each of the first three was reproduced against the two locked versions.
GHSA-c73q was not: nothing here has such an endpoint.

| Probe                                                                 | 1.6.12   | 1.9.1                                                        |
| --------------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| `deserialize_json` with `"signatures": []`                            | accepted | `BadSignatureError`                                          |
| `JsonWebToken(["HS256"]).decode(token, key="")`, as `jwt.py` calls it | accepted | `ValueError: oct key material must not be empty`             |
| `CodeIDToken` with an integer `sub`, as `oidc.py` validates it        | accepted | `InvalidClaimError: Claim 'sub' must be a StringOrURI value` |

### Our exposure

authlib is imported by five production modules of the fork. Until the fourth
review this list had four, and left out the fork's own startup check:

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
    configured JWK, an import check, and since `7babe24` one
    `private_key_jwt_sign` call at startup.
-   `synapse/config/jwt.py`, at startup only (fork patch, `5bad47c` and
    later): `JsonWebSignature.ALGORITHMS_REGISTRY` for the algorithm check,
    and for HS\*, `prepare_raw_key` and one
    `JsonWebToken([algorithm]).decode()` per distinct string `kid`, of a
    token it signs itself with the empty key. Since the fifth review a key
    set with a `kid` that is not a string is refused before any decode.

**The production image installs authlib.** `docker/Dockerfile` runs
`poetry export --extras all`, and `all` includes the `oidc` and `jwt` extras.
`infra/single-server-baseline/deploy.sh` builds it as `blackout-synapse:stable`,
and that stack's `homeserver.yaml.template` configures `oidc_providers`.
`services/blackout-server/Dockerfile` exports without extras, so it has no
authlib, and Synapse stops at startup on that service's own `jwt_config`
(`DependencyException ['authlib']`, with `enabled: false` too; sixth review).
`deploy/docker/blackout-backend` runs the upstream image, not the fork.

**That upstream image still ships authlib 1.6.12** (added after the fourth
review). `deploy/docker/blackout-backend/docker-compose.yml` pins
`ghcr.io/element-hq/synapse:v1.163.2`. Upstream's lock at `v1.163.2`, and at
`v1.164.1`, its newest release, has authlib 1.6.12, pyasn1 0.6.4 and Twisted
26.4.0, and no `h2`. So that image carries the three authlib advisories above
and GHSA-c73q, and the filesystem gate never sees it. They are not reachable
there: its `homeserver.yaml.template` sets no `jwt_config` and no
`oidc_providers`, and it delegates authentication to
`matrix_authentication_service` with a shared secret, so none of the authlib
calls above runs. Its pyasn1 exposure is the one
[below](#pyasn1-quadratic-decoding), on its outbound TLS connections. It moves
when upstream releases a version on authlib 1.9.1 (upstream `develop` has been
on it since `b20ae98`) and pyasn1 0.6.5; the compose file pins the tag, so
that is a change to make then. Its Twisted exposure is not assessed here.

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
-   **GHSA-c73q (High, fourth review): not reachable.** It is in authlib's
    authorization-server code. Synapse is an OAuth client and OIDC relying
    party: `synapse/` and `blackout_runtime/` import only client-side
    authlib modules (`ClientAuth`, `prepare_grant_uri`, PKCE, the RFC 7523
    client assertions, `IntrospectionToken`), and nothing names `rfc7591`,
    `rfc7592` or `ClientConfigurationEndpoint`. 1.9.1 clears it anyway.
-   **GHSA-8m4g (High): reachable only through operator configuration.**
    `config/jwt.py` reads `jwt_config.secret` verbatim and does not reject an
    empty string. A homeserver with JWT login on, an HS\* algorithm and an
    empty secret (for example, a template variable that rendered empty) would
    accept a token anyone can sign, for any user. Until the sixth review
    this said that no Blackout template enables `jwt_config`. One does:
    `apps/blackout-server/services/blackout-server/homeserver.yaml.template`,
    in the image `railway.toml` deploys, rendered `enabled` as the string
    `${JWT_ENABLED:-false}`, which is on, and the secret as the literal
    `${JWT_SECRET:-}`. That secret is not empty, so GHSA-8m4g itself does
    not apply, but anyone who reads the template can sign a login token
    with it. Two unrelated faults block it today, each on its own: the same
    render breaks the listener's port, which Synapse refuses first, and that
    image has no authlib, so `check_requirements("jwt")` stops startup.
    Since `48ab32d` the template writes `enabled: false`, and `JWTConfig`
    refuses an `enabled` that is not a boolean, so fixing both faults no
    longer opens JWT login. OIDC id_tokens are checked only against the provider's
    JWKS, never against `client_secret`. With 1.9.1 such a configuration fails
    closed. authlib raises `ValueError` for the empty key, which `jwt.py` does
    not catch (it catches `JoseError`), so each JWT login ends in an error
    rather than a session. The first version said that was read from the code,
    not run. It has been run since: HTTP 500 `M_UNKNOWN`, for a valid token as
    for any other. After the second review the fork refuses such a secret at
    startup instead, and after the third it does so through the login's own
    verify call, so a secret given as a JWK is covered as well
    ([below](#jwt-login-the-logout-token-and-provider-metadata)). An empty or
    missing secret is refused on any authlib version.

### What was done

-   `pyproject.toml`: `authlib = ">=1.9.1,<1.10"`. 1.9.1 is the newest
    release (still on 2026-10-31); 1.10 does not exist yet, so the cap is
    below a minor nobody here has checked. Upstream has no cap. The cap also
    covers `config/jwt.py`'s startup check, which uses
    `authlib.jose.rfc7519.jwt.prepare_raw_key` and
    `JsonWebSignature.ALGORITHMS_REGISTRY`. Neither is in authlib's
    documented API, so a minor release could move either (fourth review).
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
-   After the second review, two fork patches that the bump made worth having:
    `synapse/config/jwt.py` refuses an HMAC secret authlib cannot use, and
    `handle_backchannel_logout` answers a key it cannot use with 400. Each has
    its own `PATCHES.md` entry and test.
-   After the third review: the JWT secret check is rewritten to make the
    login's own verify call, and `config/experimental.py` refuses an MSC3861
    client credential that cannot sign. Again each has its `PATCHES.md`
    entry and tests.
-   After the fifth review: the JWT check refuses a key-set `kid` that is
    not a string (`6484756`), and `PrivateKeyJWTWithKid.sign` is annotated
    as returning `str` (`823530e`). Both are in `PATCHES.md`; the first has
    tests.

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
    a Matrix user when it sends no id_token (scopes without `openid`, or a
    plain OAuth2 provider). The subject template renders it as a string.
    With the `openid` scope an OIDC provider's id_token carries the same
    `sub`, and the login is refused even under
    `user_profile_method: userinfo_endpoint`. The third review ran both
    through the callback, and this round again: with `scope=""` the integer
    maps to external id `1234` on both versions; with `openid` it maps under
    1.6.12 and renders `invalid_token` under 1.9.1. The comment over authlib
    in `pyproject.toml` said only "still accepted", and gives the condition
    now (`3ca628a`).
-   JWT login (`jwt.py`) and the logout token are not affected by these
    string checks. They validate with authlib.jose's `JWTClaims`, which
    accepts an integer `jti` on both versions. They do change in other ways,
    listed [below](#jwt-login-the-logout-token-and-provider-metadata). The
    first two versions of this record said they were "not affected", without
    that qualification, which was wrong.

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

### JWT login, the logout token and provider metadata

Found by the second review, and each measured here under both locked versions
with a probe of the exact call (`JsonWebToken(["HS256"]).decode(token,
key=secret, claims_cls=JWTClaims)` then `validate(leeway=120)`, as `jwt.py`
does; `JWTClaims.validate`, which `LogoutToken` extends; and
`OpenIDProviderMetadata`'s four URL checks, as `_validate_metadata` calls
them). The release each change arrived in was read from the 1.7.2, 1.8.0 and
1.9.0 wheels.

| Case                                                                                | 1.6.12                        | 1.9.1                         |
| ----------------------------------------------------------------------------------- | ----------------------------- | ----------------------------- |
| JWT login or logout token, `iat: true` or `nbf: true`                               | accepted                      | refused (`InvalidClaimError`) |
| JWT login or logout token, `exp: true`                                              | refused (`ExpiredTokenError`) | refused (`InvalidClaimError`) |
| JWT login or logout token, integer `jti`                                            | accepted                      | accepted                      |
| JWT login, HS256 secret `""`, token signed with it                                  | accepted: anyone can sign     | `ValueError`: HTTP 500        |
| JWT login, secret `abc-----BEGIN xyz` or `my ssh-rsa shared secret`                 | accepted                      | `ValueError`: HTTP 500        |
| Metadata URL `http://localhost/`, `http://127.0.0.1/realms/x`, `http://[::1]:8080/` | refused (`MUST use "https"`)  | accepted                      |
| Metadata URL `http://localhost:8080/`, `https://idp.example/`                       | accepted                      | accepted                      |
| Metadata URL `http://idp.example/`, `http://localhost.evil.test/`                   | refused                       | refused                       |
| Metadata URL `https:///path` (no host)                                              | accepted                      | refused                       |

-   **Boolean time claims (1.9.0).** `_validate_numeric_time` now excludes
    `bool`, so JWT login and the back-channel logout token refuse a boolean
    `exp`, `nbf` or `iat` with a 403 or 400. An id_token is not affected.
    Measured here in `_parse_id_token`'s shape: `iat: true` and `nbf: true`
    are accepted and `exp: true` is refused, on both versions (1.9.1 checks
    them with joserfc, whose number check takes a boolean).
-   **HMAC keys (1.9.0 and 1.9.1).** `OctKey` refuses a key that contains
    `-----BEGIN `, `---- BEGIN `, `ssh-rsa `, `ssh-dss `, `ssh-ed25519 ` or
    `ecdsa-sha2-` anywhere (1.9.0, the GHSA-7vr2 fix; 1.6.12 checked only the
    start), or that is empty (1.9.1, the GHSA-8m4g fix). It raises
    `ValueError` on every sign or verify. `jwt.py` catches only
    `BadSignatureError` and `JoseError`, so with such a `jwt_config.secret`
    every JWT login answered 500 `M_UNKNOWN`. That was run here through
    `/login` with the new check bypassed: `""` and `abc-----BEGIN xyz` give
    500, `plain-secret` gives 200.
    -   **Fork patch (`5bad47c`, rewritten in `93d3024`):** for HS256,
        HS384 and HS512, `JWTConfig` refuses an empty or missing secret
        outright. Then it makes `JwtHandler`'s own call once,
        `JsonWebToken([algorithm]).decode(token, key=secret)`, with a token
        signed with the empty HMAC key. authlib prepares the secret as it
        does for each login: a mapping or `{...}` text is read as a JWK, and
        a key set is searched by `kid`. A set whose member has a `kid` that
        is not a string is refused first (fifth review, below); the set is
        then tried under each distinct string `kid` it names, or with no
        `kid` when it names none. (Until the fifth review this sentence said
        "under each `kid` it names", and the code tried only the string
        ones.) The secret passes only
        when authlib reports a bad signature. Any other exception becomes a
        `ConfigError` at `jwt_config.secret`, and so does a token that
        verifies, since the secret then works as the empty key (`"\x00"`
        does: HMAC pads a key with zero bytes). The homeserver stops at
        startup with the reason. Asymmetric algorithms, whose secret is a
        public key and so contains `-----BEGIN `, and disabled JWT login are
        not checked. (Until the sixth review this item ended "No Blackout
        template enables `jwt_config`"; the Railway one did. See the
        `enabled` item below.)
    -   **What `5bad47c` missed (third review).** It imported the secret with
        `OctKey.import_key`, and for a JWK that call puts off the empty-key
        and PEM checks until each verify. The review parsed
        `{kty: oct, k: ""}`, its JSON text, and a `k` that decodes to
        `-----BEGIN PUBLIC KEY-----` with `HomeServerConfig`: each passed
        startup. It ran the two empty-`k` forms through `/login`: under
        1.9.1 each login answered 500, and under 1.6.12 a token signed with
        the empty key logged in. The PEM `k` raises the same `ValueError` on
        the handler's call under 1.9.1 (measured here with that call, not
        through `/login`). `5bad47c` also refused a two-key set that
        the handler can use (`Missing required field: "k"`). The rewrite
        refuses the first three and accepts the set, and `/login` with each
        of its keys returns 200.
    -   **On which authlib version.** Measured through `HomeServerConfig`
        under both venvs. Refused under 1.6.12 and 1.9.1: an empty or
        missing secret, an empty-`k` JWK as a mapping or as JSON text, a key
        set with an empty `k`, an empty key set, `"\x00"`, JSON text that
        does not parse, `use: enc`, and PEM text at the start of a string.
        Refused only under 1.9.x: PEM or SSH key text after the first byte,
        as a string or as a JWK's `k`. 1.6.12 uses those as HMAC keys, so
        refusing them there would refuse a working configuration. The lock
        requires `>=1.9.1`. `tests/blackout_runtime/test_jwt_secret_config.py`
        has fourteen refused and four accepted forms. On `5bad47c` its JWK
        refusals fail and its key-set cases error; under 1.6.12 with the
        rewrite only the PEM and SSH cases fail, as above. After the fourth
        review it has eighteen refused, five accepted and two mixed forms,
        and eight refused algorithms. Measured again through
        `HomeServerConfig` under both versions, each behaves the same on
        1.6.12 and 1.9.1 except those PEM and SSH forms: the new key-set
        cases (an empty `k` or a zero byte beside a usable key, no usable
        key, two keys without a `kid`), the two mixed sets with one warning
        each, and every refused algorithm. After the fifth review it also
        has eight sets with a `kid` that is not a string, and a `/login`
        case; they are refused the same way under both versions.
    -   Catching the `ValueError` in `jwt.py` (a 403 per login) was the
        alternative. A startup error tells the operator; a 403 on every login
        only tells the user.
    -   **Key sets (fourth review, `d084e96`).** `93d3024` turned any
        exception, for any `kid`, into the `ConfigError`. So a set with a
        usable `oct` key and an RSA or EC public JWK stopped the homeserver
        at startup (`Missing required field: "k"`), where `develop`, on
        either version, starts, logs in with the `oct` key and answers a
        token naming the other one with 500. That was a new availability
        regression, found by the review. Now:
        -   a key that verifies the empty-key token still refuses the whole
            secret;
        -   a JWK with an empty `k`, alone or in a set, is refused before any
            verify call, because 1.9.1 fails on it where 1.6.12 verifies with
            it;
        -   a set none of whose keys can be used is refused, naming each
            `kid` and its error;
        -   a key that cannot be used beside one that can is logged as a
            warning naming its `kid`, and the homeserver starts. A token
            naming it still gets 500, as on `develop`; through `/login`
            under 1.9.1 the `oct` key gave 200 and the EC `kid` raised
            `ValueError: Missing required field: "k"` in the handler.
    -   **`algorithm: none` (fourth review, `d084e96`).** `jwt_config` never
        checked the algorithm, and the secret check returned early for
        anything outside HS\*. `JwtHandler` passes the one algorithm to
        `JsonWebToken([algorithm])`, which with `none` accepts an unsigned
        token whatever the key. The review logged in as `@anyone:test` with
        `{alg: none}.{sub: anyone}.` under both versions; a probe here
        accepted that token with the key `""`, `"anything"` and `None`. It
        predates the bump, upstream has it too (`cc172f7` reads the
        algorithm verbatim), and only operator configuration reaches it. It
        is the same class of bypass as the empty HMAC key. `JWTConfig` now
        refuses `none`, and any name outside the 14 other JWS algorithms
        authlib registers (the same in 1.6.12 and 1.9.1), with a
        `ConfigError` at `jwt_config.algorithm`. Those other names (`NONE`,
        `hs256`, `HS1024`, a JWE algorithm such as `dir`) refused every
        token: a JWE token needs its `enc` in the same one-entry list, and a
        `dir`/`A256GCM` token was refused with `["dir"]` and accepted only
        with `["dir", "A256GCM"]`. A disabled `jwt_config` is not checked.
    -   **A `kid` that is not a string (fifth review, `6484756`).**
        `d084e96` tried a key set under its string `kid`s only. authlib picks
        a set's member with `k.get("kid") == kid`, using the token header's
        value whatever its JSON type, so a member under `kid: 5` is chosen
        by a token whose `kid` is `5` or `5.0`, and one under `kid: true` by
        `true` or `1`. The review started a homeserver with
        `{kty: oct, k: <32 bytes>, kid: g}` and `{kty: oct, k: AA, kid: 5}`
        (`AA` is one zero byte, which HMAC pads into the empty key), and a
        token with header `{"alg": "HS256", "kid": 5}` signed with the empty
        key logged in; so did `kid: true`, with a token `kid` of `true` or
        `1`. A probe here of `JwtHandler`'s call accepted those tokens
        under 1.6.12 and 1.9.1 alike, and refused a member `kid` of `"5"`
        for a token `kid` of `5`, and the reverse
        (`Invalid JSON Web Key Set`). `develop` has no check, so it starts
        with the same set and lets the same token in. Only an operator's
        `jwt_config` reaches it, as with GHSA-8m4g.
        -   RFC 7517 sec. 4.5 makes `kid` a string. `JWTConfig` now
            refuses, before any other key-set check, a member whose `kid`
            is present and is not a string (`5`, `true`, `null`, a list),
            with a `ConfigError` at `jwt_config.secret` naming its index
            (`keys[1] has a kid that is not a string (5)`). With every `kid`
            a string, a token reaches a member only by naming its `kid`, or,
            with no `kid`, when the member is the set's only key, and that
            is what the rest of the check tries. A member without a `kid`,
            in a set that names others, is never chosen, and is not tried.
        -   **This refuses key sets that `develop` starts and serves** (said
            plainly after the sixth review). The refusal goes by the `kid`'s
            type, whatever the key. A strong `oct` key under `kid: 5`, a
            one-key set under `kid: null`, and strong keys under `kid: "a"`
            and `kid: 7` each load on `develop`, under authlib 1.6.12 and
            1.9.1, and `JwtHandler`'s call logs in with each `kid`. On this
            branch, under either version, each stops at startup
            (`keys[0] has a kid that is not a string (5)`). That is on
            purpose. It fails closed; RFC 7517 makes `kid` a string; and
            trying each member under its own typed `kid` instead would mean
            copying authlib's `==` across JSON types (`true == 1`). The
            operator's fix is to quote the `kid` and have the issuer send the
            same string, as the notes in `docs/upgrade.md` say.
        -   The test module has the eight sets (`AA` beside a usable key,
            under `kid: 5` or `kid: true` as a mapping, under `kid: 5` as
            JSON text, and under `kid: true` as a list; a usable key under
            `kid: 5`; `kid: null`; `kid: ["a"]`; `kid: 5` after an empty
            `k`), and a `/login` case: for `kid: 5` and `kid: true` the
            homeserver's config does not load, and the same `/login`, given
            that set, answers the empty-key token with 200 as
            `@mallory:test`.
    -   **`enabled` that is not a boolean (sixth review, `48ab32d`).**
        `jwt_config` never checked `enabled`, and JWT login is on whenever it
        is truthy, so `"false"` turned it on. The Railway template rendered
        `${JWT_ENABLED:-false}` as that text ([Our exposure](#our-exposure)).
        `JWTConfig` now refuses, before any other check, an `enabled` that is
        not a YAML boolean (a string, `null`, an empty value, a number), with
        a `ConfigError` at `jwt_config.enabled`; a missing `enabled` still
        means off. The tests refuse seven such values and load `true`,
        `false` and none, and render the template as `envsubst` does: it has
        `enabled: false` whatever the environment. On `05dfc10`'s
        `config/jwt.py` the refusal test fails, and with `05dfc10`'s
        template the template test does. This refuses configurations that
        `develop` starts: there a quoted `"true"`, `"false"` or `1` ran JWT
        login, and `null`, `""` or `0` left it off.
-   **Loopback `http` metadata (1.8.0).** `is_secure_transport`, which
    `validate_issuer`, `validate_authorization_endpoint`,
    `validate_token_endpoint` and `validate_jwks_uri` use, now parses the URL.
    It accepts `http` to `localhost` or a loopback IP with or without a port,
    where 1.6.12 accepted only the prefixes `http://localhost:` and
    `http://127.0.0.1:`. It refuses an `https` URL with no host. It loosens
    only for the homeserver's own machine, so no fork check was added. The
    `AUTHLIB_INSECURE_TRANSPORT` override behaves as before.

### Two side effects

-   **Some claim errors now come from joserfc.** `CodeIDToken`'s OIDC checks
    raise joserfc's `InvalidClaimError` and `MissingClaimError`, which are not
    subclasses of `authlib.jose.errors.JoseError`. `oidc.py` catches
    `Exception` around `_parse_id_token`, so they still render
    `invalid_token`. The logout token (`LogoutToken`) and JWT login use
    authlib's `JWTClaims`, which still raises authlib's errors for claims.
    Their `except JoseError` clauses still apply to claims, and their tests
    pass. A key authlib cannot use raises `ValueError` instead, on both
    versions; see the section above and
    [Malformed logout tokens](#malformed-logout-tokens).
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
        `client_secret_basic` warn on neither version. For a JWK with no
        `alg` member, or with `"alg": "RS256"`, the assertion is the same on
        both: header `alg`, `kid` and `typ`; claims `iss`, `sub`, `aud`,
        `exp`, `iat` and `jti`; a 3600-second lifetime.
        `tests/blackout_runtime/test_msc3861_client_assertion.py` (`ad9bf75`)
        checks it for both JWT methods, verifying the signature without
        authlib, and since `7babe24` for an `alg: RS256` JWK too. (Corrected
        after the third review. This sentence said "the same on both"
        without the condition.)
    -   **Not only log noise (corrected after the third review).** The
        warning is log noise. But joserfc also checks the key against the
        assertion. Its `Key.check_alg` refuses a JWK whose `alg` is not the
        RS256 that `PrivateKeyJWTWithKid` signs with; 1.6.12 ignored `alg`.
        Measured through a homeserver with `"alg": "RS512"`: under 1.9.1,
        `get_user_by_access_token` raised a 503,
        `Unable to introspect the access token`, and no introspection
        request was sent; under 1.6.12 the request was sent and the
        provider's answer came back (401 for an inactive token). The config
        accepted that JWK, so the homeserver started and then failed every
        authenticated request. A JWK that is public only or has `use: enc`
        gave the same 503 under both versions.
    -   **Fork patch (`7babe24`).** `config/experimental.py` refuses a JWK
        whose `alg` is set and is not RS256, at
        `experimental_features.msc3861.jwk`, on any authlib version. Then it
        signs one assertion with `private_key_jwt_sign` and the arguments
        `PrivateKeyJWTWithKid.sign` passes, and turns any exception into the
        same `ConfigError`. That also refuses, on both versions, a JWK that
        is public only, is not RSA, or has `use: enc` or `key_ops` without
        `sign`. Upstream removed experimental MSC3861 in v1.157.0
        (2026-07-21); every upstream release locks authlib 1.6.12 or older,
        so upstream never ran it on joserfc and there was nothing to port.
    -   **An empty `client_secret`.** The third review found that 1.9.1
        refuses to sign `client_secret_jwt` with an empty secret
        (`oct key material must not be empty`), where 1.6.12 signed with the
        empty key, and expected every request to fail. Measured through a
        homeserver, neither version got that far: `MSC3861DelegatedAuth`
        asserts the secret is truthy, so the homeserver stopped during setup
        with `AssertionError: No client_secret provided`. That was run for
        `client_secret_jwt` and `client_secret_post` on both versions;
        `client_secret_basic` takes the same branch. The config refused only
        `None`; since `7babe24` it refuses `""` the same way, for all three.
        The per-request failure would appear only under `python -O`, which
        strips the assertion. No Dockerfile or deploy script in the tree sets
        `-O` or `PYTHONOPTIMIZE`.
    -   **A `client_secret` that starts with `-----BEGIN `.** 1.6.12 refused
        to sign `client_secret_jwt` with `-----BEGIN PUBLIC KEY-----`; 1.9.1
        signs with it and emits joserfc's `SecurityWarning`. This is the
        homeserver's own secret for signing its requests to the provider,
        not a key it verifies tokens with, so GHSA-7vr2's key confusion does
        not arise. Left as it is.
    -   **The signers return `str` (fifth review, `823530e`).** From 1.7.0,
        authlib's `private_key_jwt_sign`, which `PrivateKeyJWTWithKid.sign`
        calls, and `ClientSecretJWT.sign` end in joserfc's `jwt.encode`,
        which returns `str`. A probe of both got `str` from three calls each
        under 1.9.1, and `bytes` under 1.6.12 on `develop`. The fork's
        `PrivateKeyJWTWithKid.sign` was still annotated `-> bytes`, and mypy
        could not see it, because `mypy.ini` ignores authlib's types
        (`[mypy-authlib.*]`). Nothing behaved differently: the one consumer,
        authlib's `ClientSecretJWT.__call__`, adds the value to a `str`
        request body either way, and the MSC3861 test modules pass. The
        annotation is `str` now; the lock requires `>=1.9.1`.
    -   No shipped configuration reaches any of this.
        `infra/single-server-baseline` uses classic `oidc_providers`, and the
        MAS stack runs the upstream image. If the fork ever enables
        `private_key_jwt`, convert the JWK to a joserfc key once at config
        time to stop the per-request warning. That is a fork change and
        needs a `PATCHES.md` entry.

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

Both gaps are now written where a reader of the threat model looks: a
`KNOWN_LIMITATIONS.md` entry ("OIDC sign-in checks (2026-10-30)") and a caveat
in `THREAT_MODEL.md`'s OIDC tokens row, whose integrity column said only "OIDC
sigs". Behaviour did not change with them.

### Malformed logout tokens

Found by the second review; it predates the bump and is in upstream too.
`_verify_jwt` treats any `ValueError` from the first decode as stale keys: it
refetches the JWKS and decodes again. `handle_backchannel_logout` caught only
`JoseError`. A logout token whose key authlib cannot use raises `ValueError`
both times, so it ended in a 500. Measured through the endpoint, with the
provider listing `ES256` and `HS256` and a session open:

| Logout token                                                          | Before             | Now  | JWKS fetches |
| --------------------------------------------------------------------- | ------------------ | ---- | ------------ |
| HS256, `kid` of the provider's EC key (`Missing required field: "k"`) | 500                | 400  | 1            |
| HS256, unknown `kid` (`Invalid JSON Web Key Set`)                     | 500                | 400  | 1            |
| ES256, unknown `kid`                                                  | 500                | 400  | 1            |
| ES256, the provider's `kid`, zero signature                           | 400                | 400  | 0            |
| signed by the provider                                                | 200, session ended | same | 0            |

No forged token ended the session, before or after, on authlib 1.6.12 or 1.9.1
(the second review's run; this one used 1.9.1).

-   **Patched (`85df7cc`):** the handler catches `ValueError` with
    `JoseError` and answers 400 `Invalid logout_token`. OIDC Back-Channel
    Logout 1.0 §2.8: "If the logout request was invalid or the logout failed,
    the RP MUST respond with HTTP 400 Bad Request." A JWKS that fails to parse
    also ends there now; that is a failed logout, and 400 is what §2.8 asks
    for. `test_logout_token_with_unusable_key_is_refused_with_400` fails on the
    code before the patch.
-   **Not patched: one JWKS fetch per such token.** Anyone can make Synapse
    send one GET to the provider's `jwks_uri` for each POST. It is one request
    for one, to a URL that is public anyway, and the same refetch is how a key
    rotation is picked up for id_tokens, which share `_verify_jwt`. Refetching
    only for an unknown `kid`, and at most once per interval, would bound it.
    That changes the id_token path as well, so it is left as a follow-up.
-   **Not patched: a traceback per invalid token.** The 400 path logs with
    `logger.exception`, as it already did for every other invalid logout token
    (an unsigned one, a bad signature). Before, Synapse's 500 handler logged
    the traceback instead. The log volume per request is the same. nginx in
    front of `/_synapse/client` is where a request rate limit belongs; no
    shipped config sets one for this path, and none was added here.

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

After the second review (`b37a2cd`), the third copy of this wording, the
comment over `Twisted` in `apps/blackout-server/pyproject.toml`, says the
same. It had called 26.4.0 the newest final release and named three
advisories fixed "only in the 26.10.0 pre-release". It now names all four,
says 26.10.0 is final and not locked, and gives the 2026-11-30 expiry. The
Twisted block in `.trivyignore` also says now that these entries are not in
`osv-scanner.toml` or `pnpm.auditConfig`, since the file's header says
otherwise until `-v47` lands. The lock's `content-hash` does not cover
comments; `poetry lock --check` passes.

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

## pyasn1: quadratic decoding

Added after the fourth review. GitHub reviewed these four on 2026-10-30,
between 23:03 and 23:07 UTC. Trivy's database of 19:07 UTC, which every gate
run in this record used until the sixth review, does not have them; the one of
2026-10-31 01:14 UTC does, and reports them on `develop`. Each is High (CVSS 7.5,
availability only), affects every release through 0.6.4, and is fixed in
0.6.5, on PyPI since 2026-10-27.

| Advisory                              | Vulnerable code                                                                                                                                                     | DER without a schema              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| GHSA-fm9c-5rcf-2q5p (CVE-2026-119194) | `_decodeComponentsSchemaless` adds each component's TagSet to a growing set; tag ids chosen so their hashes collide make each insert compare with the earlier ones. | yes                               |
| GHSA-9m75-vc3g-4x39 (CVE-2026-119195) | A constructed OCTET STRING or character string is reassembled with `bytes +=` per fragment, and an indefinite-length ANY the same way.                              | for constructed character strings |
| GHSA-2qm8-x737-gmw5 (CVE-2026-119196) | A constructed BIT STRING shifts the whole accumulated integer for each fragment.                                                                                    | no: refused without a schema      |
| GHSA-mm57-4v3p-rchx (CVE-2026-119197) | A binary REAL's mantissa is built one octet at a time, with a shift and a slice.                                                                                    | yes                               |

### Our exposure to pyasn1

Nothing in `synapse/` or `blackout_runtime/` imports pyasn1. Two installed
packages do:

-   **`service_identity` 24.2.0, on every hostname-verified TLS connection.**
    `extract_patterns` (`service_identity/cryptography.py`) calls
    `pyasn1.codec.der.decoder.decode(other.value)`, with no schema, for each
    SubjectAltName `otherName` of type id-on-dnsSRV in the peer's
    certificate. Synapse's HTTP client (`RegularPolicyForHTTPS`, for OIDC
    providers, push gateways and the like) and its federation client
    (`FederationPolicyForHTTPS`) both go through `ConnectionVerifier` in
    `synapse/crypto/context_factory.py`, which calls `verify_hostname` when
    the handshake completes, in the TLS info callback, on the reactor
    thread. Email over TLS uses Twisted's `optionsForClientTLS`, which does
    the same. Each verifies the chain first. OpenSSL aborts a handshake
    whose certificate does not chain to a trusted root, and the federation
    client skips the hostname check, and so the decode, when
    `federation_verify_certificates` is off or the host is in
    `federation_certificate_verification_whitelist`. So the input is a
    certificate from a CA Synapse trusts: the system roots, or
    `federation_custom_ca_list`. Read from the code; no handshake with a
    crafted certificate was run.
-   **ldap3, only with LDAP login.** `--extras all` installs
    `matrix-synapse-ldap3` and ldap3, which decode some LDAP response
    controls with pyasn1 (BER, with a schema) once an operator enables the
    LDAP auth provider. The input then comes from the configured LDAP
    server, or from anyone who can tamper with a cleartext `ldap://`
    connection. No Blackout template configures LDAP. Not measured.

The cost, measured with a probe of `extract_patterns` on self-signed
certificates whose SRV-ID holds each advisory's input. The probe calls the
function directly; it does not make a TLS handshake.

| SRV-ID value                           | Certificate | 0.6.4  | 0.6.5  |
| -------------------------------------- | ----------- | ------ | ------ |
| SEQUENCE of colliding tags (GHSA-fm9c) | 50 KB       | 0.87 s | 0.08 s |
| same                                   | 100 KB      | 4.44 s | 0.14 s |
| binary REAL (GHSA-mm57)                | 50 KB       | 0.28 s | 0.00 s |
| same                                   | 100 KB      | 1.12 s | 0.00 s |
| constructed UTF8String (GHSA-9m75)     | 100 KB      | 0.09 s | 0.13 s |
| an ordinary IA5String SRV-ID (control) | 0.3 KB      | 0.00 s | 0.00 s |

OpenSSL accepts a peer certificate chain of up to 100 KiB by default
(`SSL_MAX_CERT_LIST_DEFAULT`), so under 0.6.4 one handshake with such a
certificate could hold the reactor for about four seconds. The
constructed-string case is not yet quadratic at this size. Each crafted value
makes `extract_patterns` raise `CertificateError`, so the connection fails
either way; the control yields its two patterns on both versions.

### What was done for pyasn1

-   `pyproject.toml`: `pyasn1 = ">=0.6.5"` (was `>=0.6.4`), with the four
    advisories in its comment.
-   `poetry.lock`, with poetry 1.3.2's `lock --no-update`: pyasn1 0.6.4 →
    0.6.5, with the file hashes PyPI lists, and the `content-hash`. Nothing
    else moves. The image's `--extras all` export differs by that one
    package. `pyasn1-modules` 0.4.2 requires `pyasn1>=0.6.1,<0.7.0`. OSV
    lists no advisory against 0.6.5.
-   `PATCHES.md` has the entry (`a8ba5a3`). Upstream `develop` (`cc172f7`)
    still locks 0.6.4, so nothing was ported.
-   The review's fallback, dated `.trivyignore` entries until 0.6.5 could
    land, was not needed.

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

From the source of tauri-plugin-updater 2.14.1, the locked version (its
crate's sha256, `d957abbc…`, is the checksum in `Cargo.lock`). Until the sixth
review this section cited the 2.10.0 source; the conclusion holds for both.

-   `zip` is an optional dependency under `cfg(target_os = "windows")`
    (`Cargo.toml` line 198), enabled by the default `zip` feature. It is not
    compiled for macOS or Linux: `cargo tree -i zip` finds it for
    `x86_64-pc-windows-msvc` only, through the updater, and for neither
    `x86_64-unknown-linux-gnu` nor `aarch64-apple-darwin`.
-   It is used once, in `extract_zip` (`src/updater.rs` 1140-1160):
    `zip::ZipArchive::new(..)`, then `extract(&temp_dir)`. `extract` (1121)
    calls it only when the bytes are a zip, and only the Windows
    `install_inner` (1009, in the `#[cfg(windows)]` block from 999) calls
    `extract`. `ZipStreamReader` is never used.
-   `install` (921-924) runs `self.verify(bytes)?`, the minisign check
    against `plugins.updater.pubkey`, before `install_inner`. `download`
    runs `self.verify(&buffer)?` (891) before it returns the bytes, and
    `download_and_install` (933-941) installs only what `download` returned.
    The JavaScript `install` command (`src/commands.rs` 137-157) takes the
    resource ids of an update and of the bytes the JavaScript `download`
    stored, and calls the same `install`. The JavaScript `check` (43) takes
    headers, a timeout, a proxy and a target, not the endpoints or the
    public key.

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

-   **A release build on Linux, after the third review.** With 9 GB free
    and the load under 3, the workflow's apt packages were installed:
    `libwebkit2gtk-4.1-dev`, `libxdo-dev`, `libssl-dev`,
    `libayatana-appindicator3-dev` and `librsvg2-dev`, here with
    `--no-install-recommends`, from Ubuntu 24.04's archive (131 packages,
    `libdbus-1-dev` among them). The build ran on a `git archive` of
    `blackout-desktop` at `3ca628a`:

    -   icons generated as the workflow does, with
        `tauri icon src-tauri/icons/blackout.svg`, from `@tauri-apps/cli`
        2.10.1, the locked version (its npm integrity matches
        `pnpm-lock.yaml`);
    -   a one-line placeholder `index.html` as `frontendDist`, because the
        client was not built (a monorepo install was not part of this);
    -   `cargo build --release --locked -j 3`, rustc 1.97.0, with its own
        target directory, deleted afterwards.

    It finished in 6 minutes 40 seconds with no warning and no error, and
    left `Cargo.lock` unchanged. It compiled tauri 2.12.5, wry 0.57.1, tao
    0.37.2, tauri-runtime-wry 2.12.3, muda 0.20.0, tray-icon 0.25.1 and
    tauri-plugin-updater 2.14.1, and linked a 22.5 MB `blackout-desktop`
    executable. `ldd` resolves its WebKitGTK 4.1, GTK 3, libsoup 3 and
    libdbus libraries. Since this build has no warning, none is new against
    `develop`, so `develop` was not built for comparison. Not done: running
    the binary (there is no display here), a bundle, a build on
    ubuntu-22.04 (the release job's runner) or on Windows or macOS, and a
    build with the real client.

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
-   **libdbus-1-dev reaches the Linux release job.** On Ubuntu 22.04 (jammy,
    the job's runner), `libwebkit2gtk-4.1-dev` depends on `libgtk-3-dev`,
    which depends on `libatk-bridge2.0-dev`, then `libatspi2.0-dev`, which
    depends on `libdbus-1-dev`. Read from packages.ubuntu.com on 2026-10-30.

### Before merge or release

No CI job builds this lock before a release does.
`blackout-desktop-tauri.yml` runs on pull requests to `main` only, and only
its toolchain-free notification harness; its `build` job has
`if: github.event_name != 'pull_request'` and runs on pushes to `main`, on
`release-*` and `v*` tags, and on `workflow_dispatch`. PRs here target
`develop`. So tauri 2.10.3 → 2.12.5, wry 0.54 → 0.57, tao, tray-icon, muda and
the 28 added package versions (15 of them crates new to the lock, dbus and
libdbus-sys among them) would first be linked and bundled in CI by the release
job. They have been linked once outside CI, after the third review, on Ubuntu
24.04 (see [Verification](#verification)). That job bundles with `@tauri-apps/cli`
2.10.1 (`pnpm-lock.yaml`), two minors behind the crate.

-   **The CLI and crate versions.** tauri-cli 2.10.1's
    `check_mismatched_packages` (`src/info/plugins.rs`, read from the crate)
    pairs each Rust crate (`tauri`, `tauri-plugin-*`) with its npm package
    (`@tauri-apps/api`, `@tauri-apps/plugin-*`) and compares major.minor only
    when both are installed. `blackout-desktop/package.json` has only
    `@tauri-apps/cli`, and `pnpm-lock.yaml` has no `@tauri-apps/api` or
    plugin package, so the check has nothing to compare and does not stop
    the build. The 2.10.1 CLI and the 2.12.5 crate have still never been
    built together.
-   **What to run.** An unsigned build on ubuntu-22.04 with the workflow's apt
    packages (`libwebkit2gtk-4.1-dev libxdo-dev libssl-dev
libayatana-appindicator3-dev librsvg2-dev`):
    `pnpm install --frozen-lockfile`, then in `blackout-desktop`
    `pnpm tauri icon src-tauri/icons/blackout.svg --output src-tauri/icons`
    and `pnpm tauri build --no-bundle` (or `pnpm bundle` for the installers).
    Before this merges, or at the latest before the next release tag.
-   **What not to run.** Do not start `workflow_dispatch` on
    `blackout-desktop-tauri.yml` from this branch. Its `tauri-action` step has
    `tagName: ${{ github.ref_name }}`, `releaseDraft: false` and
    `prerelease: false`, so it would publish a release named after the
    branch.
-   **Done here, after the third review: the Linux half of the Rust build**
    (see [Verification](#verification)), on Ubuntu 24.04 rather than 22.04,
    with a placeholder frontend and without `tauri build`'s bundling. The
    release job's own build is still the first on 22.04, Windows and macOS.
    `@tauri-apps/cli` was not moved to 2.12.x: the mismatch check does
    not require it, and `pnpm-lock.yaml` belongs to the `-v47` branch's
    change. Moving it with the build above is reasonable.

## The gate

| Run                                                            | High/Critical reported                                                           | Exit |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| `develop` (`ff7d08b`)                                          | the six above                                                                    | 1    |
| this branch                                                    | none                                                                             | 0    |
| this branch, `.trivyignore` emptied                            | 7: the four Twisted entries, image-size (2) and react-router, all ignored before | 1    |
| first version, the new entry's `exp:` set to 2026-10-01        | GHSA-vpp8-g58w-m8mp only                                                         | 1    |
| after review, every Twisted `exp:` set to 2026-10-01           | the four Twisted advisories only                                                 | 1    |
| after the second review (`b37a2cd`)                            | none                                                                             | 0    |
| after the third review (`3ca628a`)                             | none                                                                             | 0    |
| after the fourth review (`b3cd1b3`)                            | none                                                                             | 0    |
| after the fifth review (`823530e`)                             | none                                                                             | 0    |
| after the sixth review (`ae70358`), DB of 2026-10-31 01:14 UTC | none                                                                             | 0    |
| `develop` (`ff7d08b`), DB of 2026-10-31 01:14 UTC              | eleven: the six above, authlib GHSA-c73q and the four pyasn1 advisories          | 1    |

The two rows with `exp:` set to 2026-10-01 show that Trivy 0.69.3 honours the
`exp:` date, now on all four Twisted entries. Nothing from authlib or zip
remains with the ignore file emptied. The runs through the fifth review used
the same Trivy binary (its checksum re-checked) and the vulnerability DB of
2026-10-30 19:07 UTC. This record called it still the newest, reading its
`NextUpdate` (2026-10-31 19:07 UTC) as the next database's date. That field
only tells the client when to look again; a newer database, built at 01:14
UTC, was downloadable by 02:19 UTC (corrected after the sixth review). The
scan read six lockfiles: the fork's `poetry.lock` and `Cargo.lock`, the legacy API's
`requirements.txt`, the desktop `Cargo.lock`, `pnpm-lock.yaml` and
`services/perturbation/requirements.txt`.

After the second review the same binary and DB were run again over the
worktree, and with `--show-suppressed`. It reports no finding and exits 0. The
suppressed list is the seven of the emptied-file row: Twisted 26.4.0 under its
four ids (Trivy matches the HTTP/2 one by GHSA, the other three by CVE),
react-router 7.18.0 (fixed in 7.18.2 and 8.3.0) and image-size 1.2.1 twice
(fixed in 2.0.3).

After the third review the same binary (its tarball re-checked against
`trivy_0.69.3_checksums.txt`) and the same DB, still the newest, were run
over the worktree at `3ca628a`, plain and with `--show-suppressed`. Same
result: no finding, exit 0, and the same seven suppressed. The react-router
one stays suppressed on this branch until it is merged into PR #994, whose
`71548f0350` removes the ignore with the bump.

After the fourth review the same binary (`sha256` of the tarball and of the
extracted binary re-checked) was run over the worktree at `b3cd1b3` with a
newly downloaded database. It was still the one of 2026-10-30 19:07 UTC, with
`NextUpdate` 2026-10-31 19:07 UTC. Plain and with `--show-suppressed`: no
finding, exit 0, and the same seven suppressed. Those runs cannot show the
pyasn1 or GHSA-c73q findings, which that database does not have. OSV fills
the gap: it lists all five against `develop`'s lock, and none against pyasn1
0.6.5 or authlib 1.9.1 on this branch's. So at the next database update the
gate fails on `develop`, and on this branch it does not for these lockfiles.

After the fifth review the same binary (the tarball's `sha256` checked
against `trivy_0.69.3_checksums.txt`, and the extracted binary's against the
one in the tarball) was run over the worktree at `823530e`, plain and with
`--show-suppressed`, against the same database, from a cache downloaded at
00:58 UTC; Trivy did not look for a newer one, because that cache's
`NextUpdate` was in the future. This record called it still the newest. That
was not checked, and the 01:14 UTC database was downloadable by 02:19 UTC, ten
minutes after the run (sixth review). No finding, exit 0, and the same seven
suppressed. That round changed no lockfile. Trivy loads no RustSec-only
advisory, so it cannot show the four in
[Found outside scope](#found-outside-scope-not-fixed-here).

After the sixth review the same binary (the tarball's `sha256` checked
against `trivy_0.69.3_checksums.txt`, and the extracted binary's against the
one in the tarball) downloaded a new database at 03:07 UTC: the one of
2026-10-31 01:14 UTC, which has the pyasn1 advisories and GHSA-c73q. It ran
with `security.yml`'s flags, and no others, over `git archive` exports of
`ae70358` and of `develop`, plain and with `--show-suppressed`:

-   `ae70358`: no finding, exit 0, and the same seven suppressed.
-   `develop`: eleven findings, exit 1. authlib 1.6.12 under its four
    advisories, pyasn1 0.6.4 under four, Twisted 26.4.0 under
    GHSA-vpp8-g58w-m8mp, and zip 4.6.1 under two. With `--show-suppressed`,
    the other three Twisted ids, react-router and image-size twice, which
    `develop`'s `.trivyignore` ignores too.

So with the newest database the gate is green on this branch, and red on
`develop` for the five advisories the fourth review added as well as the six.
The record's own commit changes no file Trivy reads.

## Validation

-   **Lock:** `poetry lock --check`, `.ci/scripts/check_lockfile.py` and
    `scripts-dev/check_locked_deps_have_sdists.py` (151 packages) pass.
-   **Lock, after the second review:** `poetry lock --check` (poetry 1.3.2)
    passes with the reworded `pyproject.toml` comment. `poetry.lock` did not
    change in that round. After the third review it passes again, with the
    authlib comment reworded; `poetry.lock` did not change.
-   **Lock, after the fourth review:** `poetry lock --check`,
    `check_lockfile.py` and `check_locked_deps_have_sdists.py` (151
    packages) pass with pyasn1 0.6.5.
-   **Lock, after the fifth review:** `poetry lock --check` (poetry 1.3.2)
    passes. Neither `pyproject.toml` nor `poetry.lock` changed in that round.
    After the sixth review it passes again; neither file changed.
-   **The auth tests, before and after:** 231 tests in 13 modules. All pass
    on both sides, and none is skipped, so authlib was loaded. After review,
    with the three new modules (`test_oidc_claim_types`,
    `test_backchannel_logout_alg`, `test_msc3861_client_assertion`): 239,
    all passing, none skipped. After the second review, the same 16 modules
    plus `test_jwt_secret_config` and the whole of `tests.config` (for the
    `config/jwt.py` change): 347 tests, all passing, none skipped. After the
    third review, the same 18 modules: 354 tests (the two changed modules
    have seven more), all passing, none skipped. After the fourth review,
    with pyasn1 0.6.5: the same 18 modules and `tests.config`, 358 tests
    (`test_jwt_secret_config` has four more), all passing, none skipped.
    For pyasn1 that run also took the TLS and HTTP modules: `tests.http`,
    `tests.crypto` and `tests.replication.test_multi_media_repo`, 166 tests.
    Of those, 33 fail, 7 error and 8 skip: the same ids, with the same
    outcomes, as in the third review's full run under 0.6.4. All 40
    failures and errors are in `tests.http`: 19 in the federation agent's
    module, 19 in the federation client's and 2 in the proxy agent's. This
    record called them the fork's existing failures. They come from this
    sandbox's proxy variables instead (fifth review; see the next item).
    After the fifth review, the same modules and `tests.config`, with
    `tests.config.test_oauth_delegation` run once, inside `tests.config`:
    339 tests, all passing, none skipped. The fourth review's 358 named
    that module alone and inside `tests.config`, and trial ran its 21 tests
    twice; without the repeat that run was 337, and `test_jwt_secret_config`
    has two more. After the sixth review, the same modules and
    `tests.config`: 342 tests (`test_jwt_secret_config` has three more),
    all passing, none skipped. The original 13 modules:
    -   `tests.handlers.test_oidc`, `test_sso`, `test_auth` and
        `test_oauth_delegation`;
    -   `tests.rest.client.test_login` (JWT login lives here; there is no
        `tests/handlers/test_jwt.py`), `test_auth`, `test_auth_issuer` and
        `test_keys`;
    -   `tests.api.test_auth`, `tests.config.test_oauth_delegation`,
        `tests.rest.admin.test_jwks`, `tests.rest.test_well_known` and
        `tests.blackout_runtime.test_session_length`.
-   **The HTTP-test failures come from this sandbox's proxy, not from the
    fork (fifth review).** Every process here has `https_proxy` and
    `HTTPS_PROXY` set to a local agent proxy on `127.0.0.1`, and a
    `no_proxy` list. `MatrixFederationAgent` and `ProxyAgent` read them
    with `urllib.request.getproxies_environment()`, which is upstream's
    code; the fork does not change it. So the federation tests' agents
    send their requests to the proxy, and the tests' fake reactor has no
    address for it. 15 of the 40 tracebacks name
    `DNSLookupError: DNS lookup failed: no results for hostname lookup: 127.0.0.1.`,
    the proxy's host. The other 25 find no connection, or one fewer, where
    the test expects a direct one (`0 != 1`, `1 != 2`, or `IndexError` on
    the list of connections). The two proxy-agent tests show the cause
    directly. They patch only upper-case variables (`HTTPS_PROXY`, or
    `NO_PROXY=test.com`), and Python lets the sandbox's lower-case ones
    win: under the same patches, `getproxies_environment()` still returns
    the sandbox's proxy, and `test.com` is not bypassed. The tests that set
    a proxy of their own (`test_get_via_https_proxy` and four others) pass.
    The federation agent's module gives the same 18 failures and 1 error
    on `develop` with pyasn1 0.6.4 and on this branch (the fifth review
    compared the ids), and again in this round. A runner without proxy
    variables would not take this path, so another machine could show a
    different result; no root workflow runs trial, and the fork's own
    workflows do not run. None of the other 104 failures and errors in the
    full run names the proxy. `HTTPS_PROXY` was not unset to run any of
    this.
    -   So the tests that check a peer's certificate after the handshake
        (`test_get_hostname_bad_cert`, `test_get_ip_address_bad_cert`,
        `test_idna_servername`) could not run here, under either pyasn1
        version. They reach `service_identity`, whose pyasn1 decode runs
        only for an SRV-ID; none of the tests' certificates has one (their
        names are DNS and IP entries). The pyasn1 bump rests on the direct
        probe in [pyasn1](#pyasn1-quadratic-decoding), not on the suite.
        The fifth review ran two more under 0.6.4 and 0.6.5, with the same
        result on each: `service_identity`'s `extract_patterns` and
        `verify_certificate_hostname` over DNS, wildcard, IP and URI names
        and SRV-IDs (primitive, constructed, not IA5, an unknown
        `otherName`), and an ldap3 bind and search.
-   **The full trial suite, before and after** (`-j3`):

    |               | Tests | OK    | Skipped | Failure | Error |
    | ------------- | ----- | ----- | ------- | ------- | ----- |
    | before        | 3,350 | 3,034 | 173     | 110     | 34    |
    | after         | 3,350 | 3,034 | 173     | 110     | 34    |
    | after review  | 3,358 | 3,042 | 173     | 110     | 34    |
    | second review | 3,363 | 3,047 | 173     | 110     | 34    |
    | third review  | 3,370 | 3,054 | 173     | 110     | 34    |
    | fourth review | 3,374 | 3,058 | 173     | 110     | 34    |

    Compared test by test, every outcome is the same. After review, the
    failing, erroring and skipped tests are the same ones, by test id, as
    before, and the 8 added tests pass. After the second review they are the
    same ones again, and the 5 added tests (one logout test, four JWT config
    tests) pass. After the third review, compared by test id with the second
    review's run, the 316 failing, erroring and skipped ids are the same,
    each with the same outcome, and the 7 added tests pass. After the
    fourth review, with pyasn1 0.6.5, compared by test id with the third
    review's run: the same 316 ids, each with the same outcome, and the 4
    added tests pass. Of the 144 failures and errors, the 40 in
    `tests.http` come from this sandbox's proxy variables (above); the
    other 104 are the fork's existing ones (see the 2026-10-25 record).
    None is in an auth module. After the fifth review the full suite was
    not run again: that round changed `config/jwt.py`, its test module and
    one annotation, and the targeted run covers each. Nor after the sixth:
    that round changed how `config/jwt.py` reads `enabled`, its test module,
    a template and an example file that no test but the new one reads, and
    documents.

-   **The new tests against the code they pin:**

    -   On the logout code before `d9eed10`, both `test_backchannel_logout_alg`
        tests fail: the unsigned token gets HTTP 200.
    -   Under authlib 1.6.12 (develop's lock, with the fix applied), the three
        `test_oidc_claim_types` refusals fail because the login completes. The
        string-`jti` control, both logout tests and both MSC3861 tests pass.
    -   After the second review, on the code before `85df7cc` and `5bad47c`:
        `test_logout_token_with_unusable_key_is_refused_with_400` fails (HTTP 500) and `test_unusable_hmac_secrets_are_refused` fails (no
        `ConfigError`). With the patches both pass.
    -   After the third review, the two changed modules on the code before
        `93d3024` and `7babe24` (`cfd9ab0`), under 1.9.1:
        `test_unusable_hmac_secrets_are_refused`,
        `test_empty_client_secret_is_refused`,
        `test_jwk_for_another_algorithm_is_refused` and
        `test_jwk_that_cannot_sign_is_refused` fail, and
        `test_usable_hmac_secrets_are_accepted` and the two `/login` tests
        error, because `cfd9ab0` refuses the key set. With the patches all 13
        pass. Under 1.6.12 with the patches, only
        `test_unusable_hmac_secrets_are_refused` fails, on the PEM and SSH
        forms that 1.6.12 can use.
    -   Also after the third review, through a homeserver on `cfd9ab0`, under
        each version: a JWK with `"alg": "RS512"`, a public JWK and
        `use: enc`, and an empty `client_secret` for `client_secret_jwt` and
        `client_secret_post`. The results are in
        [Two side effects](#two-side-effects).
    -   After the fourth review, `test_jwt_secret_config` on `93d3024`'s
        `config/jwt.py`, under 1.9.1: `test_unusable_algorithms_are_refused`
        fails (`algorithm: none` parses), and
        `test_mixed_key_sets_are_accepted_with_a_warning` and both
        `JwtLoginWithMixedKeySetTestCase` tests error
        (`Missing required field: "k"`). With `d084e96` all 10 pass. Under
        1.6.12 with `d084e96` only `test_unusable_hmac_secrets_are_refused`
        fails, on the PEM and SSH forms, as before.
    -   After the fifth review, `test_jwt_secret_config` on `d084e96`'s
        `config/jwt.py` (the one at `b0b738f`), under 1.9.1:
        `test_key_set_members_with_a_non_string_kid_are_refused` and
        `test_a_token_under_a_non_string_kid_gets_no_login` fail (no
        `ConfigError`), and the other 10 pass. A probe of the eight sets
        and the `/login` test's two through `HomeServerConfig` on that code
        accepted nine of the ten, under 1.6.12 and 1.9.1, and refused the
        tenth, `kid: 5` after an empty `k`, for the `k`. With `6484756` all
        12 pass under 1.9.1, and under 1.6.12 only
        `test_unusable_hmac_secrets_are_refused` fails, on the PEM and SSH
        forms, as before. The first draft of the `/login` test built the
        homeserver with `setup_test_homeserver`. On the old code that
        homeserver left a thread-pool worker running and trial never
        exited, so the test parses the config instead, as that helper does
        first.
    -   After the sixth review, `test_jwt_secret_config` with `05dfc10`'s
        `config/jwt.py`, under 1.9.1: `test_non_boolean_enabled_is_refused`
        fails (no `ConfigError`). With `05dfc10`'s template,
        `test_railway_template_leaves_jwt_login_off` fails
        (`'${JWT_ENABLED:-false}' is not False`). The other 14 pass in each.
        With both changes all 15 pass under 1.9.1, and under 1.6.12 only
        `test_unusable_hmac_secrets_are_refused` fails, on the PEM and SSH
        forms, as before. The test's `_envsubst` gave output byte-identical
        to gettext-base 0.21's `envsubst` for the old and the new template,
        each with no variable set and with `.env.example`'s values plus
        `JWT_ENABLED=true`.

-   **`blackout_runtime_tests`:** 85 passed before and after, and again after
    each of the six reviews, run with `pytest -q` as the fork's
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
    After the second review, ruff, black and isort pass on the four changed
    Python files (`oidc.py`, `config/jwt.py` and the two test modules). mypy
    on them reports 56 errors, in 28 other files that this branch does not
    touch (`synapse/http/proxyagent.py`, `tests/server.py` and others), and
    none in the four. The same command on a `git archive` of the previous
    head reports the same 56. Why the round before counted one is not known;
    the comparison, not the count, is what this shows. After the third
    review, ruff, black and isort pass on the four changed Python files
    (`config/jwt.py`, `config/experimental.py` and the two test modules),
    and mypy reports the same 56 errors, line for line, on the branch and on
    `cfd9ab0`, none of them in the four. After the fourth review, ruff and
    isort pass on `config/jwt.py` and its test module, and black does once
    it had rewrapped four lines of the test. mypy first reported a 57th
    error, in `config/jwt.py` (a `[None]` list where `List[str]` was
    inferred); with that fixed it reports the same 56, line for line, as
    the third review's run. After the fifth review, ruff, black and isort
    pass on `config/jwt.py`, `api/auth/msc3861_delegated.py` and the JWT
    test module, and mypy on the three reports the same 56 errors, line for
    line, as on `b0b738f` and as the fourth review's run, none in the
    three. After the sixth review, ruff, black and isort pass on
    `config/jwt.py` and its test module. mypy first reported three errors
    in the new test code (tuples of dicts inferred as `object`); with
    annotations it reports the same 56, line for line, as the fifth
    review's run, none in the two.
-   **Desktop:** as in [Verification](#verification).
-   **gitleaks 8.21.2** over `origin/develop..HEAD`: no leaks, after each
    review too. The MSC3861 test generates its RSA and EC keys at run time,
    and so does the JWT test its EC key, so no key is committed.
-   **prettier 2.8.1**, the root's version, on the changed Markdown and YAML:
    clean. After the sixth review, on this record and `PATCHES.md`; the
    other files that round changed are under `apps/blackout-server/`, which
    `.prettierignore` leaves to upstream's formatting.
-   **No pre-commit hook ran.** `core.hooksPath` is `.husky/_`, which this
    worktree does not have (pnpm's `prepare` script creates it), so git ran no
    hook. The hook's two steps were run by hand before each commit, the
    fourth to sixth reviews' included, and both passed: lint-staged's
    `prettier --write --ignore-unknown` on the staged files (as `--check`),
    and `tools/ci/check-auth-secrets.mjs`.

## Found outside scope (not fixed here)

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
    For this change, see [Before merge or release](#before-merge-or-release).
    Making the workflow build on pull requests to `develop` is the lasting
    fix, and is left to whoever owns that workflow. Until the fourth review
    no PR job scanned the desktop lock either: `security.yml`'s paths filter
    did not list `blackout-desktop/**`. It does now (`b3cd1b3`), with
    `services/**` and `.trivyignore`.
3.  **Two older ignores rest on reasons the advisory data no longer
    supports.** Both still apply to this branch's gate (see the emptied-file
    row in [The gate](#the-gate)), and both belong to `pnpm-lock.yaml`, not to
    the two lockfiles this record covers. The `-v47` branch now handles both.

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

    Neither is changed here. The `-v47` advisory branch (PR #994), which covers
    `pnpm-lock.yaml`, handles both in its own record
    (`dependency-advisories-2026-10-30.md` on that branch):

    -   **react-router: fixed there.** `71548f0350` ("fix(deps): react-router
        7.18.2 fixes GHSA-qwww-vcr4-c8h2; drop its ignores") moves the client
        to 7.18.2 and removes the ignore from all three lists. The first two
        versions of this record said `-v47` asked the operator to choose an
        option; that was before `71548f0`. Until `-v47` merges, this branch's
        gate still applies the old ignore (Trivy `--show-suppressed` lists it
        against 7.18.0), and from 2026-10-31 the OSV step fails on this
        branch's PR as on any other, because a pull request's checks run on
        its merge with `develop`. The plan is to merge this branch into
        PR #994 once both are clean, so that the two land together and this
        branch's changes are never checked without `71548f0350`.
    -   **image-size: recorded there.** Item 8 of its "Found outside the
        gates" says the premise is out of date and that a metro update should
        remove image-size. The ignores stay until 2026-11-30.
    -   **The `.trivyignore` header.** It says the file mirrors
        `osv-scanner.toml` and `pnpm.auditConfig`. That was never true of the
        Twisted entries. `-v47`'s `26e6ce5` rewrites the header to say which
        entries differ and why, the Twisted ones included. This branch leaves
        the header alone so the two do not conflict (`git merge-tree` of the
        two branches reports none), and says it in the Twisted block instead.

4.  **Four RustSec advisories in the desktop lock (fifth review).** OSV lists
    them without a GHSA severity, so the gate summary, which counted GHSA
    severities, did not name them, and Trivy, which loads no RustSec-only
    advisory, does not see them. All four are on `develop` at the same
    versions. None is changed here; each is left for its own change. The
    paths are from `cargo tree -i <crate> --target <triple> --locked`, and
    each use was read in the crate's source:

    -   **RUSTSEC-2026-0194 and RUSTSEC-2026-0195, quick-xml 0.37.5 and
        0.38.4** (CVSS 3.1 `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`, 7.5; fixed
        in 0.41.0): quadratic time in the duplicate-attribute check of
        `BytesStart::attributes()`, and unbounded allocation in `NsReader`'s
        namespace resolution. 0.37.5 is built for Windows only, through
        tauri-plugin-notification 2.3.3, notify-rust 4.12.0 and
        tauri-winrt-notification 0.7.2. That crate calls only
        `quick_xml::escape::escape`, to build a toast's XML; it parses
        none. 0.38.4 comes in through plist 1.8.0, from tauri-utils 2.10.2
        on every platform and from tauri 2.12.5 on macOS. plist reads XML
        with quick-xml's plain `Reader`, never `NsReader`, and never asks
        for a tag's attributes. tauri-utils only writes a plist (file
        associations). At run time tauri reads only the app bundle's own
        `Info.plist`, on macOS, when the app restarts itself; at build time
        tauri-codegen reads the project's. Neither advisory's code path
        runs, and no XML the app parses comes from outside its own bundle.
    -   **RUSTSEC-2026-0382, rustls-webpki 0.103.13** (no rating; fixed in
        0.103.16; also CVE-2026-111943): a certificate path through one of
        the distrusted emSign intermediates, whose private keys are known,
        may be accepted. On every desktop target it comes in through
        rustls 0.23.37, reqwest 0.13.2 and tauri-plugin-updater 2.14.1. The
        updater is the only Rust code in the app that makes TLS
        connections: tauri's own reqwest is built for Android and iOS only,
        and the webview has its own TLS stack. The updater's reqwest checks
        certificates with rustls-platform-verifier 0.6.2, which on Linux
        verifies the chain with rustls-webpki against the system roots, and
        on Windows and macOS hands it to the operating system. So on Linux
        the updater's HTTPS fetch of `latest.json` and of the package could
        accept such a path while the system store trusts the emSign root.
        Nothing in the app calls the updater today (the main window is
        granted `updater:default`, but no shipped code invokes it), and a
        package must still pass the minisign signature check before it is
        installed.
    -   **RUSTSEC-2026-0383, webpki-root-certs 1.0.6** (no rating; fixed in
        1.0.10): its bundled roots include emSign ECC Root CA - G3. In this
        lock only rustls-platform-verifier depends on it, and only for
        wasm32. `cargo tree -i webpki-root-certs` finds it for no Linux,
        Windows or macOS target, so no desktop build contains it.

    OSV also lists, in the same lock, eight advisories with a GHSA severity
    below High. The fifth review's list left them out; the sixth review's
    sweep (2026-10-31 03:00 UTC) has them. Each is on `develop` at the same
    version, the gate's severity filter does not reach them, and none is
    changed here:

    -   **rustls 0.23.37** (fixed in 0.23.45 or 0.23.46):
        GHSA-2mjx-qc3c-rqvc (Moderate, TLS 1.3 handshake messages accepted
        across encryption levels), GHSA-c8m5-c952-6cm4 (Moderate, `Debug` of
        a client session value shows its secrets), GHSA-h2v8-394m-p7vv
        (Low, Brotli certificate decompression, off by default) and
        GHSA-w44r-93j7-qv28 (Low, an unauthenticated ServerHello downgrades
        later key exchanges for that name). The same path and reasoning as
        RUSTSEC-2026-0382: rustls comes in only through reqwest 0.13.2 and
        the updater, on every desktop target; nothing in the app calls the
        updater; and a package must still pass the minisign check.
    -   **tar 0.4.45**, GHSA-3pv8-6f4r-ffg2 (Moderate, fixed in 0.4.46): a
        PAX header applied to the wrong entry. Only tauri-plugin-updater
        uses it, on Linux and macOS (`Cargo.toml` lines 173 and 187), to
        unpack an update in `install_inner` (`src/updater.rs` 1283 and
        1517), after the same signature check as zip.
    -   **glib 0.18.5**, GHSA-wrw7-89jp-8q8g (Moderate, fixed in 0.20.0):
        unsound `Iterator` impls of `VariantStrIter`. Linux only, through
        the GTK 3 stack tauri uses there (atk, gtk, muda, tray-icon). The
        app's own code does not call glib; whether a dependency iterates a
        `VariantStrIter` was not checked.
    -   **serde_with 3.18.0**, GHSA-7gcf-g7xr-8hxj (Moderate, fixed in
        3.21.0): `KeyValueMap` serialization panics on an empty entry. It is
        built only into the build-time copy of tauri-utils (under
        tauri-build, tauri-codegen, tauri-macros and tauri-plugin's build
        script); `cargo tree` shows no path from the runtime copy.
    -   **rand 0.9.2**, GHSA-cq8v-f236-94qc (Low, fixed in 0.9.3): unsound
        only when a custom `log` logger calls `rand::rng()`. It comes in
        through tauri-plugin-notification 2.3.3, and the app's code installs
        no logger.

    And seven RustSec notices with no rating: unsoundness in anyhow
    1.0.102, event-listener 5.4.1 and tokio 1.50.0, and four unmaintained
    crates (proc-macro-error, zbus_names, zvariant, zvariant_derive). They
    are not triaged here.

5.  **The Railway template renders every `${VAR:-default}` as text (sixth
    review).** `apps/blackout-server/services/blackout-server/entrypoint.sh`
    renders `homeserver.yaml.template` with plain `envsubst` at every start
    of the `managed` profile; it is the only `envsubst` user under
    `apps/blackout-server` (`git grep`). gettext's `envsubst` expands only
    `$NAME` and `${NAME}`, so each `${VAR:-default}` stays as written,
    whatever the environment holds. Rendered here (see [Method](#method))
    with no variable set and with `.env.example`'s values, then parsed with
    `HomeServerConfig` one fault at a time:

    | Setting                               | Renders as                                                 | What Synapse does with it                                                                                                                                                             | Kind                             |
    | ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
    | `listeners[0].port`                   | `${PORT:-8008}`                                            | refuses the config, before any other check: `Listener configuration is lacking a valid 'port' option`                                                                                 | deploy: the service cannot start |
    | `database.args.database`, `.user`     | `${DATABASE_NAME:-blackout}`, `${DATABASE_USER:-blackout}` | passes them to psycopg2 unchanged; they are not the database and role `.env.example` names                                                                                            | deploy                           |
    | `database.args.port`                  | `${DATABASE_PORT:-5432}`                                   | passed to psycopg2 unchanged; what libpq does with it was not run (no psycopg2 here)                                                                                                  | deploy                           |
    | `redis.port`                          | `${REDIS_PORT:-6379}`                                      | loads; `connectTCP`, which `synapse/replication/tcp/redis.py` calls with it, raises `ServiceNameUnknownError`                                                                         | deploy                           |
    | `jwt_config.enabled`, `.secret`       | `${JWT_ENABLED:-false}`, `${JWT_SECRET:-}`                 | JWT login on, with a secret anyone can read                                                                                                                                           | security: fixed in `48ab32d`     |
    | `turn_uris[0]`                        | `${TURN_URIS:-turn:turn.example.org:3478?transport=udp}`   | hands it to clients as is (`/voip/turnServer`); no client can use it                                                                                                                  | deploy: no TURN                  |
    | `turn_shared_secret`                  | `${TURN_SHARED_SECRET:-changeme}`                          | signs the TURN credentials it hands out; a TURN server accepts them only if given that literal, and `docker/compose.turn.yaml` gives coturn `TURN_SHARED_SECRET` from the environment | deploy; fails closed             |
    | `blackout.fbm_api_url`, `.ollama_url` | `${FBM_API_URL:-}`, `${OLLAMA_URL:-}`                      | nothing: no Python code reads either key                                                                                                                                              | none                             |

    The switches that matter most render as meant: `enable_registration`
    and `enable_registration_without_verification` use plain `${VAR}`, and
    an unset one renders empty and stops startup
    (`invalid truth value 'none'`); `federation_domain_whitelist: []` is a
    literal. So `jwt_config` was the only security defect, and it is fixed.
    The rest are left to whoever makes this service start: plain `${VAR}`
    with the defaults in `.env.example`, as the template's own comment above
    `enable_registration` already asks, or a renderer that expands defaults.
    That change also has to give the image authlib (`--extras jwt` or
    `all` in its `poetry export`, as `docker/Dockerfile` has) or drop the
    `jwt_config` block: `check_requirements("jwt")` runs for any non-empty
    `jwt_config`, so without authlib the block stops startup even with
    `enabled: false` (measured with authlib hidden from that check).

    `deploy/docker/blackout-backend`'s Synapse template has no such
    expression outside a comment. Its two appservice templates under
    `integrations/templates/` have sixteen; they are outside
    `apps/blackout-server`, rendered by hand as their README says, and were
    not analysed here.

## Not verified

-   A desktop build on Windows, macOS or ubuntu-22.04, a bundle, a build with
    the real client, a run on any platform, and the updater against a real
    release. Only the Linux release build above ran. See
    [Before merge or release](#before-merge-or-release).
-   That libdbus-1-dev is installed on the runner was read from jammy's
    package dependencies, not from a run of the job.
-   A Docker build of the fork image, and Synapse against a real OIDC provider.
    In particular, the `none` and `aud`/`azp` behaviour was checked only
    against the test suite's fake provider and in direct probes of authlib.
    What Keycloak and Authentik advertise was read from their source.
-   MSC3861 against a real authorization server. The tests check the form
    Synapse posts, not a server's acceptance of it. Nor was the startup
    check tried with a JWK exported from Keycloak or Authentik, only with
    keys made in the tests.
-   Twisted 26.10.0 against the trial suite.
-   The malformed logout tokens under authlib 1.6.12 after `85df7cc`. This
    round measured 1.9.1; the second review measured both versions before it.
-   A bound on the JWKS refetch, or a rate limit on `/_synapse/client`. Both
    are follow-ups ([Malformed logout tokens](#malformed-logout-tokens)).
-   The JWT checks against an operator's real configuration. The one
    Blackout template with a `jwt_config`, the Railway one, has JWT login
    off now; it was rendered and parsed, not run in its image, which cannot
    start ([Found outside scope](#found-outside-scope-not-fixed-here)). Until
    the sixth review this item said no Blackout template enables
    `jwt_config`. Nor was the key-set warning tried with a real identity
    provider's JWKS; the test's EC key is made at run time.
-   The Railway image itself, neither built nor started. Its template was
    rendered with Ubuntu's gettext-base 0.21, which matches the image's
    Debian package in upstream release only, and what psycopg2 does with the
    database values was not run.
-   pyasn1's decode through a real TLS handshake, or the reactor stalling on
    one. The cost was measured on `extract_patterns` directly. That the
    hostname check runs only after the chain has validated, on the reactor
    thread, was read from Twisted's and Synapse's code. ldap3's use of
    pyasn1 was not measured here; the fifth review's ldap3 bind and search
    gave the same result under 0.6.4 and 0.6.5.
-   The trial tests that check a peer's certificate after a TLS handshake.
    This sandbox's proxy variables stop them (see [Validation](#validation)),
    and `HTTPS_PROXY` was not unset to run them.
-   The four RustSec advisories in the desktop lock against a running app.
    Their exposure was read from `cargo tree` and the crates' source.
-   Whether Trivy's database of 2026-10-31 01:14 UTC adds advisories against
    `pnpm-lock.yaml` is for `-v47` to see; on this branch it adds none
    above the ignored seven.
