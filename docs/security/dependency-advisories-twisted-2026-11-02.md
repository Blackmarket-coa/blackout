# Twisted 26.10.0 in the Synapse fork — 2026-11-02

Scope: the Synapse fork's `apps/blackout-server/poetry.lock` moves from Twisted
26.4.0 to **26.10.0**, the release that fixes the four High advisories
`.trivyignore` has carried against 26.4.0 since 2026-10-26 and 2026-10-30
(three entries from the 2026-10-25 triage, committed 2026-10-26 01:28 UTC,
`synapse-dependencies-triage-2026-10-25.md`; the fourth from
`dependency-advisories-server-desktop-2026-10-30.md`). Those four entries
carry `exp:2026-11-30`; on that day the **Trivy filesystem scan** check
(`security.yml`) would have gone red on every push to `develop`, in the merge
queue, and on every PR that touches a path the workflow watches (`apps/**`,
`packages/**`, `infra/**`, `deploy/**`, `blackout-desktop/**`, `services/**`,
the lockfile, the ignore files and the workflow itself; a docs-only PR starts
no run). They are removed here, with the lock that makes them unnecessary.
The same change corrects the reason the two image-size ignores give, which
has been false since 2026-09-14. The operator approved the one PR on
2026-11-02. The second review of the change found that the fork's manhole
could not start on either Twisted version, a fork bug from 2026-09-13 that the
bump neither caused nor changed; it is fixed here as a one-line change with
tests, in commit `20362e4` (which also carries this record's second-round
corrections: the pre-commit prettier step's `git add -u` staged the record
with the fix, and the rules forbid amending), so the operator can still split
it out by reverting that commit's three fork files if the approved scope is to
stay exact ([The manhole](#the-manhole-could-not-start)).

| Package (lock)         | Advisory                              | Severity | Fixed in               | Outcome                                   |
| ---------------------- | ------------------------------------- | -------- | ---------------------- | ----------------------------------------- |
| Twisted 26.4.0 (fork)  | GHSA-3476-c5c2-fr73 (CVE-2026-115775) | High     | 26.10.0rc1             | bumped to 26.10.0; ignore removed         |
| Twisted 26.4.0 (fork)  | GHSA-53xc-49m8-p798 (CVE-2026-115776) | High     | 26.10.0rc1             | same                                      |
| Twisted 26.4.0 (fork)  | GHSA-cwm5-jh59-mwxr (CVE-2026-115778) | High     | 26.10.0rc1             | same                                      |
| Twisted 26.4.0 (fork)  | GHSA-vpp8-g58w-m8mp (no CVE alias)    | High     | 26.10.0rc1             | same                                      |
| Twisted 26.4.0 (fork)  | GHSA-q7qq-6mhp-9rc4 (CVE-2026-115877) | Moderate | 26.10.0rc1             | bumped to 26.10.0 (was below the gate)    |
| Twisted 26.4.0 (fork)  | GHSA-2qrf-pqgx-qh9v (CVE-2026-115774) | Moderate | 26.10.0rc1             | same                                      |
| Twisted 26.4.0 (fork)  | GHSA-jj36-9pvh-vj5r (CVE-2026-83813)  | Low      | 26.10.0rc1             | same                                      |
| Twisted 26.4.0 (fork)  | GHSA-8pqf-f4m5-798g (CVE-2026-106454) | Moderate | none listed            | not reachable; see [its item](#ghsa-8pqf) |
| image-size 1.2.1 (npm) | GHSA-5p2g-fcmc-qvqq (CVE-2025-71329)  | High     | 2.0.3 (1.x has no fix) | ignore kept; its reason corrected         |
| image-size 1.2.1 (npm) | GHSA-w3rx-r6r6-pgpr (CVE-2025-71330)  | High     | 2.0.3 (1.x has no fix) | same                                      |

**Result:**

-   **Twisted moves to 26.10.0, and zope-interface from 6.0 to 8.7.** Nothing
    else in the lock changes. 26.10.0 requires `zope-interface>=8`, which is
    the whole reason zope-interface moves; upstream Synapse runs on
    zope-interface 8.2 already. The wheel and sdist hashes in the lock match
    PyPI's. None of the APIs 26.10.0 removed or changed is used by the fork in
    a way that behaves differently (read against the release notes, run
    through the suite, and booted). One fork source file changes, for a bug
    that predates the bump: `synapse/util/manhole.py` called a `Key` method
    Twisted has never had, so a homeserver with a manhole listener and no
    configured key died at startup under 26.4.0 and 26.10.0 alike
    ([The manhole](#the-manhole-could-not-start)).
-   **The four Twisted entries leave `.trivyignore`, with their CVE aliases.**
    `.trivyignore` now holds pnpm-lock.yaml entries only; its header,
    `security.yml`'s comment and the `pyproject.toml` comment say so.
-   **The image-size ignores stay, with a true reason.** Both files said no
    fixed version existed. OSV and GitHub have listed 2.0.3 as the fix since
    2026-09-24. The entries stay because the one consumer, metro 0.83.5,
    cannot take 2.x (it passes a file path, which 2.x's `imageSize()`
    refuses), and the fix path is a metro update within its allowed range,
    which removes image-size altogether. That update is a React Native
    toolchain refresh of its own and was not approved for this PR; the
    deadline stays 2026-11-30, and `.trivyignore`'s four image-size lines now
    carry `exp:2026-11-30` too, where before only the OSV gates enforced the
    date.
-   **No operator-visible change from the bump.** The suite, compared test
    by test before and after, has the same outcomes, and a generated-config
    homeserver boots and answers under both versions. Three hardenings in
    26.10.0 are visible only to a peer that misbehaves ([Behaviour changes](#what-changed-in-the-modules-the-fork-imports));
    no `upgrade.md` section was added. The manhole fix is visible in one
    way: a `type: manhole` listener without `ssh_priv_key_path` now starts
    instead of killing the homeserver.

---

## Method

-   **Scanner:** Trivy 0.69.3, from the GitHub release tarball whose sha256
    (`1816b632…`) matches `trivy_0.69.3_checksums.txt`; the extracted
    binary's sha256 (`8266084a…`) matches the one inside the tarball. Its
    vulnerability database was downloaded fresh at 2026-11-02 01:31 UTC for
    the first round's runs; the `UpdatedAt` 2026-11-01 19:08 UTC and
    `NextUpdate` 2026-11-02 19:08 UTC quoted for that download were read at
    the time and not retained (the download log holds no metadata line). A
    later download at 02:26 UTC replaced the cache with the database of
    2026-11-02 01:14 UTC (`NextUpdate` 2026-11-03 01:14 UTC), the one on
    disk now; the second round's runs used it, and Trivy's own
    `--download-db-only` at 03:25 UTC found nothing newer and left it. Run
    with `security.yml`'s flags (`fs`, `--scanners vuln`,
    `--severity CRITICAL,HIGH`, `--ignore-unfixed`,
    `--ignorefile .trivyignore`, `--exit-code 1`) over `git archive` exports
    of this branch and of `develop`, plus `--skip-db-update` so every run used
    that one database, and `--format json` to count.
-   **Advisory text:** the OSV API (`/v1/vulns/<id>`) and GitHub's own records
    in `github/advisory-database` (`raw.githubusercontent.com`) for all ten
    advisories above; the ranges are identical in both for every one of them.
    GitHub's advisory pages, its REST API and Twisted's GitHub release pages
    were not reachable from this session (repository-bound 403), so the
    release notes come from `NEWS.rst` inside the 26.10.0 sdist, whose sha256
    matches PyPI's.
-   **PyPI:** the JSON API for `twisted/26.10.0` and `zope-interface/8.7`,
    fetched 2026-11-02; every `files` hash in the new lock entries was
    compared with `digests.sha256` there (2 of 2 and 50 of 50 match).
-   **Lock:** poetry 1.3.2, the version `docker/Dockerfile` installs, with
    `lock --no-update` after raising the floor, as the authlib and pyasn1
    bumps did; then `lock --check`, `.ci/scripts/check_lockfile.py` and
    `scripts-dev/check_locked_deps_have_sdists.py`.
-   **Upstream Synapse:** `element-hq/synapse` `develop` at `cc172f7`
    (fetched 2026-11-02): it still locks Twisted 26.4.0 and zope-interface
    8.2. Nothing to port.
-   **Tests:** trial under Python 3.11.17 in two venvs. The baseline venv is
    the one the 2026-10-30 record's fourth to sixth reviews used
    (`develop`'s lock: Twisted 26.4.0, authlib 1.9.1, pyasn1 0.6.5); the
    task's plan named an older copy as the baseline and this one for
    deletion, but that copy had pyasn1 0.6.4, so the two were swapped. The
    after venv is a copy of it with Twisted 26.10.0 and zope.interface 8.7
    installed from the lock's hashes (`pip install --no-deps
--require-hashes`; `pip check` is clean and `pip list --format=freeze`
    differs by those two lines) and with the fork re-installed editable from
    this branch's tree, so its `dist-info` carries the new floor
    (`Twisted[tls] (>=26.10.0)`) where the baseline's says `>=26.4.0`. That
    is what the fork's import-time floor check reads
    (`synapse/util/check_dependencies.py` calls `metadata.requires()` on the
    installed distribution, not `pyproject.toml`): the baseline venv imports
    this branch's tree without complaint, and the after venv would refuse
    Twisted 26.4.0. The baseline runs from a `git archive` of `develop`'s
    fork directory, which its editable install points at; the after runs
    from this branch's tree. Both trees carry the same
    `synapse_rust.abi3.so` (same sha256). Each heavy run started only when the
    machine's 1-minute load was under 3, with `-j2`. One 18-minute first
    attempt at the targeted run was discarded: the runner script had created
    the `--temp-directory` itself, trial refused to remove a directory
    without its marker, and the parent then waited for workers that never
    started. A probe without the pre-made directory ran 23 tests in the after
    venv (the one successful probe log kept; the baseline venv's probe log is
    the reproduced refusal), and the runs below followed. The second round
    ran the new manhole test module under both venvs with this branch's tree
    first on `PYTHONPATH`, then the targeted modules and the full suite again
    from the after venv.
-   **Boot:** `synapse.app.homeserver --generate-config` into a scratch
    directory (sqlite, `localhost`, the 8008 listener on loopback), then the
    homeserver started from each venv, polled on `/health` and
    `/_matrix/client/versions`, stopped with SIGTERM, and its logs read. The
    first round's script ran with the fork tree as its working directory, so
    the generated log config named `<tree>/homeserver.log` (gitignored by the
    fork's `/*.log`) and the log landed there; the script's own grep of the
    scratch path found nothing, the file was read and moved into the scratch
    directory afterwards, and the worktree was clean. The second round's
    script runs from the scratch directory with the tree on `PYTHONPATH`, so
    the log lands beside the config, and it adds a loopback `type: manhole`
    listener and a twisted.conch client that authenticates, opens a shell,
    evaluates `1+1` and then sends a second shell request on the same channel.
-   **npm:** the registry's JSON for `image-size` (dist-tags, versions,
    publish times); metro 0.83.5's `src/Assets.js` and `package.json` from
    the worktree's `node_modules`; image-size 2.0.4's and metro 0.83.8's
    manifests and type declarations from registry tarballs saved in this
    session's scratch directory; `pnpm why image-size -r` over the worktree.

## Twisted 26.4.0 → 26.10.0

PyPI published 26.10.0 on 2026-10-30 at 09:24 UTC (wheel
`twisted-26.10.0-py3-none-any.whl`, sha256 `3732f42a…`; sdist
`twisted-26.10.0.tar.gz`, sha256 `5f035540…`), `requires_python >=3.10`; its
notes call it the last release to support Python 3.10. The fork is
`python = "^3.11"`. Its `NEWS.rst` says: "No changes since 26.10.0rc2. Since
26.10.0rc1, this release added the fix for #12885", a websocket delivery fix,
and lists the fixes for CVE-2026-83813, CVE-2023-44487, CVE-2026-115778,
CVE-2026-115775, CVE-2026-115877, CVE-2026-115774 and CVE-2026-115776. So
everything OSV dates to 26.10.0rc1 is in 26.10.0.

### The advisories

OSV's range for each of the seven fixed ones is `introduced 0`,
`fixed 26.10.0rc1`; GitHub's record has the same range and
`last_known_affected_version_range: <= 26.4.0`. None lists 26.10.0 among its
affected versions. Trivy and osv-scanner both treat 26.10.0 as fixed
(26.10.0 > 26.10.0rc1).

| Advisory                              | GitHub severity (CVSS)                   | Published  | Where in Twisted                                                     | Reachable from the fork                                                                                                                          |
| ------------------------------------- | ---------------------------------------- | ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GHSA-3476-c5c2-fr73 (CVE-2026-115775) | High (4.0: VA:H)                         | 2026-10-23 | `twisted.words.xish` domish XML stream, unbounded element tree       | No. `twisted.words` is never imported (checked under both versions).                                                                             |
| GHSA-53xc-49m8-p798 (CVE-2026-115776) | High (3.1: 7.5)                          | 2026-10-23 | `twisted.words.protocols.irc` server, unbounded line buffer          | No. Same.                                                                                                                                        |
| GHSA-cwm5-jh59-mwxr (CVE-2026-115778) | High (3.1: 7.5)                          | 2026-10-23 | `twisted.conch.telnet`, unbounded subnegotiation buffer              | No. `twisted.conch.telnet` is never imported; the manhole uses `conch.manhole_ssh`.                                                              |
| GHSA-vpp8-g58w-m8mp (no CVE alias)    | High (3.1: 7.5)                          | 2026-10-29 | `twisted.web._http2` rapid stream reset (the CVE-2023-44487 class)   | No. `twisted.web._http2` is never imported; h2 and priority are not in the lock (`H2_ENABLED` False), and no listener negotiates ALPN.           |
| GHSA-q7qq-6mhp-9rc4 (CVE-2026-115877) | Moderate (3.1: 5.4)                      | 2026-10-23 | `twisted.web.http` header parsing: a bare CR or LF in a header value | In principle, through `twisted.web` behind nginx; the 2026-10-25 triage judged nginx's header rebuild to block it, unverified. Fixed now anyway. |
| GHSA-2qrf-pqgx-qh9v (CVE-2026-115774) | Moderate (3.1: 4.9)                      | 2026-10-23 | `twisted.mail.imap4` server, negative literal size in SEARCH         | No. `twisted.mail.imap4` is never imported (only `twisted.mail.smtp`).                                                                           |
| GHSA-jj36-9pvh-vj5r (CVE-2026-83813)  | Low (3.1: 3.1)                           | 2026-10-27 | `twisted.names.dns.DNSDatagramProtocol.query`, no source check       | Yes: Synapse's SRV lookups use `twisted.names`. Fixed now.                                                                                       |
| GHSA-8pqf-f4m5-798g (CVE-2026-106454) | Moderate (3.1: 4.3; needs an IMAP login) | 2026-10-07 | `twisted.mail.imap4.wildcardToRegexp()` ReDoS                        | No. `twisted.mail.imap4` is never imported.                                                                                                      |

<a id="ghsa-8pqf"></a>**GHSA-8pqf-f4m5-798g** is the one Twisted advisory the
scanners can still match: OSV's and GitHub's range is `introduced 0`,
`last_affected 26.4.0`, with no fixed version, so neither reports 26.10.0 for
it (and Trivy's `--ignore-unfixed` drops it in any case). Whether 26.10.0 fixes
it is not stated by either database or by `NEWS.rst`'s CVE list. Read in the
two installed copies: 26.4.0's `wildcardToRegexp` interpolates the client's
pattern into a regular expression as given; 26.10.0's splits it on `*` and
`%` and `re.escape`s every other part (the `NEWS.rst` entry "twisted.mail.imap4
no longer allows clients to specify arbitrary regexes", #12787). That removes
the client-controlled regex syntax the advisory describes. It is noted, not
relied on: the IMAP4 server is not imported by Synapse.

Twisted's notes attribute the HTTP/2 fix to CVE-2023-44487, the generic Rapid
Reset identifier; GitHub's record carries no CVE alias, and Trivy matched that
one by GHSA (the other three by CVE), as the 2026-10-30 record found.

### What changed in the modules the fork imports

Every removal, deprecation and behaviour change in 26.10.0's `NEWS.rst`, read
against `synapse/`, `blackout_runtime/`, `tests/` and `blackout_runtime_tests/`:

| Change (ticket)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The fork                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tcp.Connection` no longer honours a non-None return from a protocol's `dataReceived` (deprecated since 11.0) (#12688)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Four `dataReceived` definitions in `synapse/` (`http/client.py` twice, `http/proxy.py`, `http/connectproxyclient.py`); only `HTTPConnectProxyClient` returns a value: the wrapped protocol's own return, which is None for the HTTP client protocols it wraps. Upstream's file has the same `return` statements. 26.4.0 warned on a non-None value; nothing returns one. `tests.http.test_proxyagent` covers the class.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `LoggingFile.fileno()` raises `io.UnsupportedOperation` instead of returning -1 (#9638)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `synapse/app/_base.py`'s `redirect_stdio_to_logs()` installs `LoggingFile` on `sys.stdout` and `sys.stderr`; `homeserver.py` and `generic_worker.py` call it unless `no_redirect_stdio` is set. Nothing in `synapse/`, `blackout_runtime/` or `tests/` calls `fileno()` on them (the one `fileno()` call, in `replication/tcp/protocol.py`, is on a socket handle). The boot check runs this path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `conch.ssh.session.SSHSession` allows one shell, exec or subsystem request per channel (#12800)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | The manhole (`synapse/util/manhole.py`, `manhole_ssh.TerminalRealm`) uses it once it starts, which until this change it could not ([The manhole](#the-manhole-could-not-start)). Probed on a running homeserver from this branch: under 26.10.0 a second shell request on the same channel is refused and logged (`multiple session-client requests sent to the same session`); under 26.4.0 it is accepted. Ordinary SSH clients send one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `HTTPChannel.headerReceived` rejects a header value with a bare CR or LF (#12754, GHSA-q7qq)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `synapse/http/site.py` subclasses `Request` and `Site` and overrides neither `headerReceived` nor `lineReceived`. A client sending such a value now gets 400 and the connection closed where the value was parsed before. Hardening, not configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `DNSDatagramProtocol.query` discards a response from a host other than the one queried (#12696, GHSA-jj36)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Synapse's SRV lookups. A resolver that answers from a different address than it was queried on now fails those lookups. Hardening, not configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `AsyncioSelectorReactor.callLater` / `callFromThread` signatures aligned with the interfaces (#12767)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The asyncio reactor is installed under `SYNAPSE_ASYNC_IO_REACTOR` (`synapse/__init__.py`) and, for the Complement launcher, `SYNAPSE_COMPLEMENT_FORKING_LAUNCHER_ASYNC_IO_REACTOR` (`synapse/app/complement_fork_starter.py`); `synapse/metrics/_reactor_metrics.py` only `isinstance`-checks it. No keyword arguments are passed to `callLater` or `callFromThread`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Port.startListening()` closes the socket on `CannotListenError` (#6108); port-range errors on address literals errback (#7798)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `_base.py` catches `CannotListenError`; benign.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| HTTP/2 rapid-reset limit (#12705); `Request.write` chunked writes faster (#12729); websocket complete messages (#12885)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | HTTP/2 cannot be negotiated (above); websocket not used.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Not used: `PotentialZombieWarning` removed (#12744); `IProcessProtocol` must provide `processExited` (#12824); `ssl.protocolNegotiationMechanisms` deprecated (#12868); `web.client._makeGetterFactory` removed (#12721); `names.dns.Message` class attributes removed (#12667); `names.client.ThreadedResolver` removed (#12843); `trial.runner.samefile` deprecated (#12671); `MemoryReactor.removeAll()` returns the list (#12743); `FTPClient` PASV (#12847); telnet buffer bound (#12706); imap4 and words limits (#12763, #12787, #12707, #12770); `SO_REUSEPORT` (#9101); mlkem768x25519 kex (#12520) | No process protocols or `spawnProcess`. From `twisted.internet.ssl`, `synapse/` imports `CertificateOptions`, `ContextFactory`, `TLSVersion` and `platformTrust` (`crypto/context_factory.py`), `optionsForClientTLS` (`handlers/send_email.py`) and, as `ssl.ContextFactory` and `ssl.ClientContextFactory`, the base classes in `http/client.py` and `replication/tcp/context.py`; `config/tls.py` takes `Certificate` and `trustRootFromCertificates` from the private `twisted.internet._sslverify`, and `crypto/context_factory.py` takes `_defaultCurveName` from it (still defined in 26.10.0, `_sslverify.py` line 1819; the private name is the import most likely to break on a future bump). The tests import `Certificate`, `trustRootFromCertificates`, `ContextFactory`, `ClientTLSOptions` and `OpenSSLCertificateOptions`. Neither `protocolNegotiationMechanisms` nor `ProtocolNegotiationSupport` appears anywhere in the fork. The tests use `MemoryReactorClock` without `removeAll()`; the rest are in modules the fork never imports. |

Checked by import, under each version, from each tree: after importing
`synapse.app.homeserver` and `synapse.util.manhole`, `sys.modules` holds 173
`twisted.*` modules and none of `twisted.words`, `twisted.conch.telnet`,
`twisted.mail.imap4`, `twisted.web._http2` or `twisted.web.websocket`; it holds
`twisted.names`, `twisted.conch.manhole_ssh`, `twisted.conch.ssh.session`,
`twisted.mail.smtp` and `twisted.logger._file`, and `twisted.web.http.H2_ENABLED`
is False.

### The lock

-   `pyproject.toml`: `Twisted = {extras = ["tls"], version = ">=26.10.0"}`
    (was `>=26.4.0`); the comment above it names the seven advisories, the
    zope-interface move and upstream's version.
-   `poetry.lock`, with poetry 1.3.2's `lock --no-update`: 151 packages before
    and after; `content-hash` `46f57997…` → `893bed2a…`. Exactly two entries
    change:
    -   **twisted 26.4.0 → 26.10.0.** `python-versions` `>=3.9.12` →
        `>=3.10`; its dependency floors rise to `automat>=24.8.1`,
        `hyperlink>=18.0.0`, `typing-extensions>=4.13.2`, `zope-interface>=8`
        and, for the `tls` extra, `idna>=2.5`, `pyopenssl>=25.3.0`,
        `service-identity>=21.1.0`. The lock already had automat 25.4.16,
        hyperlink 21.0.0, typing-extensions 4.13.2 (exactly the floor), idna
        3.20, pyOpenSSL 26.4.0 and service-identity 24.2.0, so none of those
        moves. The two file hashes match PyPI's.
    -   **zope-interface 6.0 → 8.7**, forced by `zope-interface>=8`. 8.7 was
        published 2026-10-15, `python-versions >=3.11`, 50 files, all hashes
        matching PyPI's (the image and the venv take
        `zope_interface-8.7-cp311-…-manylinux_2_17_x86_64…whl`, sha256
        `1613beb1…`; sdist `0b47b62e…`). The 6.0 entry's one dependency,
        `setuptools = "*"`, goes with it (8.0.1 removed the run-time
        dependency); setuptools 84.2.1 stays in the lock for setuptools-rust,
        zope-event and zope-schema.
-   `poetry export --extras all` of the old and the new lock, the image's
    install set, differ by those two lines; with `--with dev` the same.
-   `poetry lock --check`, `check_lockfile.py` and
    `check_locked_deps_have_sdists.py` (151 packages) pass.

### zope.interface 6.0 → 8.7

Two majors. From the project's changelog (PyPI's description of 8.7): 7.0
dropped Python 3.7 and moved the C extension to heap types and multi-phase
module initialisation; 8.0 dropped 3.8 and replaced the `pkg_resources`
namespace with a PEP 420 one; 8.0.1 removed the run-time setuptools
dependency; 8.1 dropped 3.9; 8.7 (`requires_python >=3.11`) adds Python 3.15
wheels and fixes data races and reference leaks in the C lookup caches. The
fork imports `implementer`
(19 modules, tests included), `provider` (one, `synapse/http/client.py`) and
`Interface` (two), and nothing else from the package; `zope.schema` 7.0.1 (`>=5.0.0`) and
`mypy-zope` 1.0.1 (`zope.interface = "*"`) do not constrain it. Upstream
Synapse `develop` already runs on zope-interface 8.2 with Twisted 26.4.0.
Whether mypy 1.5.1 with mypy-zope 1.0.1 behaves the same under 8.7 was not
checked: no Python file changed, so mypy did not run.

## The manhole could not start

Found by the second review of this change, which added a `type: manhole`
listener to the boot check. Not caused by the bump and not changed by it: the
same crash under 26.4.0 and 26.10.0, on `develop` and on this branch's first
round.

**What.** `synapse/util/manhole.py`'s `_ephemeral_rsa_key()` called
`Key.fromCryptographyKey(rsa.generate_private_key(...))`.
`twisted.conch.ssh.keys.Key` has no such method in 26.4.0 (`keys.py` lines
160, 181, 922: `fromFile`, `fromString`, `__init__`) or 26.10.0 (152, 173,
903); the constructor, `Key(keyObject)`, takes "a private or public
`cryptography.hazmat.primitives.asymmetric` key", which is what the helper
has. The line dates from commit `4af992e08e` (2026-09-13, the SAST triage
recorded in `semgrep-triage-2026-09-13.md`), which deleted upstream's
hardcoded manhole host key and generated one per process instead. That
record's own verification was semgrep on the file; no test or boot exercised
the helper, and `tests/` had no manhole test.

**Effect.** A homeserver whose config has a `type: manhole` listener and no
`ssh_priv_key_path`/`ssh_pub_key_path` logged the ephemeral-key warning and
then died. `boot.log` ends in `AttributeError: type object 'Key' has no
attribute 'fromCryptographyKey'`; `homeserver.log` has
`synapse.app._base - 267 - CRITICAL - Error during startup` with a traceback
through `homeserver.py` `start_listening`, `_base.py` `listen_manhole`,
`manhole.py` `manhole` and `_ephemeral_rsa_key`; `/health` never answered.
Reproduced in the second round from a `git archive` of `develop`'s fork
directory under 26.4.0 (`build-r2/boot-develop-mh.log`). A configured key pair
never reached the helper and worked. So the 2026-09-13 hardening had never
run, and the sentences describing it as working, in `docs/manhole.md`
("generates a fresh key for each process"), `config_documentation.md`, the fix
paragraph of `semgrep-triage-2026-09-13.md` and the worked example in the
repository's root agent-notes file ("ephemeral key generation rather than the
shipped hardcoded one"), were untrue from 2026-09-13 until this change: an
operator who followed them got a server that would not start. The first round
of this record and PATCHES.md's first-round entry described the manhole's
SSHSession behaviour under 26.10.0 as if the manhole ran; both are reworded
here.

**Fix.** `return Key(rsa.generate_private_key(public_exponent=65537,
key_size=2048))`, with a comment that states the above, in commit `20362e4`.
`manhole.py` was already a fork divergence with no PATCHES.md entry; it has
one now, covering the 2026-09-13 change and this one. No documentation
sentence needed changing: each describes what the code now does.

**Tests.** `tests/blackout_runtime/test_manhole.py`, five tests: the helper
returns a private 2048-bit RSA `Key` with a public half; two calls give
different keys; `manhole()` without a configured pair logs the warning and
serves a private key and a public key that match (`priv.public().blob() ==
pub.blob()`); a configured pair is passed through unchanged; and a real SSH
session to the factory `listen_manhole` builds, over loopback TCP with
twisted.conch's client: password authentication, `pty-req`, `shell`, the
`>>> ` prompt, `answer + 1` evaluated in the manhole namespace to `42`, the
host key shown to the client equal to the factory's public half, and both
ends closed before the test returns. All five pass under 26.10.0 and under
26.4.0 (the baseline venv with this branch's tree first on `PYTHONPATH`),
and all five error with the `AttributeError` against a `git archive` of the
head before the fix (`build-r2/trial-manhole-unfixed.log`), so they reach the
line.

**Live probes** (`build-r2/boot_probe.sh`, a generated sqlite config plus a
`127.0.0.1:9777` manhole listener, the conch client in
`build-r2/manhole_probe.py`): from this branch's tree, under 26.10.0 and
under 26.4.0, `/health` answered `OK` within 3 s, the client authenticated,
its shell request was accepted, `1+1` printed `2`, and the homeserver exited
0 on SIGTERM. Under 26.10.0 the client's second `shell` request on the same
channel was refused and the homeserver logged `twisted - ERROR - multiple
session-client requests sent to the same session` (#12800); under 26.4.0 it
was accepted (two `Getting shell` lines). The one other `ERROR` line in both
manhole logs, `Got remote error, code 10`, is the probe's own disconnect
(SSH_DISCONNECT_CONNECTION_LOST). Each manhole run's `homeserver.log` is 184
lines; normalised, the two differ only in those Twisted session lines.

**Scope.** The operator approved the Twisted lock and the image-size
correction. This fix is a third thing, kept to one line plus tests, in a
commit separate from the lock and the ignore changes (`20362e4`; it also
carries this record's corrections, see Scope) so it can be dropped from the PR
if the approved scope is to stay exact; leaving it out would leave a known startup crash in a documented
security feature with its fix in hand, and would leave this record's and
PATCHES.md's statements about the manhole describing code that cannot run.

## image-size: the ignores' reason corrected

`pnpm-lock.yaml` has image-size 1.2.1 through one path: react-native 0.82.1 →
`@react-native/community-cli-plugin` 0.82.1 → metro 0.83.5 (`image-size
^1.0.2`), reached from `packages/ui` (dependencies `react-native`,
`lucide-react-native`) and `legacy/blackout-web` (through `@blackout/ui`). No
tracked file imports image-size, no `metro.config.*` exists, and no script or
workflow runs metro or the React Native CLI (`packages/ui` builds with `tsc`,
`legacy/blackout-web` with vite).

What the two ignore files said: "No fixed version exists (all versions <=2.0.2
affected)", and the `.trivyignore` comment added "including the whole 2.x
line". What OSV and GitHub say (records modified 2026-09-24, identical in
both): GHSA-5p2g-fcmc-qvqq `introduced 1.2.0`, `fixed 2.0.3`;
GHSA-w3rx-r6r6-pgpr `introduced 0.6.3`, `fixed 2.0.3`;
`last_known_affected_version_range <= 2.0.2`. npm has 2.0.3 and 2.0.4, both
published 2026-09-14 (`latest` is 2.0.4); the 1.x line ends at 1.2.1
(2025-04-02, npm's `legacy` tag). So the reason was false on both counts: a
fix exists, and the first advisory starts at 1.2.0, not 0. The 2026-10-30
record's item 8 found this and left the correction to a later change.

Why the fix is not taken here:

-   **An override to 2.x breaks the consumer.** metro 0.83.5's
    `src/Assets.js` calls `imageSize` twice: `getAssetSize` with a `Buffer`
    (works on both lines), and `getAssetData` with `isImageInput`, which is
    the asset's **file path** unless the asset sits under a `.zip/`
    directory. image-size 1.2.1 accepts a path and reads the file
    synchronously; 2.0.4's `imageSize(input: Uint8Array)` accepts only
    bytes, and file reads moved to the async `imageSizeFromFile` on the
    `image-size/fromFile` subpath (`exports`: `.`, `./fromFile`,
    `./types/*`). So a `pnpm.overrides` pin to `^2.0.3` would make metro's
    asset pipeline throw on every ordinary image asset.
-   **The real fix is a metro update within range.** metro 0.83.8 (npm's
    `0.83-stable`, 2026-08-19) declares no image-size dependency and parses
    images with its own `src/lib/imageSize.js`; it is inside the plugin's
    `metro ^0.83.1`. A lockfile-only dry run in a scratch copy of the
    workspace manifests (`pnpm update -r --depth Infinity --lockfile-only
--ignore-scripts` naming metro and its thirteen `metro-*` packages, 15 s)
    moved metro to 0.83.8 and removed image-size and its dependency queue
    from the lock; it also re-resolved the React Native toolchain around it
    (1,491 → 1,516 packages: a second `@babel/core`, 7.29.7, beside the
    7.29.6 already there, terser 5.46.1 → 5.51.2, hermes-parser 0.33.3 → 0.35.0, a
    newer browserslist, caniuse-lite and lodash added). That
    is a toolchain refresh with its own verification (the client build
    compared byte for byte, `pnpm --filter @blackout/ui lint`, metro's
    asset functions run on a committed image), not a reason correction, and
    the operator approved only the correction on 2026-11-02. It is the
    follow-up, due before the entries lapse.

What changed: the `osv-scanner.toml` block and both `reason` strings, the
`.trivyignore` comment, and `exp:2026-11-30` on `.trivyignore`'s four
image-size lines (the GHSA and CVE ids), so that the Trivy gate lapses with
the OSV gates instead of ignoring them indefinitely. `pnpm.auditConfig.ignoreGhsas`
has no expiry mechanism and is unchanged. `ignoreUntil` and `exp:` both stop
applying at the start of 2026-11-30; the OSV cut-off is local midnight on the
scanning host (00:00Z on CI), as the 2026-10-30 record measured.

## The gate

Trivy 0.69.3 with `security.yml`'s flags, over six lockfiles: the fork's
`poetry.lock` and `Cargo.lock`, the legacy API's `requirements.txt`, the
desktop `Cargo.lock`, `pnpm-lock.yaml` and
`services/perturbation/requirements.txt`. The first seven rows are the first
round's, with the database read at the time as 2026-11-01 19:08 UTC; the rows
after them are the second round's, with the database of 2026-11-02 01:14 UTC
that is on disk ([Method](#method)).

| Run                                                                                      | High/Critical reported                                                                                                                                                                       | Exit |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `develop` (`f6da7b7`), `git archive`                                                     | none                                                                                                                                                                                         | 0    |
| `develop`, `--show-suppressed`                                                           | none; suppressed: Twisted 26.4.0 under CVE-2026-115775, CVE-2026-115776, CVE-2026-115778 and GHSA-vpp8-g58w-m8mp, and image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3) | 0    |
| `develop`, every `exp:` set to 2026-11-02 (the run's own date, at 02:07 UTC)             | the four Twisted ids and the two image-size ids                                                                                                                                              | 1    |
| `develop`, every `exp:` set to 2026-11-03                                                | none                                                                                                                                                                                         | 0    |
| this branch's worktree at `6b6d96e` (`node_modules` and `.git` skipped)                  | none                                                                                                                                                                                         | 0    |
| this branch, `git archive` of `03a426e`                                                  | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed`                                                                | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| this branch, `git archive` of `20362e4` (second round; database of 2026-11-02 01:14 UTC) | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (second round)                                                 | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`f6da7b7`), `git archive`, second round, same database                        | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (second round)                                                 | none; suppressed: the four Twisted ids and the two image-size ids, as in the first round                                                                                                     | 0    |

So the gate is green on both sides, and on this branch it is green without any
Twisted entry: Twisted 26.10.0 matches no advisory in that database. The two
`exp:` rows show what the date means to Trivy: an entry dated today was already
lapsed at 02:07 UTC, one dated tomorrow still applied, so `exp:2026-11-30`
stops applying at the start of 2026-11-30 (this host runs on UTC). The
`develop` run with `--show-suppressed` also shows that Trivy matches image-size
by CVE, which is why both ignore lists carry the CVE lines.

The record's commits change no file Trivy reads; the manhole commit changes
none either, and the second-round rows above are the runs on it.

## Validation

-   **Lock:** `poetry lock --check` (poetry 1.3.2), `.ci/scripts/check_lockfile.py`
    and `scripts-dev/check_locked_deps_have_sdists.py` (151 packages) pass;
    `poetry lock --check` passes again after the comment over `Twisted` was
    rewritten (the `content-hash` does not cover comments), and again in the
    second round, which changed no lock file. Every file hash in the two new
    lock entries matches PyPI's JSON (2 of 2 for twisted, 50 of 50 for
    zope-interface). `poetry export --extras all`, with and without the dev
    group, differs from `develop`'s by the twisted and zope-interface lines
    only.
-   **The after venv:** `pip install --no-deps --require-hashes` of
    `twisted==26.10.0` and `zope.interface==8.7` with the lock's hashes into
    a copy of the baseline venv; pip would have refused a download with
    another hash. `pip check` reports nothing, and `pip list --format=freeze`
    differs by exactly those two lines.
-   **Import:** under each version, importing `synapse.app.homeserver` and
    `synapse.util.manhole` loads 173 `twisted.*` modules, none of them
    `twisted.words`, `twisted.conch.telnet`, `twisted.mail.imap4`,
    `twisted.web._http2` or `twisted.web.websocket`, and
    `twisted.web.http.H2_ENABLED` is False
    ([What changed](#what-changed-in-the-modules-the-fork-imports)).
-   **The targeted modules, before and after** (`-j2`): `tests.http`,
    `tests.test_server`, `tests.replication`, `tests.handlers.test_send_email`,
    `tests.logging`, `tests.util`, `tests.metrics`, `tests.app`,
    `tests.crypto`, `tests.federation`, `tests.blackout_runtime` and
    `tests.config`, the modules that touch Twisted's HTTP, TLS, logging,
    reactor and replication surfaces: 760 tests on each side, 668 passing,
    53 skipped, 33 failures, 7 errors, in 24 s and 25 s. Compared by test id, the 92
    non-passing ids are the same with the same outcomes. The second round's
    run of the same modules from the after venv, with the five new manhole
    tests: 765 tests, 673 passing, the same 92 ids with the same outcomes,
    in 26 s. All 40 failures and
    errors are in `tests.http`: 18 failures and 1 error in the federation
    agent's module, 13 and 6 in the federation client's, 2 failures in the
    proxy agent's. Those are this sandbox's proxy variables, which the
    2026-10-30 record's fifth review traced (`https_proxy`/`HTTPS_PROXY` on
    `127.0.0.1`, read by upstream's `getproxies_environment()` call); they
    were not unset, and the same ids fail the same way under 26.4.0.
-   **The full trial suite, before and after** (`-j2`, from the two trees
    above):

    |                                                                        | Tests | OK    | Skipped | Failure | Error | Wall time |
    | ---------------------------------------------------------------------- | ----- | ----- | ------- | ------- | ----- | --------- |
    | before (26.4.0)                                                        | 3,379 | 3,063 | 173     | 110     | 34    | 189 s     |
    | after (26.10.0)                                                        | 3,379 | 3,063 | 173     | 110     | 34    | 195 s     |
    | after, second round (26.10.0, with the manhole fix and its five tests) | 3,384 | 3,068 | 173     | 110     | 34    | 192 s     |

    Compared by test id (the ids trial lists under `[FAIL]`, `[ERROR]` and
    `[SKIPPED]`): 110, 34 and 173 on each side, the same ids with the same
    outcomes, one of them (`test_client_sends_body`) under both `[FAIL]` and
    `[ERROR]` on both sides, and `tests.test_rust` as a module-level error on
    both. Compared with the 2026-10-31 run of the fourth review (3,374
    tests, same 173/110/34; its log, `r5/logs/trial-full-r5-final.log`, is
    kept under the session's scratch directory and the comparison was re-run
    in the second round), the non-passing ids are the same set, so the
    five tests added since pass under both versions. The second round's run
    has the same 316 non-passing ids as the two first-round runs and as the
    2026-10-31 run; its five new tests (`tests.blackout_runtime.test_manhole`)
    pass, and the same five error with the `AttributeError` when run against a
    `git archive` of the head before the fix. Of the 144 failures
    and errors, 40 are the `tests.http` proxy-variable ones above (39 ids,
    with `test_client_sends_body` counted under both); the other
    104 are the fork's existing ones (the 2026-10-25 record: `synapse_rust`
    shadowing, the `m.blackout.signal` validation, and
    `tests.storage.databases.main.test_events_worker.DatabaseOutageTestCase.test_recovery`,
    which fails only under `-j`). So no test changes outcome with Twisted
    26.10.0 and zope.interface 8.7; the `LoggingFile`, `dataReceived`,
    `headerReceived` and asyncio-reactor paths that the suite exercises
    behave the same.

-   **`blackout_runtime_tests`:** 85 passed under each venv (`pytest -q`,
    pytest 8.3.5 added with `--no-deps` as before), and 85 again from the
    after venv in the second round. `tests/blackout_runtime` is in the trial
    suite above.
-   **Boot, before and after:** `--generate-config` wrote a sqlite config
    with the 8008 listener on `['::1', '127.0.0.1']`, `tls: false`, `client`
    and `federation` resources and no `no_redirect_stdio`. This sandbox has
    no IPv6: the first start under each version failed with
    `CannotListenError: Couldn't listen on ::1:8008: [Errno 97] Address
family not supported by protocol`, the same traceback apart from Twisted's
    line numbers and the version banner's branch suffix. With
    `bind_addresses: ['127.0.0.1']` and nothing else changed, each homeserver
    answered `/health` with `OK` within 3 s and `/_matrix/client/versions`
    with a 17-entry `versions` list, and exited 0 on SIGTERM. Each run's
    `homeserver.log` is 160 lines with no `Traceback`, `ERROR` or `CRITICAL`,
    two `WARNING` lines (the start banner and the version line) and
    `Redirected stdout/stderr to logs`, which is the `LoggingFile` path;
    `boot.log` holds the eight-line trusted-key-server notice only. Stripped
    of timestamps, paths, object addresses and the one request's timing, the
    two logs differ in one line: the version banner of the run from this
    branch's worktree carries the git branch suffix (`(b=<branch>,<sha>)`),
    which a run from a `git archive` lacks. The second round repeated both
    runs from the scratch directory with the same result (160 lines each,
    that one differing line) and added the manhole runs
    ([The manhole](#the-manhole-could-not-start)).
-   **Lint:** the first round changed no Python file, so ruff, black, isort
    and mypy did not run then. The second round's two Python files
    (`synapse/util/manhole.py`, `tests/blackout_runtime/test_manhole.py`)
    pass the locked ruff 0.1.7, black 23.10.1 (after it rewrapped three
    lines of the test) and isort 5.13.1. mypy 1.5.1 with the fork's
    `mypy.ini` and its plugins on the two files reports one error, in
    `stubs/txredisapi.pyi` (the one the 2026-10-30 record's first mypy run
    also saw), and none in the two; mypy first reported 17 typing errors in
    the test (conch's `dict[bytes, bytes]` annotation on the key dicts,
    `Optional` channel and transport attributes, override signatures), fixed
    with casts and asserts rather than ignores. The same command from the
    baseline venv (Twisted 26.4.0, zope.interface 6.0) prints the identical
    line, so mypy-zope 1.0.1 under zope.interface 8.7 behaves the same on
    this import graph; the wider question is in [Not verified](#not-verified).
-   **OSV:** osv-scanner 2.3.3 on `pnpm-lock.yaml` with `TZ=UTC`,
    `TZ=Etc/GMT-3` and `TZ=Pacific/Kiritimati`: exit 0 each time, "Filtered 4
    vulnerabilities" (deepmerge, the two image-size entries with the new
    reason printed, minimatch), no unused-ignore line; the second round re-ran
    the three on its tree with the same output. On
    `apps/blackout-server/poetry.lock`, which no gate scans this way:
    `develop`'s lock shows the eight Twisted rows (the seven above and
    GHSA-8pqf, `--` for its fix) plus black 23.10.1, pygments 2.15.1 and
    sentry-sdk 1.35.0; this branch's lock shows no Twisted row and the same
    black, pygments and sentry-sdk rows ([Found outside scope](#found-outside-scope-not-fixed-here)).
-   **pnpm audit:** `pnpm audit --prod --audit-level high` and
    `pnpm run guard:audit-clean` exit 0, both reporting "1 low | 1 moderate
    (1 ignored) | 2 high (2 ignored)", in both rounds. Unchanged by this PR.
-   **gitleaks 8.21.2** over `origin/develop..HEAD`: after the first two
    commits, 2 commits scanned, no leaks; after the fourth (`20362e4`), 4
    commits scanned, no leaks.
-   **prettier 2.8.1**, the root's version, `--check` on every changed
    Markdown and YAML file: clean. `.trivyignore` and `osv-scanner.toml` are
    skipped by `--ignore-unknown`; `pyproject.toml` and `poetry.lock` are
    under `apps/blackout-server/`, which `.prettierignore` leaves alone apart
    from `PATCHES.md`.
-   **No pre-commit hook ran.** `core.hooksPath` is `.husky/_`, which this
    worktree does not have (its `node_modules` were installed with
    `--ignore-scripts`). The hook's two steps were run by hand on the staged
    files before each commit, and passed each time: lint-staged's `prettier
--write --ignore-unknown` (as `--check`) and `node
tools/ci/check-auth-secrets.mjs`.
-   **A model name appears in no changed file;** checked with a grep over
    the branch's diff.

## Before merge or release

-   **The fork image was not built here** (no Docker daemon, as in the
    earlier records). No PR job builds it either: `docker.yml` builds
    `apps/blackout-server/Dockerfile` on pushes to `main`, on `v*` tags and
    on `workflow_dispatch`, and `release.yml` on release tags; PRs here
    target `develop`. So the first `pip install` of this lock's export
    (`poetry export --extras all`, the image's install step) happens on the
    next such build. The install set is what `poetry
export --extras all` produced here, and it differs from `develop`'s by the
    two lines above, and neither needs a system package the image lacks
    (twisted's wheel is pure Python; zope-interface 8.7 ships cp311
    manylinux wheels for x86_64 and aarch64). Checking the built image's
    `pip show twisted zope.interface` once is enough.
-   **The metro update, before 2026-11-30.** The image-size ignores lapse at
    the start of that day in all three places that enforce a date (the two
    OSV gates through `ignoreUntil`, Trivy through `exp:`). The fix is a
    within-range metro update that removes image-size from the lock
    ([image-size](#image-size-the-ignores-reason-corrected)); it needs its own
    change with the client build compared byte for byte against `develop`'s,
    `pnpm --filter @blackout/ui lint`, metro's `getAssetSize` and
    `getAssetData` run on a committed PNG under 0.83.8, and then the removal
    of the three image-size entries (`.trivyignore`, `osv-scanner.toml`,
    `pnpm.auditConfig.ignoreGhsas`). If it is not going to land in time,
    moving the date without it would repeat what this change had to correct;
    the alternative is to let the gates go red on the day and say why.

## Found outside scope (not fixed here)

1.  **Two Low advisories in `poetry.lock` that no gate reports.** osv-scanner
    on the fork's lock, which neither `security.yml` nor `ci.yml` runs (both
    scan `pnpm-lock.yaml`), lists sentry-sdk 1.35.0 under GHSA-g92j-qhmh-64v2
    (CVE-2024-40647, Low: environment variables passed to subprocesses; the
    advisory has two ranges, fixed in 1.45.1 for the 1.x line, which
    osv-scanner prints as the fix for 1.35.0, and in 2.8.0 for 2.x) and
    pygments 2.15.1 under GHSA-5239-wwwm-4pmq (CVE-2026-4539,
    Low: a ReDoS in GUID matching, fixed in 2.20.0), on `develop`'s lock and
    on this one. Trivy's CRITICAL/HIGH threshold passes both. sentry-sdk is in
    the image's `--extras all` install set (the `sentry` extra); pygments is
    dev-only. Both predate this change; neither was looked at further here.
    black 23.10.1's four rows (dev) are as the 2026-10-25 record left them.
2.  **The baseline venv's console scripts point at a venv that no longer
    exists.** `venv-r5` under this session's scratch directory was made as a
    copy of `venv-after`, so its `bin/pip`, `bin/trial` and the rest carry
    `venv-after`'s interpreter in their shebang. That is why this task's
    notes read `pip show pyasn1` as 0.6.4 in a venv whose `dist-info` and
    `pyasn1.__version__` said 0.6.5 (the 2026-10-30 record itself contains no
    such reading): that `pip` ran the other venv's Python.
    Every command here used `<venv>/bin/python -m ...`. A scratch matter, not
    a repository one, recorded so the earlier note is explained.
3.  **The within-range metro update is pending**, as above. The dry run also
    printed pnpm's `unmet peer react@^18.2.0: found 19.2.5` for the React
    Native tree; whether that warning exists on `develop`'s lock as well was
    not checked, and the update's own change should look at it.
4.  **`.trivyignore` still carries the dead brace-expansion entries** that the
    2026-10-30 record's item 7 describes. Unchanged here.

## Not verified

-   The fork image with this lock: not built here (no Docker daemon), and no
    PR job builds it ([Before merge or release](#before-merge-or-release)).
-   mypy 1.5.1 with mypy-zope 1.0.1 under zope.interface 8.7 beyond the
    import graph of the two manhole files, where it reports the same single
    `stubs/txredisapi.pyi` error from both venvs. The 2026-10-30 record's
    56-error baseline came from `config/jwt.py`'s import graph and was not
    re-run here; the next Python change in that area will show whether it
    moves.
-   The 40 `tests.http` tests that this sandbox's proxy variables stop, under
    either Twisted version. `HTTPS_PROXY` was not unset to run them. A runner
    without those variables would run them; no root workflow runs trial, and
    the fork's own workflows do not run.
-   An IPv6 listener. The sandbox has no IPv6, so the generated config's `::1`
    address was removed for the boot check; `Port.startListening()` now closes
    the socket on `CannotListenError` (#6108), which the failed first attempt
    exercised under both versions with the same result, but a listener that
    binds `::1` successfully was not started.
-   Of the three hardenings against a misbehaving peer, one: a DNS response
    from an address other than the one queried was read in the release notes
    and the fork's code, not sent to a running homeserver. The other two were
    observed. The first review's probe sent a header value with a bare CR and
    one with a bare LF to a running homeserver: `400 Bad Request` under
    26.10.0, `200 OK` under 26.4.0 (its logs are under the session's scratch
    directory, `verify-r1-compat/boot-*-nomh.log`). The second round's probe
    sent a second shell request on one manhole channel: refused under
    26.10.0, accepted under 26.4.0 ([The manhole](#the-manhole-could-not-start)).
-   Whether 26.10.0 fixes GHSA-8pqf-f4m5-798g. The `wildcardToRegexp` change
    was read in the two installed copies; neither OSV, GitHub nor `NEWS.rst`'s
    CVE list says so, and the IMAP4 server is not imported.
-   Twisted's GitHub release notes for 26.10.0, 26.10.0rc1 and 26.10.0rc2
    (GitHub not reachable from this session); the sdist's `NEWS.rst` was the
    source, and it says the final release has no changes since rc2.
-   metro 0.83.8's own image parser on this repository's committed assets,
    and the client build after the metro update. Only the lockfile-only dry
    run was done; the update is the follow-up.
-   Trivy's `exp:` cut-off on a host whose local time zone is not UTC. Both
    probe runs were on this UTC host.

## Corrected after review

The first round (commits `6b6d96e`, `03a426e`, `be7bbe2`) was reviewed under
three lenses: compatibility, gates and advisory facts, and the truth of every
sentence. Each finding and what changed:

1.  **The manhole could not start on either Twisted version** (medium). Fixed
    in code with tests and a PATCHES.md entry
    ([The manhole](#the-manhole-could-not-start)); the SSHSession table row
    and the "Not verified" item that described the manhole as running are
    reworded, and the live probe was done.
2.  **The `twisted.internet.ssl` cell understated the surface** (low, under
    two lenses). Rewritten with every name `synapse/` and `tests/` import,
    including the private `_defaultCurveName`, and the Complement launcher's
    asyncio variable added to the #12767 cell.
3.  **The after venv was not "a copy plus two packages"** (low). The Method
    now says the fork was re-installed editable from this branch's tree, that
    the import-time floor check reads the installed distribution's metadata,
    and that the baseline venv imports this tree without complaint.
4.  **The first round's boot check wrote `homeserver.log` into the worktree**
    (low). Recorded in the Method; the second round's script runs from the
    scratch directory.
5.  **"On every PR" overstated the Trivy job's trigger** (low, two lenses).
    The Scope paragraph names the `paths:` filter, the merge queue and the
    docs-only case.
6.  **sentry-sdk's fix was given as 2.8.0 only** (medium and low, two
    lenses). The item now gives 1.45.1 for the 1.x line, which osv-scanner
    printed, and 2.8.0 for 2.x.
7.  **"A third `@babel/core`"** (low). The lock has one, 7.29.6; the dry run
    adds a second, 7.29.7.
8.  **"Since 2026-10-25"** (low). The three older entries were committed on
    2026-10-26 01:28 UTC (`eca7b42a4a`, merged 02:04 UTC); the Scope
    paragraph says so. Commit `6b6d96e`'s message carries the 2026-10-25
    date and cannot be amended under this change's rules, so this is the
    correction.
9.  **The Trivy database timestamps could not be verified** (low). The
    Method now says the 19:08 figures were read at the time and not
    retained, names the database on disk (2026-11-02 01:14 UTC), and the
    gate table carries the second round's runs with it.
10. **"The first `poetry install` of this lock inside the image"** (low). The
    image runs `pip install` on the lock's export; corrected.
11. **"The two logs are identical"** (low). One normalised line differs, the
    version banner's git-branch suffix; the Boot bullet says so, and the
    `CannotListenError` sentence names it too.
12. **"A probe ran 23 tests in both venvs"** (low). One venv's log exists;
    the other is the reproduced refusal. Corrected.
13. **The 0.6.4 `pip show` reading was attributed to the 2026-10-30 record**
    (low). It came from this task's notes; corrected.
14. **The 2026-10-31 id-set comparison could not be re-checked** (low). The
    log exists under the session's scratch directory
    (`v48/r5/logs/trial-full-r5-final.log`, 3,374 tests); the comparison was
    re-run against the second round's log: the same 316 non-passing ids.
