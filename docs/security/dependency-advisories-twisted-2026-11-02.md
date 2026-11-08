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
`packages/**`, `infra/**`, `deploy/**`, `tools/ci/check-embed-proxy-framing*`,
`blackout-desktop/**`, `services/**`, `.trivyignore`, `pnpm-lock.yaml`,
`package.json`, the workflow itself, `.gitleaksignore` and `osv-scanner.toml`;
a docs-only PR starts no run). They are removed here, with the lock that makes
them unnecessary. The operator approved the Twisted lock and a correction of
the reason the two image-size ignores gave (false since 2026-09-14) in the
one PR on 2026-11-02, and until its eleventh round this change carried that
correction and added `exp:2026-11-30` to `.trivyignore`'s four image-size
lines. #1001 (metro 0.83.8; opened 2026-11-08 05:17:59 UTC, merged 06:28:36
UTC as `97756ff`) took image-size out of `pnpm-lock.yaml` and removed the
image-size entries from all three ignore lists on `develop`. The eleventh
round merged it (commit `4e759b4`) and took those removals in every
conflict, so this change now changes no image-size line, and no ignore file
holds an image-size entry
([image-size](#image-size-superseded-by-1001)).

Reviews of this change also found bugs in the fork's manhole host-key
handling that the bump neither caused nor changed, and errors in the
documentation with them. The review of the first
round found that a `type: manhole` listener without a configured key pair
(either path unset) stopped the homeserver from starting, on either Twisted
version, a bug from 2026-09-13; a configured pair worked. It is fixed in
commit `20362e4` (which also carries this record's second-round corrections:
the pre-commit prettier step's `git add -u` staged the record with the fix,
and the rules forbid amending). The review of the fourth round found that
once it started, a listener with only `ssh_priv_key_path` set discarded that
key for a generated pair under a warning that said none was configured, and
that `docs/manhole.md` named the options `ssh_priv_key` and `ssh_pub_key`,
which the code ignores. Both are fixed in commit `ce1bca9`, with tests. The
review of the fifth round found that the manhole filed every host key under
`ssh-rsa`, so a listener with an Ed25519 or ECDSA key started without a
warning and then failed every connection (as `develop` does for a configured
pair of either type), and that the config took a public key as the private
key and a public key that is not the private key's. Both are fixed in commit
`6c0aab8`, with tests; `synapse/config/server.py` now refuses those configs at
startup. (The same review found that the config manual's upstream opening
said the key pair encrypts the manhole traffic; `6c0aab8` corrects it.) The
review of the
sixth round found that a key on a curve Twisted has no SSH type for passed
that check and stopped the homeserver with a bare `KeyError`; fixed in
commit `2bf76ad`, with tests. The review of the seventh round found that a
DSA key passed it too, and that one whose subgroup order is 224 or 256
bits, as in every standard DSA key larger than 1024 bits, then failed every
connection in practice with nothing said at startup; the check refuses DSA
keys from commit `57d9d26`, with tests. The review of the eighth round found
that the refusal's message blamed the key's size, which is false for a
2048-bit key with a 160-bit subgroup order; from commit `54043e4` it gives
the reason that holds for every DSA key, that each ssh-dss signature uses
SHA-1. The review of the ninth round found that `54043e4`'s message put the
limit of signing at a subgroup order longer than 160 bits, which a
non-standard order just over 160 bits contradicts; from commit `8c74e04` it
names the 224- and 256-bit orders of the standard keys, with which the
server in practice cannot sign. The review of the tenth round found that the
check ran whatever the listeners, so a homeserver with no manhole listener
and a stale `manhole_settings` block, which `develop` runs, stopped at
startup; from commit `b1b91e8` it runs only when the config declares a
manhole listener for the process it is loaded as. The review of the
eleventh round found that this record and the documents said "a process
that starts" one, which `synapse.app.admin_cmd` contradicts: it starts no
listener and is checked all the same; from commit `23ea07c` they say what
the check reads.
If the approved scope is to stay exact, the operator can still split the
manhole fixes out: return `synapse/util/manhole.py`,
`synapse/config/server.py`, `docs/manhole.md` and
`docs/usage/configuration/config_documentation.md` to `develop`'s, delete
`tests/blackout_runtime/test_manhole.py`, drop PATCHES.md's six manhole
bullets (the sixth corrects an upstream line of `config_documentation.md`,
which goes back with that page), the probe clauses of its `SSHSession`
sentence and the asyncssh clause of its key-exchange sentence, and remove or
reword every sentence of this record that relies on the fixes, not only its
manhole section. `grep -n -i 'manhole\|ssh_p'` on this file finds them in: this
paragraph; the first and fourth Result bullets; the Method's Tests and Boot
bullets and its fourth- to twelfth-round bullets; the `SSHSession` and
key-exchange rows of
[What changed](#what-changed-in-the-modules-the-fork-imports); the closing
paragraph of [The gate](#the-gate); the targeted, full-suite, Boot, Lint and
mypy bullets of Validation; the OpenSSH and three-hardenings items of "Not
verified"; item 1 of the first correction list, items 15 and 16 of the
second, items 1, 9, 12 and 13 of the third, the fourth list's opening
sentence and its items 1, 13, 14 and 20, the fifth list's opening sentence
and its items 1, 2, 3, 4 and 6, the sixth list's opening sentence and its
items 1, 2, 4 and 5, the seventh list's opening sentence and its items
1, 5, 6 and 11, the eighth list's opening sentence and its item 1, the
ninth list's opening sentence and its item 1, the tenth list's opening
sentence and its items 1 (its mention of the manhole section) and 5, and the
eleventh list's opening sentence and its items 3 and 4; and the Commit
messages note.
Twenty-one more rely on the fixes
though the grep does not find them, since none names the manhole or an
`ssh_p` setting: items 15 and 22 of the fourth list, items 7, 8 and 9 of the
fifth, items 3 and 8 of the sixth, items 2, 3, 4, 9 and 13 of the
seventh, items 2, 3 and 8 of the eighth, items 2 and 4 of the ninth,
items 4 and 6 of the tenth, and items 1 and 5 of the eleventh. Its other
hits stay true either way: the GHSA-cwm5 row, the "Not used" row's
`--manhole` help-string clause, the import paragraph under that table and
Validation's Import bullet (both import
`synapse.util.manhole`, which `develop` has), Validation's Semgrep bullet (a
record of what was scanned), "Found outside scope" item 5, and item 8 of the
third correction list. A `git revert` of `20362e4` would also take back
that commit's record corrections
([The manhole](#the-manhole-without-a-configured-key-pair-could-not-start)).

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
| image-size 1.2.1 (npm) | GHSA-5p2g-fcmc-qvqq (CVE-2025-71329)  | High     | 2.0.3 (1.x has no fix) | ignore removed by #1001 (metro 0.83.8)    |
| image-size 1.2.1 (npm) | GHSA-w3rx-r6r6-pgpr (CVE-2025-71330)  | High     | 2.0.3 (1.x has no fix) | same                                      |

**Result:**

-   **Twisted moves to 26.10.0, and zope-interface from 6.0 to 8.7.** Nothing
    else in the lock changes. 26.10.0 requires `zope-interface>=8`, which is
    the whole reason zope-interface moves; upstream Synapse runs on
    zope-interface 8.2 already. The wheel and sdist hashes in the lock match
    PyPI's. None of the APIs 26.10.0 removed or changed is used by the fork in
    a way that behaves differently for a well-behaved peer (read against the
    release notes and, for one change they do not mention, the module's
    diff; run through the suite; and booted); three hardenings change what a
    misbehaving peer gets, and the manhole's SSH server now offers a
    post-quantum key exchange first
    ([What changed](#what-changed-in-the-modules-the-fork-imports)). Three
    fork source files change. `synapse/util/manhole.py`, for three bugs that
    predate the bump: it called a `Key` method Twisted has never had, so a
    homeserver with a manhole listener without a configured key pair died at
    startup under 26.4.0 and 26.10.0 alike; its 2026-09-13 logic, hidden
    behind that crash, replaced a configured private key with a generated
    pair whenever the public key's path was unset; and it filed every host
    key under `ssh-rsa`, so with an Ed25519 or ECDSA key no connection to the
    manhole succeeded. `synapse/config/server.py`, which now refuses at
    startup, when the config declares a manhole listener for the process it
    is loaded as, a key file the manhole could not use or should not offer: a
    public key as the private one, a public key that is not the private
    key's, an EC key on a curve Twisted has no SSH key type for, or a DSA
    key (every ssh-dss signature uses SHA-1, and one whose subgroup order
    is 224 or 256 bits, as in every standard DSA key larger than 1024
    bits, fails every connection in practice). `docs/manhole.md`, which
    named the key options wrongly, and the manhole paragraph of
    `config_documentation.md`, whose upstream opening said the key pair
    encrypts the traffic, are corrected with them
    ([The manhole](#the-manhole-without-a-configured-key-pair-could-not-start)).
    The third is a comment in `synapse/handlers/send_email.py` that named
    26.4.0 as the minimum Twisted; it no longer names a version.
-   **The four Twisted entries leave `.trivyignore`, with their CVE aliases.**
    `.trivyignore` now holds pnpm-lock.yaml entries only; its header,
    `security.yml`'s comment and the `pyproject.toml` comment say so.
-   **Image-size: this change's part was superseded by #1001.** Until the
    eleventh round this change kept the two image-size ignores with a
    corrected reason (OSV and GitHub list 2.0.3 as the fix, and the one
    consumer, metro 0.83.5, cannot take 2.x) and put `exp:2026-11-30` on
    `.trivyignore`'s four image-size lines. #1001 did the within-range metro
    update this change named as the fix and left to its own change: metro
    0.83.8 no longer depends on image-size, and #1001 removed the three
    ignores on `develop`. The eleventh round's merge took that removal, so
    none of this change's image-size edits remains
    ([image-size](#image-size-superseded-by-1001)).
-   **What an operator can see of the bump is the manhole's key exchange
    and three edge cases.** The suite, compared test by test before and
    after, has the same outcomes, and a homeserver boots and answers under
    both versions: on a generated sqlite config, and on Postgres 16 with
    Redis replication, a metrics listener and the production template's
    HTTP resources other than `consent` ([Validation](#validation)). The
    manhole's SSH server
    offers `mlkem768x25519-sha256` first, which OpenSSH clients from 9.9 on
    negotiate with it by default (9.9 lists two `sntrup761x25519` names
    first, which Twisted does not implement; 10.0 lists `mlkem768x25519-sha256`
    first; worked out from their default lists, with no OpenSSH client run),
    and three hardenings are visible only to a peer that misbehaves
    ([Behaviour changes](#what-changed-in-the-modules-the-fork-imports)).
    None needs a setting, so no `upgrade.md` section was added. Not booted:
    the default `bind_addresses` (`['::', '0.0.0.0']`), which production
    uses, since this sandbox has no IPv6 ([Not verified](#not-verified)).
    The manhole fixes are visible in these ways against `develop`. Three
    configs crashed there: a `type: manhole` listener without a configured
    key pair now starts on a generated key instead of killing the
    homeserver; one with only `ssh_priv_key_path` serves that key, RSA,
    Ed25519 or ECDSA; and one with only `ssh_pub_key_path` starts on a
    generated key with a warning that says the public key was ignored. A
    configured Ed25519 or ECDSA pair, with which `develop` starts a manhole
    that drops every connection, now gets sessions. And an `ssh_pub_key_path`
    that is not the public half of the private key, or a public key at
    `ssh_priv_key_path`, stops startup with a `ConfigError`; `develop` starts
    a manhole that serves no session for the first and for the second beside
    an `ssh_pub_key_path`, and crashes for the second alone. A DSA key, or
    an EC key on a curve other than P-256, P-384 or P-521, at
    `ssh_priv_key_path` also stops startup with a `ConfigError` now, where
    `develop` loads it and, with it alone, crashes as above
    ([the curve paragraph](#curve-refusal), [DSA](#dsa-refusal)). Each of
    these refusals applies only when the config declares a manhole
    listener for the process it is loaded as; without one,
    `manhole_settings` loads unchecked, as on `develop` ([Only when the
    config declares a manhole listener](#listener-condition)). No tracked
    config enables the manhole
    ([Host keys other than RSA](#host-key-types)).

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
    2026-11-02 01:14 UTC (`NextUpdate` 2026-11-03 01:14 UTC), and the
    second round's runs used it. Trivy's `--download-db-only` at 03:25 UTC
    did not look for a newer one: while the local `NextUpdate` lies ahead it
    skips the download without contacting the registry (`--debug`: "DB
    update was skipped because the local DB is the latest"). The second
    review read ghcr.io's `trivy-db:2` manifest at 03:52 UTC as created
    2026-11-02 01:21 UTC, which it took to be the 01:14 build; at 11:10 UTC
    that manifest was a newer build, created 07:26 UTC. For the third round
    the cached database was deleted and downloaded again at 11:28 UTC (from
    `mirror.gcr.io/aquasec/trivy-db:2`, Trivy 0.69.3's default):
    `UpdatedAt` 2026-11-02 07:17 UTC, `NextUpdate` 2026-11-03 07:17 UTC (its
    metadata and the `--debug` download log are kept). For the fourth round
    it was deleted and downloaded again at 12:52 UTC from the same mirror,
    which still served that build (`UpdatedAt` 07:17 UTC), so the third and
    fourth rounds' rows share one database. For the fifth round it was
    deleted and downloaded again at 15:13 UTC from the same mirror:
    `UpdatedAt` 2026-11-02 13:15 UTC, `NextUpdate` 2026-11-03 13:15 UTC (its
    metadata and the `--debug` download log are kept). For the seventh round
    the cache held the database of 2026-11-08 00:37 UTC (`NextUpdate`
    2026-11-09 00:37 UTC), downloaded at 01:37 UTC that day by the sixth
    review's own run; `--download-db-only --debug` skipped the download
    ("the local DB is the latest"), and the runs used it (its metadata and
    that log are kept under `finish/scan/`). The eighth round's runs used
    the same database: at 03:58 UTC on 2026-11-08
    `--download-db-only --debug` skipped the download again for the same
    reason (its metadata and log are under `finish/r3/scan/`).
    Run with `security.yml`'s flags (`fs`, `--scanners vuln`,
    `--severity CRITICAL,HIGH`, `--ignore-unfixed`,
    `--ignorefile .trivyignore`, `--exit-code 1`) over `git archive` exports
    of this branch and of `develop`, plus `--skip-db-update` so that each
    round's runs used one database, and `--format json` to count.
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
    from the after venv. The third round, whose only fork code change is a
    comment, ran the targeted modules, the full suite and
    `blackout_runtime_tests` once more from the after venv on `d5fa741`, and
    one boot with the manhole probe. The fourth round, which changes no fork
    code, ran the targeted modules, the full suite and
    `blackout_runtime_tests` again from the after venv on `89c1606`, under
    the same load rule. The fifth round, which changes `manhole()` and adds
    three tests, ran the manhole module under both venvs against `bf32a2b`'s
    `manhole.py` (a `git archive` with the new test module copied in) and
    against the change, then the targeted modules, the full suite and
    `blackout_runtime_tests` from the after venv on this branch's tree under
    the same load rule, and three `tests.http` modules under both venvs with
    the sandbox's own proxy values filtered inside the test process
    ([Validation](#validation)).
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
-   **The fourth round** changes no fork code and no lock file, only
    comments (`.trivyignore`, `osv-scanner.toml`, `security.yml`),
    PATCHES.md and this record. Its checks ran from this branch's tree, first
    on `PYTHONPATH`, with the scratch directory as working directory, each
    under both venvs: a manhole boot probed with asyncssh 2.24.1, an SSH
    implementation independent of Twisted (wheel from PyPI, sha256
    `fc560b4f…` matching PyPI's JSON, loaded from an unpacked copy, not
    installed into either venv), offering only `mlkem768x25519-sha256` and
    then only `curve25519-sha256`; a boot shaped like the production
    template where this host allows it: psycopg2 with `cp_min` 5 and
    `cp_max` 15 on a throwaway Postgres 16.15 cluster (psycopg2-binary 2.9.9,
    the lock's psycopg2 version, whose cp311 manylinux wheel's sha256
    `977646e0…` matches PyPI's, unpacked the same way), Redis replication on
    a throwaway redis-server 7.0.15, the template's `x_forwarded` HTTP
    listener with `client`, `federation`, `media` and `keys` (its `consent`
    resource needs a `user_consent` section, which a generated config
    lacks), a metrics listener and `enable_metrics`, all on 127.0.0.1; a
    second bind on a port already listening; and mypy on the two manhole
    files, evenly and as the second round ran it. Postgres ran in a user
    namespace that maps
    root to the `postgres` uid, since Postgres refuses to run as root and
    that user cannot enter the scratch directory. OpenSSH's 9.9 and 10.0
    release notes were read on openssh.com.
-   **The fifth round** changes `synapse/util/manhole.py`'s `manhole()`, its
    test module, `docs/manhole.md`, the manhole paragraph of
    `config_documentation.md`, PATCHES.md, comments in both ignore files and
    `security.yml`, the cross-references in three older records, and this
    record; no lock file. Its checks ran from this branch's tree, first on
    `PYTHONPATH`, with the scratch directory as working directory, under both
    venvs: manhole boots with only `ssh_priv_key_path` and with only
    `ssh_pub_key_path` set, probed with the fourth round's unpacked asyncssh
    2.24.1 on its default algorithm lists, plus both under 26.10.0 against
    `bf32a2b`'s `manhole.py`; boots with a `path:` HTTP listener on a UNIX
    socket, under the default reactor and under `SYNAPSE_ASYNC_IO_REACTOR=1`;
    the failed-bind probe with each exception dropped and with the last one
    kept; and the key exchange a default OpenSSH 9.9 or 10.0 client would
    negotiate with the manhole, worked out from each release's
    `myproposal.h` and the server transport that `manhole()` builds, with
    Twisted's own selection rule (`ffs(client, server)`,
    `twisted/conch/ssh/transport.py`). The 9.9p1 tarball came from
    cdn.openbsd.org, and its sha256 matches the 9.9 release notes; the
    tarball the CDN serves as `openssh-10.0p1.tar.gz` says 10.0p2 in its
    `version.h`, and its sha256 matches the 10.0 release notes' 10.0p2 line.
    No OpenSSH client was run (none is installed here).
-   **The sixth round** starts with a merge of `origin/develop` at
    `0367abd` (#996, the desktop build check; #997, the Railway template's
    removal), commit `33d9ef1`. Only `apps/blackout-server/PATCHES.md`
    conflicted, where both sides appended 2026-11-02 entries; both are kept,
    `develop`'s dated note and Railway entry first. The round then changes
    `synapse/util/manhole.py`'s `manhole()`, `synapse/config/server.py`, the
    test module, `docs/manhole.md`, the manhole paragraph of
    `config_documentation.md`, PATCHES.md and this record; no lock file and
    no ignore file. Its checks ran with each venv's Python and this branch's
    tree first on `PYTHONPATH` (under both, `synapse` and `tests` import from
    the worktree), with the scratch directory as working directory: the
    manhole module, `tests.config` and `tests.blackout_runtime` under both
    venvs; the new test module against the merge commit's `manhole.py` and
    `server.py` (a `git archive` of `33d9ef1` with the module copied in)
    under both venvs, and against `develop`'s (a `git archive` of `0367abd`)
    under 26.4.0; a probe that calls `manhole()` directly with each shape the
    config now refuses; homeserver boots with Ed25519 and ECDSA keys and with
    two refused shapes under both venvs; mypy evenly on the three changed
    Python files; and the scanners on `git archive` exports. Twisted's
    host-key lookup was read in both venvs: `_getHostKeys` is in
    `twisted/conch/ssh/transport.py` (line 1453 in 26.4.0, 1457 in 26.10.0),
    and the list of offered host-key algorithms is built in
    `twisted/conch/ssh/factory.py` (`buildProtocol`). `_getHostKeys` and
    `buildProtocol`'s host-key lines (the `supportedSignatureAlgorithms()`
    chain over `privateKeys`) read the same in the two versions;
    `buildProtocol` as a whole differs by its key-exchange filter line,
    `if _kex.isFixedGroup(kexAlgorithm) or _kex.isEllipticCurve(kexAlgorithm)`
    in 26.4.0 and `if not _kex.isDynamicPrimesGroup(kexAlgorithm)` in 26.10.0
    (and `factory.py` drops a `Maintainer:` docstring line), which the sixth
    round's "both read the same" passed over (corrected in the seventh). The
    targeted modules as a whole, the full suite and
    `blackout_runtime_tests` did not run this round, under the same load
    rule (each run started only when the 1-minute load was under 3.5).
-   **The seventh round** starts with a merge of `origin/develop` at
    `7bda9eb` (fifteen documentation commits after #997: the Coalition field
    operations plans, the whole-product MVP, the AI-first audit and release
    plan, the habit and participation strategy, and their links from
    README.md, ROADMAP.md, `docs/SUMMARY.md`, the differentiation brief,
    that strategy and the field operations build plan),
    commit `d972bbd`, with no conflict and nothing under
    `apps/blackout-server` changed. Seven of the nine incoming files are not
    formatted as the root prettier config would have them (lint-staged's
    step: `prettier --write` would change 360 added and 324 deleted lines,
    mostly table alignment); the merge keeps them as `develop` has them, a
    merge commit not being the place to rewrite the other side's content,
    and no workflow checks formatting. The round then changes
    `synapse/config/server.py`, the test module, `docs/manhole.md`, the
    manhole paragraph of `config_documentation.md`, PATCHES.md and this
    record; no lock file, no ignore file and no `manhole.py` change. Its
    checks ran with each venv's Python and this branch's tree first on
    `PYTHONPATH` (under both, `synapse` and `tests` import from the
    worktree), with `v52/finish/` under the session's scratch directory as
    working directory, so that every file the sixth round cited under
    `finish/` exists there and holds this round's run
    ([Corrected after the sixth review](#corrected-after-the-sixth-review),
    item 5): the manhole module, `tests.config` and `tests.blackout_runtime`
    under both venvs, under the load rule; the module against `git archive`
    copies of `cd6b0a4` (the sixth round's files), of the merge commit
    `33d9ef1` and of `develop`'s `0367abd`, with the module copied in, the
    first two under both venvs and the last under 26.4.0; the direct
    `manhole()` probe under 26.10.0; ten homeserver boots, five
    `manhole_settings` shapes under each version; mypy evenly on the two
    changed Python files in `git archive` copies of `cd6b0a4` without and
    with the change; and the scanners on `git archive` exports of `2bf76ad`
    and of `develop`'s `7bda9eb`. The full suite, the targeted modules as a
    whole and `blackout_runtime_tests` did not run this round either, and
    Semgrep did not run.
-   **The eighth round** starts with a merge of `origin/develop` at
    `27d8c17` (#998: the fork's Nixpacks path and the hosting helpers its
    removed entrypoint called are removed, with their tests and smoke
    scripts and dated notes in the fork's documents, the 2026-10-30 record
    and the 2026-10-11 Semgrep triage; and lodash 4.18.1 for
    GHSA-f23m-r3pf-42rh), commit `e66794c`. Only
    `apps/blackout-server/PATCHES.md` conflicted, where both sides appended
    2026-11-02 entries: `develop`'s "the Nixpacks path and the hosting
    helpers are removed" comes first, since its "the entry above" means the
    Railway template's removal, then this branch's Twisted entry, each
    unchanged; the 2026-10-30 record merged without a conflict. The 22
    files the merge adds or changes against this branch (it deletes 12) are
    formatted as the root prettier config would have them. The round then
    changes `synapse/config/server.py`, the test module, `docs/manhole.md`,
    the manhole paragraph of `config_documentation.md` and PATCHES.md
    (commit `57d9d26`), and this record; no lock file, no ignore file and no
    `manhole.py` change. Its checks ran with each venv's Python and this
    branch's tree first on `PYTHONPATH` (under both, `synapse` and `tests`
    import from the worktree), with `v52/finish/r3/` under the session's scratch
    directory as working directory and log directory (the earlier rounds' files
    under `finish/` are left as they were): the manhole module, `tests.config`
    and `tests.blackout_runtime` under both venvs, each heavy run started with
    the 1-minute load under 3.5; the module against a `git archive` of the merge
    commit `e66794c` (the seventh round's code) under both venvs, and against
    `develop`'s `27d8c17` under 26.4.0, with the module copied in; a probe of
    DSA keys in each format and size under both versions
    (`finish/r3/logs/dsa-probe.txt`), and one of `manhole_settings` shapes
    through `HomeServerConfig` on this tree and on `develop`'s under both
    (`finish/r3/logs/config-probe.txt`); homeserver boots with DSA keys
    ([DSA](#dsa-refusal)); mypy evenly on the two changed Python files in
    `git archive` copies of `e66794c` without and with the change; and the
    scanners on `git archive` exports of `57d9d26` and of `develop`'s `27d8c17`.
    The full suite, the targeted modules as a whole and `blackout_runtime_tests`
    did not run, and Semgrep did not run.
-   **The ninth round** merged nothing: `origin/develop` was still at
    `27d8c17`, which the eighth round's merge `e66794c` brought in, and
    `git merge-tree --write-tree HEAD origin/develop` gives `HEAD`'s own
    tree. The round changes `synapse/config/server.py` (the DSA message and
    two docstrings), the test module, `docs/manhole.md`, the manhole
    paragraph of `config_documentation.md` and PATCHES.md (commit
    `54043e4`), and this record; no lock file, no ignore file and no
    `manhole.py` change. Its checks ran as the eighth round's did, with
    `v52/finish/r4/` under the session's scratch directory as working
    directory and log directory: the manhole module under both venvs on the
    worktree before the commit, and against `git archive` copies of
    `6f9117b` and of `e66794c` with the module copied in, under both;
    `tests.config` and `tests.blackout_runtime` under both venvs on
    `54043e4`'s clean tree, each started with the 1-minute load under 3.5;
    a probe of DSA key formats under both versions
    (`finish/r4/logs/dsa-format-probe.txt`); mypy evenly on the two changed
    Python files in `git archive` copies of `6f9117b` without and with the
    change; `poetry lock --check`; and the scanners on `git archive` exports
    of `54043e4` and of `develop`'s `27d8c17`. The full suite, the targeted
    modules as a whole and `blackout_runtime_tests` did not run, Semgrep did
    not run, and no homeserver was booted.
-   **The tenth round** starts with a merge of `origin/develop` at
    `0f9df74`, commit `d673fe6`: #999 (merged 2026-11-08 05:51 UTC) removes
    the unused minimatch ignore (GHSA-g3hv-75wg-m249) from
    `osv-scanner.toml` and `pnpm.auditConfig.ignoreGhsas`, and
    brace-expansion's dead `pnpm.auditConfig` mirror (GHSA-mh99-v99m-4gvg),
    with the 2026-11-08 advisories record; #1000 (05:51 UTC) makes desktop
    releases come only from `release-*` tags as one draft, with the
    duplicate-paths guard's case rules and tests, `release.yml`,
    `KNOWN_LIMITATIONS.md`, the wrapper release doc and the 2026-10-30
    server/desktop record. #1001, which removes the image-size ignores whose
    reasons this branch rewrites, had not merged (it merged at 06:28:36 UTC,
    18 minutes after this round's record commit `71fdfce`; eleventh round,
    below). Only `.trivyignore`
    conflicted, in its header, where both sides rewrote how the three
    ignore files differ: the resolution keeps `develop`'s date (2026-11-08)
    and its minimatch and brace-expansion bullets, this branch's removal of
    the Twisted bullet and its paragraph on `pnpm-lock.yaml` and
    `poetry.lock`, and lists all four records. `osv-scanner.toml` and the
    2026-10-30 record merged without a conflict, and nothing under
    `apps/blackout-server` changed. Of the 15 files the merge changes
    against this branch, every one prettier parses is formatted as the root
    config would have it (it skips `.trivyignore` and `osv-scanner.toml`).
    The round then changes `synapse/config/server.py` (the DSA message and
    two docstrings), the test module, `docs/manhole.md`, the manhole
    paragraph of `config_documentation.md` and PATCHES.md (commit
    `8c74e04`), and this record; no lock file, no ignore file and no
    `manhole.py` change. Its checks ran as the ninth round's did, with
    `v52/finish/r5/` under the session's scratch directory as working
    directory and log directory: the manhole module under both venvs in the
    worktree before the commit and on `8c74e04`'s clean tree, and against a
    `git archive` of `d673fe6` with the module copied in, under both;
    `tests.config` and `tests.blackout_runtime` under both venvs on
    `8c74e04`'s clean tree, each started with the 1-minute load under 3.5;
    a count of `Key.sign` results for DSA keys with a q of 161, 224 and 256
    bits under both versions (`finish/r5/logs/dsa-sign-count.txt`) and a
    check of the ninth round's `openssl` parameters against the test
    helper's generator (`finish/r5/logs/dsa-generator-check.txt`); mypy
    evenly on the two changed Python files in `git archive` copies of
    `d673fe6` without and with the change; `poetry lock --check`; and the
    scanners on `git archive` exports of `8c74e04` and of `develop`'s
    `0f9df74`. The full suite, the targeted modules as a whole and
    `blackout_runtime_tests` did not run, Semgrep did not run, and no
    homeserver was booted.
-   **The eleventh round** starts with a merge of `origin/develop` at
    `97756ff`, commit `4e759b4`: #1001 (opened 2026-11-08 05:17:59 UTC,
    merged 06:28:36 UTC) moves metro to 0.83.8 under react-native 0.82.1,
    which takes image-size out of `pnpm-lock.yaml`, and removes both
    image-size `[[IgnoredVulns]]` from `osv-scanner.toml`, the four
    image-size lines from `.trivyignore` and both entries of
    `pnpm.auditConfig.ignoreGhsas` (now empty), with
    `dependency-advisories-image-size-2026-11-02.md` and a resolved note in
    the 2026-10-30 record. Three files conflicted, each where this branch
    had rewritten an image-size entry, and each was resolved by removal, as
    that record's overlap section planned: `.trivyignore`'s header keeps
    `develop`'s image-size bullet and this branch's paragraph on
    `pnpm-lock.yaml` and `poetry.lock` and lists all five records, and its
    body drops this branch's image-size block and `develop`'s Twisted
    blocks, leaving the two brace-expansion lines; `osv-scanner.toml` and
    the 2026-10-30 record take `develop`'s side whole. No ignore file holds
    an image-size entry, and nothing under `apps/blackout-server` changed.
    Of the six files the merge changes against this branch, the three
    prettier parses (the two records and `package.json`) are formatted as
    the root config would have them; it skips `.trivyignore`,
    `osv-scanner.toml` and `pnpm-lock.yaml`. The round then changes
    `synapse/config/server.py`, the test module, `docs/manhole.md`, the
    manhole paragraph of `config_documentation.md` and PATCHES.md (commit
    `b1b91e8`; `0d36d47` then re-dates a docstring of the test module and
    reflows a paragraph of `docs/manhole.md`), and this record; no lock
    file, no ignore file and no `manhole.py` change. Its checks ran with
    each venv's Python and this branch's tree first on `PYTHONPATH` (under
    both, `synapse` and `tests` import from the worktree), with
    `v52/finish/r6/` under the session's
    scratch directory as working directory and log directory: the manhole
    module under both venvs in the worktree before and after the change,
    and again on `0d36d47`'s tree (`finish/r6/docstring-*.log`);
    `tests.config` and `tests.blackout_runtime` under both venvs on
    `b1b91e8`'s tree, each started with the 1-minute load under 3.5; eight
    homeserver boots, four shapes under each version
    ([Only when the config declares a manhole
    listener](#listener-condition)); a check of the 1024-bit DSA key with a
    161-bit q under both versions (`finish/r6/q161-check.log`), which read r
    and s from the wrong bytes and which the twelfth round's replaces
    ([DSA](#dsa-refusal)); mypy evenly on the two changed Python
    files in `git archive` copies of `4e759b4` and `b1b91e8`;
    `poetry lock --check`; and the scanners on `git archive` exports of
    `b1b91e8` and of `develop`'s `97756ff`. The scripts are kept in
    `finish/r6/scripts.log`. The full suite, the targeted modules as a whole
    and `blackout_runtime_tests` did not run, Semgrep did not run, and no
    OpenSSH client was run.
-   **The twelfth round** merges nothing: `origin/develop` was still at
    `97756ff` when it started (2026-11-08 07:38 UTC), and
    `git merge-tree --write-tree HEAD origin/develop` is clean. It changes
    `docs/manhole.md`, the manhole paragraph of `config_documentation.md`,
    PATCHES.md, docstrings in `synapse/config/server.py` and the test
    module, and the comment over the test's listener constants (commit
    `23ea07c`; no code, no lock file, no ignore file), and
    this record. Its checks ran with each venv's Python and this branch's
    tree first on `PYTHONPATH` (under both, `synapse` and `tests` import
    from the worktree), with `v52/finish/r7/` under the session's scratch
    directory as working directory and log directory: the q161 check again,
    with r and s read correctly and a 160-bit-q control key, under both
    venvs (`finish/r7/probe/q161_check2.py`,
    `finish/r7/logs/q161-check2.log`); the first signature of each key
    under the system's `openssl` 3.0.13
    (`finish/r7/logs/q161-openssl-cli.log`); the review's own
    `q161_recheck.py` and `q161_purepy.py` on the same keys under both
    (`finish/r7/logs/q161-recheck.log`); OpenSSL's `crypto/dsa/dsa_ossl.c`
    at the `openssl-3.0.13` and `openssl-4.0.3` tags, read from GitHub
    (`finish/r7/src/`, with their sha256); `synapse.app.admin_cmd` on four
    configs under both (`finish/r7/logs/admincmd.log`); the manhole module
    under both venvs in the worktree with the change, before the commit
    (`finish/r7/logs/manhole-wip-*.log`); `tests.config` and
    `tests.blackout_runtime` under both venvs on `23ea07c`'s clean tree,
    each started with the 1-minute load under 3.5; ruff, black and isort on
    the two Python files under both venvs; mypy evenly on them in
    `git archive` copies of `c1a12e9` and `23ea07c`; `poetry lock --check`;
    and the scanners on `git archive` exports of `23ea07c` and of
    `develop`'s `97756ff`. The scripts are kept in `finish/r7/probe/`. The
    full suite, the targeted modules as a whole and `blackout_runtime_tests`
    did not run, Semgrep did not run, no homeserver was booted, and no
    OpenSSH client was run.
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

<a id="ghsa-8pqf"></a>**GHSA-8pqf-f4m5-798g** is the one Twisted advisory with
no fixed version: OSV's and GitHub's range is `introduced 0`,
`last_affected 26.4.0`, so neither scanner matches it against 26.10.0. Of
the two locks it matches only `develop`'s 26.4.0, where Trivy without the gate's filters
reports it as CVE-2026-106454, MEDIUM, status `affected`, no fixed version,
and the gate's severity filter and `--ignore-unfixed` each drop it; on this
branch's lock Trivy reports no Twisted row at all (fifth round). Whether
26.10.0 fixes
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

| Change (ticket)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The fork                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tcp.Connection` no longer honours a non-None return from a protocol's `dataReceived` (deprecated since 11.0) (#12688)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Four `dataReceived` definitions in `synapse/` (`http/client.py` twice, `http/proxy.py`, `http/connectproxyclient.py`); only `HTTPConnectProxyClient` returns a value: the wrapped protocol's own return, which is None for the HTTP client protocols it wraps. Upstream's file has the same `return` statements. 26.4.0 warned on a non-None value; nothing returns one. `tests.http.test_proxyagent` covers the class.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `LoggingFile.fileno()` raises `io.UnsupportedOperation` instead of returning -1 (#9638)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `synapse/app/_base.py`'s `redirect_stdio_to_logs()` installs `LoggingFile` on `sys.stdout` and `sys.stderr`; `homeserver.py` and `generic_worker.py` call it unless `no_redirect_stdio` is set. Nothing in `synapse/`, `blackout_runtime/` or `tests/` calls `fileno()` on them (the one `fileno()` call, in `replication/tcp/protocol.py`, is on a socket handle). The boot check runs this path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `conch.ssh.session.SSHSession` allows one shell, exec or subsystem request per channel (#12800)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The manhole (`synapse/util/manhole.py`, `manhole_ssh.TerminalRealm`) uses it once it starts, which without a configured key pair it could not until this change ([The manhole](#the-manhole-without-a-configured-key-pair-could-not-start)). Probed on a running homeserver from this branch: under 26.10.0 a second shell request on the same channel is refused and logged (`multiple session-client requests sent to the same session`); under 26.4.0 it is accepted. Ordinary SSH clients send one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SSHServerTransport` supports the hybrid post-quantum key exchange `mlkem768x25519-sha256` (#12520)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The manhole's transport is an `SSHServerTransport` (`manhole_ssh.ConchFactory`). Under 26.10.0 its `supportedKeyExchanges` starts `mlkem768x25519-sha256`, `curve25519-sha256`; under 26.4.0 it starts `curve25519-sha256`; `SSHClientTransport`'s list does not contain the new algorithm under either. OpenSSH added it in 9.9, available by default, and made it the default in 10.0 (the release notes). The server takes the first algorithm on the client's list that it supports (`ffs(client, server)`, `transport.py` line 930). OpenSSH 9.9's default list starts with `sntrup761x25519-sha512` and `sntrup761x25519-sha512@openssh.com`, which Twisted does not implement, then `mlkem768x25519-sha256`; 10.0's starts with `mlkem768x25519-sha256`. So a default OpenSSH client from 9.9 on negotiates it with the manhole under 26.10.0, and `curve25519-sha256` under 26.4.0 (worked out in the fifth round from both releases' `myproposal.h` and the server transport `manhole()` builds; no OpenSSH client was run). The tests in `test_manhole.py` (five, and eight from the fifth round) and the second and third rounds' probes connect with twisted.conch's client and negotiate `curve25519-sha256`, so they never ran the new server path. Checked with an independent client, asyncssh 2.24.1 (wheel sha256 matching PyPI's) offering only `mlkem768x25519-sha256`, against a homeserver from this branch's tree: under 26.10.0 it opened a manhole shell and `6*7` printed `42`; under 26.4.0 the handshake failed (`KeyExchangeFailed`: no matching key exchange algorithm). Visible only in the algorithm a client reports; no setting.    |
| `HTTPChannel.headerReceived` rejects a header value with a bare CR or LF (#12754, GHSA-q7qq)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `synapse/http/site.py` subclasses `Request` and `Site` and overrides neither `headerReceived` nor `lineReceived`. A client sending such a value now gets 400 and the connection closed where the value was parsed before. Hardening, not configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `DNSDatagramProtocol.query` discards a response from a host other than the one queried (#12696, GHSA-jj36)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Synapse's SRV lookups. A resolver that answers from a different address than it was queried on now fails those lookups. Hardening, not configuration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `AsyncioSelectorReactor.callLater` / `callFromThread` signatures aligned with the interfaces (#12767)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The asyncio reactor is installed under `SYNAPSE_ASYNC_IO_REACTOR` (`synapse/__init__.py`) and, for the Complement launcher, `SYNAPSE_COMPLEMENT_FORKING_LAUNCHER_ASYNC_IO_REACTOR` (`synapse/app/complement_fork_starter.py`); `synapse/metrics/_reactor_metrics.py` only `isinstance`-checks it. No keyword arguments are passed to `callLater` or `callFromThread`. The fifth round's boots under `SYNAPSE_ASYNC_IO_REACTOR=1` (the `unix.Port` row) came up and answered under both versions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Port.startListening()` closes the socket on `CannotListenError` (#6108); port-range errors on address literals errback (#7798)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `_base.py`'s `listen_tcp` catches `CannotListenError` and hands it to `check_bind_error`, which lets the `0.0.0.0` failure after `::` pass and re-raises any other; for the one it lets pass, the exception is released when the `except` block ends. 26.10.0 closes the failed socket before raising; 26.4.0 leaves it to close when the exception, whose traceback holds it, is released. The fifth round's probe, 20 failed binds on a port already listening: with each exception dropped at once, the process's open descriptors stay at 9 under both versions; with the last one kept, as the fourth round's probe kept it, 26.4.0 shows 10 until it is dropped and 26.10.0 stays at 9. The first listener keeps accepting under both (fourth round). Benign either way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `unix.Port` (stream sockets) keeps its path in `_bindPath` and passes port 0 to `tcp.Port.__init__`, so its `.port` is 0 (no `NEWS.rst` entry; found by the review of the fourth round in a diff of `twisted/internet/unix.py`)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `synapse/app/_base.py`'s `listen_unix` calls `reactor.listenUNIX` for a `path:` listener and logs the address from `getHost().name`; no fork code reads `.port` on a UNIX port. The fifth round booted a homeserver with a `path:` HTTP listener (`client` resource) beside its TCP one, under each version, with the default reactor and with `SYNAPSE_ASYNC_IO_REACTOR=1` (`Twisted reactor: EPollReactor` and `AsyncioSelectorReactor` in the logs): the socket was created mode 0666 with its `.lock` file, `/health` over it answered `OK`, `/_matrix/client/versions` 200 and `/account/whoami` without a token 401, the log named the socket path, no `ERROR`, `CRITICAL` or `Traceback` line was logged, and after SIGTERM (exit 0) the socket and the lock file were gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| HTTP/2 rapid-reset limit (#12705); `Request.write` chunked writes faster (#12729); websocket complete messages (#12885)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | HTTP/2 cannot be negotiated (above); websocket not used.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Not used: `PotentialZombieWarning` removed (#12744); `IProcessProtocol` must provide `processExited` (#12824); `ssl.protocolNegotiationMechanisms` deprecated (#12868); `web.client._makeGetterFactory` removed (#12721); `names.dns.Message` class attributes removed (#12667); `names.client.ThreadedResolver` removed (#12843); `trial.runner.samefile` deprecated (#12671); `MemoryReactor.removeAll()` returns the list (#12743); `FTPClient` PASV (#12847); telnet buffer bound (#12706); imap4 and words limits (#12763, #12787, #12707, #12770); `SO_REUSEPORT` and `SO_REUSEADDR` settable from user code (#9101); `twistd` exits non-zero for an unknown subcommand (#12656) | No process protocols or `spawnProcess`. From `twisted.internet.ssl`, `synapse/` imports `CertificateOptions`, `ContextFactory`, `TLSVersion` and `platformTrust` (`crypto/context_factory.py`), `optionsForClientTLS` (`handlers/send_email.py`) and, as `ssl.ContextFactory` and `ssl.ClientContextFactory`, the base classes in `http/client.py` and `replication/tcp/context.py`; `config/tls.py` takes `Certificate` and `trustRootFromCertificates` from the private `twisted.internet._sslverify`, and `crypto/context_factory.py` takes `_defaultCurveName` from it (still defined in 26.10.0, `_sslverify.py` line 1819; the private name is the import most likely to break on a future bump). The tests import `Certificate`, `trustRootFromCertificates`, `ContextFactory`, `ClientTLSOptions` and `OpenSSLCertificateOptions`. Neither `protocolNegotiationMechanisms` nor `ProtocolNegotiationSupport` appears anywhere in the fork. The tests use `MemoryReactorClock` without `removeAll()`. None of the APIs in the left cell is used in `synapse/`, `blackout_runtime/`, `tests/` or `blackout_runtime_tests/` (grep; the one `telnet` hit is the `--manhole` help string in `synapse/config/server.py`, which calls the SSH manhole a telnet service; upstream `develop`'s says only "twisted manhole"). `dns.Message`'s class attributes, `ThreadedResolver`, `_makeGetterFactory` and the socket options live in modules the fork does import (`twisted.names.dns`, `twisted.names.client`, `twisted.web.client`, `twisted.internet.tcp`) and are not used there; `FTPClient`, telnet, IMAP4 and `twisted.words` are in modules it never imports. |

Checked by import, under each version, from each tree: after importing
`synapse.app.homeserver` and `synapse.util.manhole`, `sys.modules` holds 173
`twisted.*` modules and none of `twisted.words`, `twisted.conch.telnet`,
`twisted.mail.imap4`, `twisted.web._http2` or `twisted.web.websocket`; it holds
`twisted.names`, `twisted.conch.manhole_ssh`, `twisted.conch.ssh.session`,
`twisted.mail.smtp` and `twisted.logger._file`, and `twisted.web.http.H2_ENABLED`
is False.

Not in the table, from the same `NEWS.rst` section: the features #12640
(Python 3.14 supported) and #12727 (awaiting a `Deferred` about 2-3% faster),
the documentation entries #5031 and #12676, and the Misc entries, which it
lists by number only. Until the fifth round the "Not used" row also left out
#12656. Of the modules the fork uses, three were diffed whole between the two
installed copies: `twisted/internet/unix.py` (the `unix.Port` row),
`twisted/enterprise/adbapi.py` (identical) and `twisted/python/threadpool.py`
(one comment); the rest were read through `NEWS.rst` and, where a row says
so, in the installed source.

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
-   `poetry export --extras all --without-hashes` of the old and the new
    lock differ in three requirement entries, `twisted`, `twisted[tls]` and
    `zope-interface` (two packages); with `--with dev` the same. The image
    exports with hashes (`docker/Dockerfile` adds `--without-hashes` only
    under `TEST_ONLY_SKIP_DEP_HASH_VERIFICATION`), and that export (1,434
    lines from `develop`'s lock, 1,454 from this one) differs in 94 lines:
    the same three entries on each side plus their `--hash` lines (2 for
    each twisted entry, 30 for zope-interface 6.0 and 50 for 8.7).
-   `poetry lock --check`, `check_lockfile.py` and
    `check_locked_deps_have_sdists.py` (151 packages) pass.

### zope.interface 6.0 → 8.7

Two majors. Every entry of the project's changelog (PyPI's description of
8.7) from 6.1 to 8.7, by kind, apart from those about its own tests, CI and
documentation build:

-   **Python versions and packaging.** Support for Python 3.12 to 3.15
    arrives step by step (6.1: 3.12; 6.2 to 7.1.0, with 6.4's adjustment
    for 3.13b1: 3.13; 7.2 and 8.1: 3.14; 8.6: 3.15); 7.0 drops 3.7, 8.0
    drops 3.8, 8.1 drops 3.9 and 8.7 (`requires_python >=3.11`) drops 3.10.
    8.0 replaces the `pkg_resources` namespace with a PEP 420 one; 8.0.1
    removes the run-time setuptools dependency; 8.2 moves the metadata into
    `pyproject.toml`; 6.1, 6.4 to 6.4.post2, 8.1.1, 8.4, 8.5 and 8.7 add or
    fix wheel builds and uploads (Linux for 3.12, Windows, ARM64,
    free-threaded, 3.15), and 8.0 allows a newer setuptools for the build.
-   **The C extension's behaviour.** 7.0 moves it to heap types (on 3.11 and
    later) and multi-phase module initialisation, and 7.0.1 to 7.0.3 fix
    what that broke (subclassing `ObjectSpecificationDescriptor`, a
    reference count in module initialisation, an assertion below 3.12); 7.1
    and 7.1.1 fix segmentation faults on 3.12 and 3.13. 8.3 and 8.5 add
    free-threading support (`Py_mod_gil_not_used`, strong references in the
    cache lookups, `PyType_GetDict()` on 3.13 and later). 8.3 also guards four
    `PyErr_Clear()` calls, so `KeyboardInterrupt`, `MemoryError` and
    `SystemExit` raised inside `implementedBy` and `providedBy` now
    propagate instead of being swallowed. 8.5 replaces `PyDict_GetItem()`,
    so `isOrExtends()` raises `TypeError` for an unhashable object instead
    of returning `False`. 8.7 removes the code path for static types (used
    only below 3.11), fixes free-threaded data races in the lookup caches
    (with a critical section on Python 3.13 and later, GIL builds included;
    the fork runs 3.11) and fixes
    reference leaks when the lazy import of `zope.interface.declarations`
    fails partway through.
-   **The Python API.** 6.2 accepts `|` for `typing.Union`; 7.2 drops
    `IByteString` from the `common` interfaces on Python 3.14 and later
    (the fork is on 3.11); 8.2 ignores 3.14's `__annotate_func__`.

The 8.3 and 8.5 changes are on the `providedBy`/`implementer` paths that
Twisted calls for the fork; both turn a silently wrong answer into an
exception, and no test changes outcome under 8.7
([Validation](#validation)). The fork imports
`implementer` (19 modules, tests included), `provider` (one,
`synapse/http/client.py`) and `Interface` (two), and nothing else from the
package; `zope.schema` 7.0.1 (`>=5.0.0`) and `mypy-zope` 1.0.1
(`zope.interface = "*"`) do not constrain it. Upstream
Synapse `develop` already runs on zope-interface 8.2 with Twisted 26.4.0.
mypy 1.5.1 with mypy-zope 1.0.1 over the fork's whole `mypy.ini` file list
reports no new error under 8.7 and 26.10.0: two errors fewer and one with a
changed message, all from Twisted's own types (the third round's mypy bullet
in [Validation](#validation)).

## The manhole without a configured key pair could not start

Found by the review of this change's first round, which added a
`type: manhole` listener to the boot check. Not caused by the bump and not changed by it: the
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

**Effect.** A homeserver whose config has a `type: manhole` listener without a
configured key pair (either path unset: the helper ran whenever one half was
missing) logged the ephemeral-key warning and then died. `boot.log` ends in `AttributeError: type object 'Key' has no
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
here. Commit `6b6d96e`'s message did the same ("the manhole sends one shell
per channel") and cannot be amended
([Commit messages](#commit-messages)).

**Fix.** `return Key(rsa.generate_private_key(public_exponent=65537,
key_size=2048))`, with a comment that states the above, in commit `20362e4`.
`manhole.py` was already a fork divergence with no PATCHES.md entry; it has
one now, covering the 2026-09-13 change and this one. The second round said
no documentation sentence needed changing; that was false for
`docs/manhole.md`, whose key names the code ignores
([below](#the-documented-key-names)).

**Tests.** `tests/blackout_runtime/test_manhole.py`, five tests in the second
round (the fifth adds three, [below](#one-half-configured)): the helper
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
lines; normalised, the two differ in six lines: the shell-request lines above
(26.4.0's two `Getting shell`, 26.10.0's `requesting shell` and the `ERROR`)
and where the `(TCP Port 9777 Closed)` line falls.

<a id="one-half-configured"></a>**One half configured** (found by the review
of the fourth round, fixed in the fifth). `manhole()` took the generated-key
path when `priv_key is None or pub_key is None`, a condition from
2026-09-13, and `synapse/config/server.py` loads each half on its own. So a
config with `ssh_priv_key_path` and no `ssh_pub_key_path` crashed like one
with neither until `20362e4`, and after it started on a generated pair that
discarded the configured private key, logging "no ssh_priv_key_path
configured", untrue for that config. Upstream instead fills each unset half
from its hardcoded pair, so it would serve the hardcoded public key beside a
configured private key that does not match it. Now, in commit `ce1bca9`: a
configured private key with no public key is the host key, with its public
half derived from it (`priv_key.public()`) and no warning; a configured
public key with no private key cannot be used, since the server signs the
exchange with the private half, so the generated pair is used and the
warning says the public key was ignored; with neither, the warning is the
same as before. Three new tests: the private key alone is served unchanged
(`assertIs`), with a matching public half and nothing logged at `WARNING`;
the public key alone gets a different, matching generated pair and exactly
one warning, which names `ssh_pub_key_path` and says "ignored"; and a
loopback SSH session with only the private key configured is shown that
key's public half. The no-key test now also checks its warning's text.
Against `bf32a2b`'s `manhole.py` (a `git archive` with the new test module
copied in), the three new tests fail and the other five pass, under 26.4.0
and under 26.10.0 (`build-r5/logs/trial-manhole-unfixed-*.log`); with the
change all eight pass under both. Live, from this branch's tree under each
version, with only `ssh_priv_key_path` set (a fresh 2048-bit RSA key in
OpenSSH format): `/health` answered `OK` within 2 s, asyncssh trusting only
that key's public half opened a shell and `6*7` printed `42`, the
fingerprints matched, and the log has no `manhole:` line. Under 26.10.0
from `bf32a2b`'s file, the same client failed with `HostKeyNotVerifiable`
and the log has the old warning. With only `ssh_pub_key_path` set, the
homeserver started, logged the new warning once, and presented a host key
other than the configured one, on which asyncssh (accepting any key) got a
shell; from `bf32a2b`'s file it did the same under the old warning. Each
homeserver exited 0 on SIGTERM; the only `ERROR` lines are the client's
disconnects (`code 11`, and `code 9`, host key not verifiable, in the
failed run).

<a id="the-documented-key-names"></a>**The documented key names** (found by
the review of the fourth round, fixed in the fifth). `docs/manhole.md`'s
option list and example used `ssh_priv_key` and `ssh_pub_key`, and the fork's
own host-key paragraph there (2026-09-13) repeated them.
`synapse/config/server.py` reads only `ssh_priv_key_path` and
`ssh_pub_key_path`, and `_MANHOLE_SETTINGS_SCHEMA` has no
`additionalProperties: false`, so the documented keys were dropped without a
word: a homeserver configured from that page crashed until `20362e4`, and
after it ran on a generated host key while its operator believed the key
pinned. `config_documentation.md` had the right names. Upstream `develop`'s
`docs/manhole.md`, fetched raw on 2026-11-02 (sha256 `2f985e2e…`), has the
same wrong names ("defaults to a hardcoded value") while its
`config/server.py` reads the `_path` names, so the mistake is upstream's and
the fork's paragraph copied it. The commit hash of upstream's branch was not
read (GitHub's API is refused here). Corrected in `docs/manhole.md` (the
list, the example and the paragraph, with a note that the page had the old
names), and `config_documentation.md`'s fork paragraph now says the private
key alone is enough and the public key alone is ignored. That paragraph also
said that leaving both unset "is no longer a confidentiality problem". A host
key that changes on every restart gives a client nothing stable to check, so
it cannot tell a restart from an impersonator; the paragraph now says that.
PATCHES.md has a bullet for each. No other tracked file names the old keys
outside this record, that PATCHES.md bullet and the note in `docs/manhole.md`
(`git grep`).

<a id="host-key-types"></a>**Host keys other than RSA** (found by the review
of the fifth round, fixed in the sixth). `manhole()` filed the host key as
`factory.privateKeys[b"ssh-rsa"]` and `publicKeys[b"ssh-rsa"]` whatever its
type, as upstream's `manhole.py` does (fetched raw on 2026-11-02, sha256
`2aec8f2b…`). Twisted's server offers the host-key algorithms of the keys it
holds (`SSHFactory.buildProtocol` chains `supportedSignatureAlgorithms()` over
`privateKeys`: `[b"ssh-ed25519"]` for an Ed25519 key, `[b"ecdsa-sha2-nistp256"]`
for a P-256 one) and then fetches the negotiated algorithm's pair by key type
(`SSHServerTransport._getHostKeys`, which maps `rsa-sha2-256` and
`rsa-sha2-512` to `ssh-rsa` and leaves every other name as it is), the same in
26.4.0 and 26.10.0. So with an Ed25519 or ECDSA key the server offered that
key's algorithm, the client took it, and the lookup raised `KeyError`: the
homeserver started, logged no `manhole:` line, and dropped each connection,
logging the `KeyError` as an unhandled error. The fifth round's review booted
it under each version with an Ed25519 key at `ssh_priv_key_path`: `/health`
answered `OK`, its client got no session, and the log has
`twisted - CRITICAL - … Unhandled Error`. Of the three key types, only RSA
worked, so the fifth
round's "`ssh_priv_key_path` alone is enough" held for an RSA key only. On
`develop`, where a configured key took effect only as a pair, an Ed25519 or
ECDSA pair fails the same way: there the new ECDSA pair session test fails
with `KeyError: b'ecdsa-sha2-nistp256'` under 26.4.0 (the other new tests but
the two curve refusals and the eighth round's two DSA refusals, which fail
with "the config loaded", stop earlier, at the `fromCryptographyKey`
`AttributeError`; `finish/r3/logs/manhole-develop-t26.4.log`). Upstream fails
the same way for any key that is not RSA.

Now, in commit `6c0aab8`, both dicts are keyed by `priv_key.sshType()`. Found
while making that change: `ConchFactory` declares `publicKeys` and
`privateKeys` on the class (`twisted/conch/manhole_ssh.py`, both versions), so
upstream's item assignment writes into two dicts that every factory in the
process shares; keyed by type, a factory would also serve whatever keys of
other types earlier factories had left there. Each factory now gets its own
two dicts. The config check: `synapse/config/server.py` loaded the two files
and compared nothing. `_check_manhole_host_key` now raises a `ConfigError` at
startup for a public key at `ssh_priv_key_path` (at
`manhole_settings.ssh_priv_key_path`), and for an `ssh_pub_key_path` whose key
type differs from the private key's or which is another key of the same type
(at `manhole_settings.ssh_pub_key_path`). Each message names the file and what
it holds, for example "The manhole public key file … holds a ssh-rsa key, and
the private key file … a ssh-ed25519 key. ssh_pub_key_path must be the public
half of the key at ssh_priv_key_path, or be left unset: the public half is
then derived from the private key." Each refused shape starts a manhole on
which no session completes: a probe under 26.10.0 that calls `manhole()`
directly, past the check, got no session with two RSA keys as the pair, with
an Ed25519 private key beside an RSA public key, or with an Ed25519 public
key as the private key (there the server raises `AttributeError: …
object has no attribute 'sign'`; `finish/logs/mismatch-probe.log`). No
tracked config enables the manhole (`git grep -i -l manhole` outside the
fork's `synapse/`, `tests/`, `docs/`, PATCHES.md and CHANGES.md and this
record finds four files: a line in the repository's root agent-notes file,
`apps/blackout-server/mypy.ini`, and two earlier records,
`docs/security/semgrep-triage-2026-09-13.md` (8 lines) and
`docs/security/synapse-dependencies-triage-2026-10-25.md` (2 lines), the
last two documentation, not configuration), so the refusals stop no
deployment in this repository.

<a id="curve-refusal"></a>**A key on a curve Twisted has no SSH type for**
(found by the review of the sixth round, fixed in the seventh, commit
`2bf76ad`). `_check_manhole_host_key` compared the two files' types with
`Key.sshType()`, which Twisted computes for an EC key from `_secToNist` in
`twisted/conch/ssh/keys.py`, a table of three curves (P-256, P-384 and P-521),
raising `KeyError` for any other, while `Key.fromFile` loads a PEM
`EC PRIVATE KEY` on any curve cryptography knows; the same in 26.4.0 and
26.10.0. (A PKCS#8 PEM or a `PUBLIC KEY` PEM of such a key does not load,
`BadKeyError: unknown key type`, so the existing "Failed to read" refusal
covers those; and `ssh-keygen` cannot write such a key, cryptography refusing
the OpenSSH serialization of secp256k1, so only a PEM from `openssl` reaches
the check.) A secp256k1 key at `ssh_priv_key_path` alone passed the check,
which called `sshType()` only once a public key was configured too; the
homeserver listened on HTTP and then stopped in `start_listening` with
`KeyError: b'secp256k1'` from `manhole()`'s `priv_key.sshType()`, exit 1,
naming no setting (the sixth review booted that shape under each version
against `cd6b0a4`). The same file at `ssh_pub_key_path` beside a P-256 key
raised the `KeyError` from the check's own type comparison. `_manhole_key_type`
now turns that `KeyError` into a `ConfigError` at the setting whose file holds
the key, at `ssh_priv_key_path` or at `ssh_pub_key_path` beside a private key.
With no private key configured, a public key is not checked:
`_check_manhole_host_key` returns before reading it, and `manhole()` ignores
it with its "configured without ssh_priv_key_path" warning and serves a
generated RSA key (`finish/r3/logs/config-probe.txt`, both versions). The
message: "The manhole key file … holds an EC key on the curve secp256k1,
which the SSH server has no key type for. The manhole host key must be an
RSA, Ed25519 or ECDSA P-256, P-384 or P-521 key." Both documentation pages
name the refusal, and PATCHES.md's `server.py` bullet records it.

Tests (ten new in `tests/blackout_runtime/test_manhole.py` in the sixth
round, two in the seventh and three in the eighth, twenty-three in all; the
eighth round's are in [DSA](#dsa-refusal), and the runs this paragraph cites
are the seventh round's, of the then twenty): each of RSA, Ed25519 and ECDSA
P-256, P-384 and P-521 is filed under its own
type, and Twisted's own `_getHostKeys` finds the pair for every algorithm the
server offers; a second factory leaves the first one's key alone; through
`HomeServerConfig.parse_config_dict`, with key files written as `ssh-keygen`
writes them (an OpenSSH private key and its `.pub`), a public key at
`ssh_priv_key_path` is refused for each of the five, a public key of another
type for three pairs (Ed25519 with RSA, RSA with ECDSA P-256, P-256 with P-384)
and another key of the same type for each of the five, each at its setting's
path and naming the file, and (seventh round) a secp256k1 `EC PRIVATE KEY`
PEM is refused at `ssh_priv_key_path` (that test also pins why: the key
loads, `sshType()` raises `KeyError`, and so does `manhole()` given it) and
at `ssh_pub_key_path` beside a P-256 key, while matching pairs and private
keys alone load for
all five; and loopback SSH sessions with Twisted's client, the key read through
the homeserver config, on an Ed25519 key alone (`ssh-ed25519` negotiated), an
ECDSA P-256 pair (`ecdsa-sha2-nistp256`), P-384 and P-521 keys alone, and an RSA
key file (`rsa-sha2-512`), each shown the configured key's public half. Against
the merge commit `33d9ef1`'s `manhole.py` and `server.py` (a `git archive` with
the module copied in), ten of the twelve new tests fail under 26.4.0 and
under 26.10.0, the same ten under both: the two factory tests
(`[b'ssh-rsa'] != [b'ssh-ed25519']`, and the first factory serving the second
one's RSA key),
the five refusals ("the config loaded, no ConfigError") and the sessions on
Ed25519, on ECDSA P-256 and on P-384 and P-521 (the last stops at P-384), each
with `password authentication failed` and the server's
`KeyError: b'ssh-ed25519'`, `b'ecdsa-sha2-nistp256'` or
`b'ecdsa-sha2-nistp384'` logged.
The RSA key file session, the matching-pairs test and the eight earlier tests
pass there (`finish/logs/manhole-unfixed-*.log`; the sixth round's run of the
then eighteen had eight failing, the same but for the two curve tests).
Against `develop`'s files under 26.4.0 the ECDSA pair session fails with its
`KeyError`, the two curve refusals fail ("the config loaded") and the other
seventeen error with the `fromCryptographyKey` `AttributeError`
(`finish/logs/manhole-develop-r5.log`). Against the sixth round's files
(`cd6b0a4`) the two curve tests alone fail under each version: the
private-key one with "the config loaded, no ConfigError", the public-key one
erroring with `KeyError: b'secp256k1'` from the type comparison
(`finish/logs/manhole-r6-server-*.log`). With the change all twenty pass
under both versions (`finish/logs/manhole-fixed-*.log`).

Live, from this branch's tree under each version (`finish/bin/boot.sh`: a
generated sqlite config with a loopback manhole listener, and the fifth
review's Twisted client probe; the sixth round booted the first four shapes
with these outcomes, the seventh all five, and the logs are the seventh's):
with an Ed25519 key at `ssh_priv_key_path`
alone and with an ECDSA P-256 pair, `/health` answered `OK` within 2 s, the
client was shown the configured key (equal fingerprints), its shell printed
`42` for `6*7`, the log has no `manhole:` line, and the homeserver exited 0
on SIGTERM; the only `ERROR` lines are `Got remote error, code 10`, the
probe's own disconnect. With an Ed25519 private key beside an RSA
`ssh_pub_key_path`, with the Ed25519 `.pub` file as `ssh_priv_key_path`, and
with a secp256k1 `EC PRIVATE KEY` PEM as `ssh_priv_key_path`,
the homeserver exited 1 without listening, after
`Error in configuration at 'manhole_settings.ssh_pub_key_path':`,
`Error in configuration at 'manhole_settings.ssh_priv_key_path':` and, for
the last, `Error in configuration at 'manhole_settings.ssh_priv_key_path':`
followed by the curve message above and `b'secp256k1'`, the `KeyError`'s own
text (`finish/boots/boots.txt`).

<a id="dsa-refusal"></a>**A DSA key** (found by the review of the seventh
round, fixed in the eighth, commit `57d9d26`). `_check_manhole_host_key`'s
docstring said it refuses "a manhole host key the SSH server could not use",
and `_manhole_key_type`'s message said the host key "must be an RSA, Ed25519
or ECDSA P-256, P-384 or P-521 key", but nothing refused a DSA key:
`Key.sshType()` returns `b"ssh-dss"` for any of them. Twisted's `Key.sign`
packs an ssh-dss signature's r and s into 20 bytes each
(`int_to_bytes(r, 20) + int_to_bytes(s, 20)`, `twisted/conch/ssh/keys.py`
line 1777 in 26.4.0 and 1756 in 26.10.0) and raises `OverflowError` when
either is 2^160 or more. Both are reduced modulo the subgroup order q, so
with a 160-bit q, as in a 1024-bit key, every signature fits, and with a
224- or 256-bit q both fit with a chance of at most about 2^-126 per
signature: none of 300 did, under either version, for cryptography's 2048-
and 3072-bit keys (q of 256 bits) or for an `openssl` 2048-bit key with a
224-bit q (`finish/r5/logs/dsa-sign-count.txt`, tenth round). cryptography
50.0.2 gives a 2048-bit DSA key a 256-bit q, and `openssl` 3.0.13
(`dsaparam 2048`, `gendsa`) a 224-bit one.
Such a key loads from a PEM `DSA PRIVATE KEY` file (`openssl` 3 writes
PKCS#8 by default, which Twisted refuses with `BadKeyError`, so the existing
"Failed to read" refusal covers that file; `openssl pkey -traditional`
writes the PEM Twisted reads). cryptography refuses to write it in the
OpenSSH format ("SSH supports only 1024 bit DSA keys"), but Twisted's own
serializer writes it there, and `Key.fromString` loads that back as a
private 2048-bit `ssh-dss` key, under both versions
(`finish/r4/logs/dsa-format-probe.txt`). Signing with it
raises `OverflowError: int too big to convert`, under both versions
(`finish/r3/logs/dsa-probe.txt`). So, from `6c0aab8` until this change, a
2048-bit DSA key with such a subgroup order at `ssh_priv_key_path` passed
the config, was filed and offered as `ssh-dss`, and the server raised that
`OverflowError` on every key exchange in practice. The limit is the
subgroup order, not the key's size: a 2048-bit key with a 160-bit one, a
pair of sizes no standard names but which `openssl genpkey -genparam` makes
for DSA with `dsa_paramgen_q_bits:160` and `type:fips186_2`, loads, signs
and verifies, and the manhole, given it directly, serves a full session on
it (found by the review of the eighth round; the ninth round's two tests,
below). Nor is 160 bits a sharp line: the review of the ninth round built
by hand a 1024-bit key with a 161-bit q, which Twisted loads as a private
`ssh-dss` key, and `Key.sign` returned a signature for 108 of 300 messages
under 26.10.0 and 113 under 26.4.0, each a valid DSA signature over SHA-1
by its pure-Python check, and raised `OverflowError` for the rest; the
tenth round counted 122 and 100 on the same key
(`finish/r5/logs/dsa-sign-count.txt`). Nothing ordinary makes such a key:
cryptography and OpenSSL generate q of 160, 224 or 256 bits only,
cryptography's numbers API refuses any other q, and Twisted's own
`Key.fromString` refuses the key's public blob. Such a key serves no
session either. The review of the tenth round served it, past the check,
over loopback to Twisted's client 30 times under each version and got no
session: the server raised `OverflowError`, or the client refused the host
key with cryptography's "q must be exactly 160, 224, or 256 bits long".
And OpenSSL rejects the signatures the server does make, valid as they are:
its DSA verification refuses a subgroup order that is not 160, 224 or 256
bits before it reads the signature (`dsa_do_verify` in
`crypto/dsa/dsa_ossl.c`, `DSA_R_BAD_Q_VALUE`, lines 371 to 376 at the
`openssl-4.0.3` tag and 349 to 354 at `openssl-3.0.13`). In the twelfth
round, with r and s read from the signature's inner string
(`common.getNS(sig, 2)[1]`), `Key.sign` returned 62 and 61 of 200 under
26.4.0 and 26.10.0, the pure-Python check found every one valid, and
cryptography 50.0.2's DSA verification (OpenSSL 4.0.3) rejected every one,
as it rejected OpenSSL's own signature with the key and 20 made in pure
Python from its private value; the system's `openssl dgst -verify` (3.0.13)
refused the first under each version with "dsa_do_verify:bad q value"; and
a standard 1024-bit control key, with a 160-bit q, verified 200 of 200
under each version (`finish/r7/logs/q161-check2.log`,
`finish/r7/logs/q161-openssl-cli.log`; the review's own script on the same
keys, run again here, counted 72 and 67, all rejected,
`finish/r7/logs/q161-recheck.log`).
The eleventh round's check, which this paragraph cited for "rejected all of
them" (46 and 71), read r and s from bytes that still began with that
string's 4-byte length. That check had no control key; the same decoding,
applied in the twelfth round's check, rejects the control key's 200 valid
signatures as well (eleventh list, item 1). A 1024-bit key loads in the
OpenSSH format and signs; the seventh round's review got a session on one
with Twisted's client. It is the one size `ssh-keygen` writes for DSA where
it writes DSA at all: OpenSSH 9.9p1's `ssh-keygen.c` has "Invalid DSA key
length: must be 1024 bits", but 9.9p1 compiles DSA support only when
`configure` is given `--enable-dsa-keys`, which is off by default
(`configure.ac`; `sshkey.c` lists the DSA implementation under `WITH_DSA`,
and `ssh-keygen.1` lists no `dsa` type), so a default 9.9p1 build writes no
DSA key, and the 1024-bit limit is that of DSA-enabled and older builds.
Every ssh-dss signature, whatever the key, uses SHA-1
(`Key._getHashAlgorithm` maps `("DSA", b"ssh-dss")` to `hashes.SHA1()`), and
cryptography warns, when
writing one in the OpenSSH format, that "SSH DSA key support is deprecated
and will be removed in a future release". `_manhole_key_type` now refuses
any `ssh-dss` key with a `ConfigError` at the setting whose file holds it,
at `ssh_priv_key_path` or at `ssh_pub_key_path` beside a private key (a
DSA public key with no private key is ignored with the usual warning, as
above): "The manhole key file … holds a DSA key (ssh-dss), which the manhole
does not use: every ssh-dss signature uses SHA-1, and the SSH server cannot
in practice sign with a DSA key whose subgroup order is 224 or 256 bits, as
every standard DSA key larger than 1024 bits has. The manhole host key must
be an RSA, Ed25519 or ECDSA P-256, P-384 or P-521 key." (That is the
tenth round's wording, from `8c74e04`. `54043e4`'s said "the SSH server
cannot sign at all with a DSA key whose subgroup order is longer than 160
bits", which the 161-bit case above makes false; `57d9d26`'s said "the SSH
server cannot sign with a DSA key larger than 1024 bits, and a 1024-bit one
signs with SHA-1", which the 160-bit case above makes false.) The check's
docstring now says it refuses keys the server "cannot use or should not
offer", and which reason holds for which. Both documentation pages name the refusal, and
PATCHES.md's `server.py` bullet records it. OpenSSH 9.9's default host-key
algorithm list (`KEX_DEFAULT_PK_ALG` in its `myproposal.h`) has no
`ssh-dss`, so a default 9.9 client would find no host-key algorithm in
common with a manhole serving a DSA key. All of these were read in the
9.9p1 tarball the fourth round's review downloaded from cdn.openbsd.org,
whose sha256 (`s0P7zb…` in base64) matches the 9.9 release notes (the
build-option files `configure.ac`, `sshkey.c` and `ssh-keygen.1` in the
ninth round); no OpenSSH client or `ssh-keygen` was run, and the refusal
does not rest on any of them.

Three new tests. Through `HomeServerConfig`, a 2048-bit DSA key written as a
PEM `DSA PRIVATE KEY` at `ssh_priv_key_path` is refused at that setting,
naming the file, "a DSA key (ssh-dss)" and the types that work; the test
also pins why: the key loads as a private 2048-bit `ssh-dss` key and
`sign()` raises `OverflowError`. A 1024-bit DSA key in the OpenSSH format
(written with Twisted's serializer, since cryptography's warns) is refused
at `ssh_priv_key_path`, and its `.pub` at `ssh_pub_key_path` beside an RSA
key is refused at that setting; the test also pins that the key signs and
verifies. And a loopback session on the 2048-bit key handed to `manhole()`
directly, as the config passed it before this change: the client is shown no
host key and never authenticates, and the server logs one `OverflowError`
before dropping the connection. Against the merge commit `e66794c`'s files
(a `git archive` with the module copied in), the two refusal tests fail with
"the config loaded, no ConfigError" under 26.4.0 and under 26.10.0, and the
other twenty-one pass, the session test among them
(`finish/r3/logs/manhole-before-dsa-*.log`); with the change all twenty-three
pass under both (`finish/r3/logs/manhole-venv-*-wip.log`). Against
`develop`'s `27d8c17` under 26.4.0: five failures and nineteen errors, the
four refusals of a curve or DSA key failing with "the config loaded", the
ECDSA pair session failing with its `KeyError` (which also counts as one
error), and the other eighteen erroring with the `fromCryptographyKey`
`AttributeError`, the DSA session test among them
(`finish/r3/logs/manhole-develop-t26.4.log`).

The ninth round adds two tests (twenty-five in all), from fixed public
2048-bit DSA parameters with a 160-bit subgroup order, made by `openssl`
3.0.13 with `type:fips186_2` and written into the module (each test draws
its own private key from them). Through `HomeServerConfig`, such a key at
`ssh_priv_key_path` is refused, with "every ssh-dss signature uses SHA-1"
in the message; the test also pins that the key is 2048 bits with a 160-bit
subgroup order, that Twisted hashes ssh-dss with SHA-1, and that the key
signs and verifies. And a loopback session on it, handed to `manhole()`
directly: `ssh-dss` is negotiated, the client is shown the configured key,
and its shell prints `42`. The 2048-bit refusal test also pinned, from the
ninth round, that its key's subgroup order is longer than 160 bits. Against `6f9117b`'s files the
new refusal test fails on the message ("'every ssh-dss signature uses
SHA-1' not in" it) and the other twenty-four pass, under each version;
against `e66794c`'s it fails with "the config loaded", as the two earlier
DSA refusals do, and the other twenty-two pass, both DSA session tests among
them; with `54043e4` all twenty-five pass under both
(`finish/r4/logs/manhole-before-*.log`, `finish/r4/logs/manhole-wip2-*.log`).

The tenth round adds no test. The 2048-bit refusal test now pins that its
key's subgroup order is 224 or 256 bits, and that the message says
"subgroup order is 224 or 256 bits". Against `d673fe6`'s files (a
`git archive` with the module copied in; `apps/blackout-server` there is
`54043e4`'s) that test fails on the message ("'subgroup order is 224 or 256
bits' not in" it) and the other twenty-four pass, under each version; with
the change all twenty-five pass under both, in the worktree before the
commit and on `8c74e04`'s clean tree
(`finish/r5/logs/manhole-before-d673fe6-*.log`,
`finish/r5/logs/manhole-wip-*.log`, `finish/r5/logs/manhole-head-*.log`).

Live (`finish/r3/bin/boot.sh`: a generated sqlite config with a loopback
manhole listener and only `ssh_priv_key_path` set, and the fifth review's
Twisted client probe; logs in `finish/r3/boots/boots.txt`). From the merge
commit `e66794c`'s tree, with a 2048-bit DSA PEM key, under each version:
`/health` answered `OK` within 2 s, the log has no `manhole:` line, the
client got no key exchange, no host key and no session, the homeserver log
has `twisted - CRITICAL - … Unhandled Error` with
`builtins.OverflowError: int too big to convert`, and the homeserver exited
0 on SIGTERM. From the same tree under 26.10.0 with a 1024-bit DSA key in
the OpenSSH format, the client was shown the configured key, authenticated
and printed `42` for `6*7`. From this branch's tree with `57d9d26`'s code,
with either key under each version (four boots), the homeserver exited 1 at
startup after `Error in configuration at
'manhole_settings.ssh_priv_key_path':` and the DSA message in `57d9d26`'s
wording (above).

<a id="listener-condition"></a>**Only when the config declares a manhole
listener** (found by the review of the tenth round, fixed in the eleventh,
commit `b1b91e8`; worded exactly in the twelfth, commit `23ea07c`, after the
review of the eleventh). From `6c0aab8` to `8c74e04`,
`ServerConfig.read_config` called `_check_manhole_host_key` whatever the
listeners. Upstream loads `manhole_settings` without checking it, and only a
process that starts a
manhole listener uses it, so a homeserver with no manhole listener and a
`manhole_settings` block the check refuses (a DSA key, a mismatched `.pub`,
a public key as the private one, a curve Twisted has no SSH key type for),
which `develop` loads and runs, stopped at config load. The review booted
one with an http listener only and an `openssl` 2048/256 DSA key: exit 1
under both versions with "Error in configuration at
'manhole_settings.ssh_priv_key_path'"; and through `HomeServerConfig` that
config and one with an RSA key beside another RSA key's `.pub` loaded on
`develop`'s files and were refused on this branch's. The rationale this
record and PATCHES.md gave for every refusal, a manhole that "would start
... on which no SSH session completes, or not start", did not hold for
those configs, and no document said the refusal reached them. Now the check
runs only when `_starts_manhole_listener` finds a manhole listener for the
process the config is loaded for: in the main process a `type: manhole`
entry of `listeners` or the `manhole` option, in a worker an entry of
`worker_listeners` or the `worker_manhole` option, the listeners
`synapse/app/homeserver.py` and `synapse/app/generic_worker.py` start.
`WorkerConfig` parses the worker's listeners after `ServerConfig`, so the
function reads them from the raw config, and it takes a `worker_app` that
is unset or empty, or `synapse.app.homeserver`, for the main process, as
`synapse/app/homeserver.py` (which refuses only a truthy `worker_app`) and
`WorkerConfig` treat it. Until the thirteenth round's commit it took only an
unset `worker_app` or `synapse.app.homeserver`, so a main process with
`worker_app: ""` skipped the check (twelfth list, item 1). It reads the config, not what the process goes on to
start, which the eleventh round's wording ("a process that starts a manhole
listener", here, in both documentation pages, PATCHES.md and the
docstrings) did not say: `synapse.app.admin_cmd` starts no listener and
loads the homeserver's config with no `worker_app`, setting its own
afterwards (`synapse/app/admin_cmd.py`, lines 277 to 288), so it is checked
as the main process, or, given a worker config, as that worker. The review
of the eleventh round showed the first case; the twelfth round ran
`admin_cmd export-data` under each version with a 2048-bit DSA key from
cryptography (a q of 256 bits) at `ssh_priv_key_path`
(`finish/r7/logs/admincmd.log`): with the homeserver's config and a manhole
listener in it, exit 1 with the DSA `ConfigError` at
`manhole_settings.ssh_priv_key_path`; without that listener, past config
load to the uninitialised database; with a worker config of
`worker_app: synapse.app.admin_cmd` and `worker_manhole` added, exit 1 with
the same `ConfigError`; and with that worker config without
`worker_manhole`, past the manhole check to `WorkerConfig`'s missing
`instance_map`. The homeserver refuses the same config, so the difference
matters only for a config that declares a manhole listener for a process
that never starts it. From `23ea07c` both documentation pages, PATCHES.md
and the docstrings say what the check reads. A key file that cannot be read
still stops startup with or without a listener, as upstream's `Key.fromFile`
call always has. Both documentation pages say when the checks run, and
PATCHES.md's rationale sentence names the condition.

Tests (four new, twenty-nine in all), in `ManholeListenerTestCase`: five
refused shapes (a public key as the private one, another RSA key's public
key, an RSA public key beside an Ed25519 key, a 2048-bit DSA key and a
secp256k1 key) load for five processes that start no manhole (the main
process with an http listener only, with no listener, and with a manhole
only in `worker_listeners`; a worker with an http listener only, and one
beside a manhole only in the shared `listeners`) and are refused at their
setting for five that start one (a `listeners` entry, the same under
`worker_app: synapse.app.homeserver`, the `manhole` option, a worker's
`worker_listeners` entry and `worker_manhole`); a matching Ed25519 pair
loads for all ten; and a missing key file is refused for all ten with
"Failed to read manhole private key file". The existing config tests now
give the main process a manhole listener (`_load_manhole_settings`'s
default), so they pin the refusals as before. Against the worktree before
the change (the merge `4e759b4` with the new module), the no-manhole test
errors with the `ConfigError` of its first shape and the other twenty-eight
pass, under each version; with the change all twenty-nine pass under both
(`finish/r6/before-*.log`, `finish/r6/after-*.log`). Live, from this
branch's tree under each version (`finish/r6/scripts.log`, `boot.sh`: sqlite
and an http listener on loopback): with an http listener only and an
`openssl` 2048/256 DSA key, or an RSA key beside another RSA key's `.pub`,
the homeserver answered `/health` and exited 0 on SIGTERM; with a loopback
manhole listener added, each exited 1 after "Error in configuration at
'manhole_settings.ssh_priv_key_path':" and "Error in configuration at
'manhole_settings.ssh_pub_key_path':" (`finish/r6/boot-*.log`).

**Scope.** The operator approved the Twisted lock and the image-size
correction (the latter superseded by #1001 in the eleventh round,
[image-size](#image-size-superseded-by-1001)). These fixes are a third
thing, kept to `manhole.py`, the manhole
check in `synapse/config/server.py`, the tests and the two manhole
documentation pages, in commits separate from the lock and the ignore changes
(`20362e4`, which also carries this record's second-round corrections,
`ce1bca9`, `6c0aab8`, `2bf76ad`, `57d9d26`, `54043e4`, `8c74e04`, `b1b91e8`,
`0d36d47` and `23ea07c`), so they can be dropped from
the PR if the approved
scope is to stay exact (the Scope paragraph says how); leaving them out would
leave a known startup crash in a documented security feature with its fix in
hand, documentation that has operators set keys the code ignores, a manhole
that serves no session on an Ed25519 or ECDSA key and says nothing, a config
check that passes a key the manhole then dies on with a bare `KeyError`, or a
DSA key with a 224- or 256-bit subgroup order, on which every connection
fails in practice, and this
record's and PATCHES.md's statements about the generated host key describing
a code path that cannot run.

## image-size: superseded by #1001

**Eleventh round (2026-11-08).** #1001 did the within-range metro update
this section names as the fix: metro 0.83.8 under react-native 0.82.1
(opened 05:17:59 UTC, merged 06:28:36 UTC as `97756ff`, with its own record,
`dependency-advisories-image-size-2026-11-02.md`). It took image-size out of
`pnpm-lock.yaml` and deleted the image-size entries from all three ignore
lists, and the eleventh round's merge (`4e759b4`) took those deletions in
each of the three files where this branch had rewritten them. So the reason
correction and the `exp:2026-11-30` suffixes described below are no longer
part of this change: no ignore file holds an image-size entry, and
`pnpm.auditConfig.ignoreGhsas` is empty. What follows is what this change
did and found before that merge, kept as the record of it; its present
tense describes the tree before `4e759b4`. This record did not check #1001's
own verification.

`pnpm-lock.yaml` has image-size 1.2.1 through one path: react-native 0.82.1 →
`@react-native/community-cli-plugin` 0.82.1 → metro 0.83.5 (`image-size
^1.0.2`), reached from `packages/ui` (dependencies `react-native`,
`lucide-react-native`) and `legacy/blackout-web` (through `@blackout/ui`). No
tracked file imports image-size, no `metro.config.*` exists, and no script or
workflow runs metro or the React Native CLI (the `build` script of
`packages/ui` and of `legacy/blackout-web` is `tsc --build`; the latter's
`build:web`, `dev` and `preview` run vite). If something did run metro, it
would parse only image files on disk at bundle time: files in this
repository, of which `packages/ui` and `legacy/blackout-web` track none (no
image extension among their tracked files, no `require()` or `import` of
one), and files of installed packages, such as the five LogBox PNGs that
react-native 0.82.1 ships under `Libraries/LogBox/UI/LogBoxImages/`. None of
that is remote or user-supplied input. From #878 (2026-08-10) until this
change's fourth round, both ignore files said the images metro would parse
were this repository's committed assets; corrected after the third review.

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
    (and lodash.sortby) from the lock. It also re-resolved much else: 1,491 →
    1,516 packages, with 127 package names changing version. Around metro, the
    React Native toolchain moves (a second `@babel/core`, 7.29.7, beside the
    7.29.6 already there; hermes-parser 0.33.3 → 0.35.0). So do build tools
    the web clients use: terser 5.46.1 → 5.51.2, the lock's only terser,
    which `apps/blackout-client`'s vite 8.1.6, `legacy/blackout-web`'s vite
    7.3.7, `@rollup/plugin-terser` and metro's minifier resolve; and
    `@babel/preset-env` 7.29.2 → 7.29.7, whose one consumer is workbox-build
    (through `vite-plugin-pwa` in `apps/blackout-client`), with the Babel
    plugins under it. A second browserslist, caniuse-lite and lodash are
    added. (The review of the fourth round re-ran it and got 1,517 packages and 128 names.) The first round described all this as a
    React Native toolchain refresh, which understated it. It is a refresh of
    both toolchains with its own verification (the client build compared
    byte for byte, `pnpm --filter @blackout/ui lint`, metro's asset functions
    run on an image file), not a reason correction, and the operator
    approved only the correction on 2026-11-02. It is the follow-up, due
    before the entries lapse; this change does not schedule it.

What changed: the `osv-scanner.toml` block and both `reason` strings (which
say "due before ignoreUntil" since the third review; the "planned" of this
change's first round overstated, since nothing schedules the update), the
`.trivyignore` comment, and `exp:2026-11-30` on `.trivyignore`'s four
image-size lines (the GHSA and CVE ids), so that the Trivy gate lapses with
the OSV gates instead of ignoring them indefinitely. That suffix is the one
part of the image-size change beyond correcting the reason; the Scope
paragraph says so and how to drop it. `pnpm.auditConfig.ignoreGhsas` has no
expiry mechanism and is unchanged. `ignoreUntil` and `exp:` both stop
applying at the start of 2026-11-30; the OSV cut-off is local midnight on the
scanning host (00:00Z on CI), as the 2026-10-30 record measured, and
Trivy's is 00:00Z whatever the host's time zone (the fifth round's probe in
[The gate](#the-gate)).
The ignore ranges were written "1.2.0 and later" and "0.6.3 and later" until
the fifth round, which read literally includes the fixed 2.0.3 and 2.0.4;
both files now say "1.2.0 to 2.0.2" and "0.6.3 to 2.0.2".

## The gate

Trivy 0.69.3 with `security.yml`'s flags, over six lockfiles: the fork's
`poetry.lock` and `Cargo.lock`, the legacy API's `requirements.txt`, the
desktop `Cargo.lock`, `pnpm-lock.yaml` and
`services/perturbation/requirements.txt`. The first seven rows are the first
round's, with the database read at the time as 2026-11-01 19:08 UTC; the next
four are the second round's, with the database of 2026-11-02 01:14 UTC; the
next four are the third round's and the next four the fourth round's, both
with the database of 2026-11-02 07:17 UTC; the next eight are the fifth
round's and the next four the sixth round's, both with the database of
2026-11-02 13:15 UTC; and the last twenty-four are the seventh to twelfth
rounds', four each, all with the database of 2026-11-08 00:37 UTC
([Method](#method)). The image-size suppressions in rows before the
eleventh round's describe trees before #1001.

| Run                                                                                                          | High/Critical reported                                                                                                                                                                       | Exit |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `develop` (`f6da7b7`), `git archive`                                                                         | none                                                                                                                                                                                         | 0    |
| `develop`, `--show-suppressed`                                                                               | none; suppressed: Twisted 26.4.0 under CVE-2026-115775, CVE-2026-115776, CVE-2026-115778 and GHSA-vpp8-g58w-m8mp, and image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3) | 0    |
| `develop`, its entries given `exp:2026-11-02` (the run's own date, at 02:07 UTC)                             | the four Twisted ids and the two image-size ids                                                                                                                                              | 1    |
| `develop`, its entries given `exp:2026-11-03`                                                                | none                                                                                                                                                                                         | 0    |
| this branch's worktree at `6b6d96e` (`node_modules` and `.git` skipped)                                      | none                                                                                                                                                                                         | 0    |
| this branch, `git archive` of `03a426e`                                                                      | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed`                                                                                    | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| this branch, `git archive` of `20362e4` (second round; database of 2026-11-02 01:14 UTC)                     | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (second round)                                                                     | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`f6da7b7`), `git archive`, second round, same database                                            | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (second round)                                                                     | none; suppressed: the four Twisted ids and the two image-size ids, as in the first round                                                                                                     | 0    |
| `develop` (`f6da7b7`), `git archive`, third round (database of 2026-11-02 07:17 UTC)                         | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (third round)                                                                      | none; suppressed: the four Twisted ids and the two image-size ids                                                                                                                            | 0    |
| this branch, `git archive` of `d5fa741` (third round)                                                        | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (third round)                                                                      | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`f6da7b7`), `git archive`, fourth round (same database)                                           | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (fourth round)                                                                     | none; suppressed: the four Twisted ids and the two image-size ids                                                                                                                            | 0    |
| this branch, `git archive` of `433fc29` (fourth round)                                                       | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (fourth round)                                                                     | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`f6da7b7`), `git archive`, fifth round (database of 2026-11-02 13:15 UTC)                         | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (fifth round)                                                                      | none; suppressed: the four Twisted ids and the two image-size ids                                                                                                                            | 0    |
| this branch, `git archive` of `0f0aa13` (fifth round)                                                        | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (fifth round)                                                                      | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop`'s `pnpm-lock.yaml` alone, the four image-size lines given `exp:2026-11-02`, at 15:14 UTC, `TZ=UTC` | CVE-2025-71329 and CVE-2025-71330                                                                                                                                                            | 1    |
| same with `exp:2026-11-03`, `TZ=UTC`                                                                         | none                                                                                                                                                                                         | 0    |
| same with `exp:2026-11-02`, `TZ=Pacific/Kiritimati` (local time 2026-11-03 05:14)                            | CVE-2025-71329 and CVE-2025-71330                                                                                                                                                            | 1    |
| same with `exp:2026-11-03`, `TZ=Pacific/Kiritimati`                                                          | none                                                                                                                                                                                         | 0    |
| `develop` (`0367abd`), `git archive`, sixth round (same database)                                            | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (sixth round)                                                                      | none; suppressed: the four Twisted ids and the two image-size ids                                                                                                                            | 0    |
| this branch, `git archive` of `6c0aab8` (sixth round)                                                        | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (sixth round)                                                                      | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`7bda9eb`), `git archive`, seventh round (database of 2026-11-08 00:37 UTC)                       | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (seventh round)                                                                    | none; suppressed: the four Twisted ids and the two image-size ids                                                                                                                            | 0    |
| this branch, `git archive` of `2bf76ad` (seventh round)                                                      | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (seventh round)                                                                    | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`27d8c17`), `git archive`, eighth round (same database)                                           | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (eighth round)                                                                     | none; suppressed: the four Twisted ids and the two image-size ids                                                                                                                            | 0    |
| this branch, `git archive` of `57d9d26` (eighth round)                                                       | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (eighth round)                                                                     | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`27d8c17`), `git archive`, ninth round (same database)                                            | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (ninth round)                                                                      | none; suppressed: the four Twisted ids and the two image-size ids                                                                                                                            | 0    |
| this branch, `git archive` of `54043e4` (ninth round)                                                        | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (ninth round)                                                                      | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`0f9df74`), `git archive`, tenth round (same database)                                            | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (tenth round)                                                                      | none; suppressed: the four Twisted ids and the two image-size ids                                                                                                                            | 0    |
| this branch, `git archive` of `8c74e04` (tenth round)                                                        | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (tenth round)                                                                      | none; suppressed: image-size 1.2.1 under CVE-2025-71329 and CVE-2025-71330 (fixed 2.0.3), and nothing else                                                                                   | 0    |
| `develop` (`97756ff`), `git archive`, eleventh round (same database)                                         | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (eleventh round)                                                                   | none; suppressed: the four Twisted ids, and no image-size id                                                                                                                                 | 0    |
| this branch, `git archive` of `b1b91e8` (eleventh round)                                                     | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (eleventh round)                                                                   | none; nothing suppressed                                                                                                                                                                     | 0    |
| `develop` (`97756ff`), `git archive`, twelfth round (same database)                                          | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (twelfth round)                                                                    | none; suppressed: the four Twisted ids, and no image-size id                                                                                                                                 | 0    |
| this branch, `git archive` of `23ea07c` (twelfth round)                                                      | none                                                                                                                                                                                         | 0    |
| same, `--show-suppressed` (twelfth round)                                                                    | none; nothing suppressed                                                                                                                                                                     | 0    |

So the gate is green on both sides, and on this branch it is green without any
Twisted entry: Twisted 26.10.0 matches no advisory in any of the five
databases used here, from 2026-11-01 19:08 to 2026-11-08 00:37 UTC (until
the eleventh round this said "four"; the seventh to tenth rounds added the
fifth). On `develop` only the seven Twisted lines carry `exp:`. The first
round's two probe rows ran on a copy of its `.trivyignore` whose entries were given that
date, the image-size ones included, as the image-size ids in the first row
show (the edited copy was not kept, and the dead brace-expansion entries
would show nothing either way). Those two rows show what the date means
to Trivy: an entry
dated today was already lapsed at 02:07 UTC, one dated tomorrow still applied, so `exp:2026-11-30`
stops applying at the start of 2026-11-30 (this host runs on UTC). The fifth
round's four probe rows show that the start is 00:00Z on any host: under
`TZ=Pacific/Kiritimati`, where the local date was already 2026-11-03, an
entry dated 2026-11-03 still applied. The
`develop` run with `--show-suppressed` also shows that Trivy matches image-size
by CVE, which is why both ignore lists carried the CVE lines until #1001
removed them.

The record's commits change no file Trivy reads; neither do the manhole
commits (`20362e4`, `ce1bca9`), `d5fa741` and `89c1606` (PATCHES.md). The
second- and third-round rows above are the runs on them, the fourth round's
are on `433fc29` and the fifth round's on `0f0aa13`, whose `.trivyignore`
changes are to comments only. The sixth round's are on `6c0aab8`, which changes
no file Trivy reads either (nor does `16c6b84`, PATCHES.md), and on `develop`
after #996 and #997. The seventh round's are on `2bf76ad`, which changes no
file Trivy reads (nor does the merge `d972bbd`, documentation only), and on
`develop` at `7bda9eb`. The eighth round's are on `57d9d26`, which changes
no file Trivy reads, and on `develop` at `27d8c17`; the merge `e66794c`
between them brings in `develop`'s `pnpm-lock.yaml`, with lodash 4.18.1 for
4.18.0, a Moderate advisory below the gate's threshold either way. Trivy stays
green. The OSV gate, which reads `pnpm-lock.yaml` with its own data, was red
in the seventh round on both sides for lodash 4.18.0, and is green in the
eighth on both, with lodash 4.18.1 ([Validation](#validation), OSV). The
ninth round's are on `54043e4`, which changes no file Trivy reads, and on
`develop` at `27d8c17` again; both gates stay green on both sides. The
tenth round's are on `8c74e04`, which changes no file Trivy reads, and on
`develop` at `0f9df74`; the merge `d673fe6` between them brings in
`develop`'s `.trivyignore` header (comments only) and #999's removal of the
minimatch ignore from `osv-scanner.toml` and of the minimatch and
brace-expansion entries from `pnpm.auditConfig.ignoreGhsas`, none of which
Trivy applies. `.trivyignore`'s two brace-expansion lines stay and still
suppress nothing. Both gates stay green on both sides, and the OSV runs no
longer list an unused ignore ([Validation](#validation), OSV). The eleventh
round's are on `b1b91e8`, which changes no file Trivy reads, and on
`develop` at `97756ff`; the merge `4e759b4` between them brings in #1001's
`pnpm-lock.yaml`, without image-size, and its removal of the image-size
entries, so on this branch Trivy reports and suppresses nothing, and on
`develop` it suppresses only the four Twisted ids. Both gates stay green on
both sides ([Validation](#validation), OSV). The twelfth round's are on
`23ea07c`, which changes no file Trivy reads, and on `develop` at `97756ff`
again, with the same results.

## Validation

-   **Lock:** `poetry lock --check` (poetry 1.3.2), `.ci/scripts/check_lockfile.py`
    and `scripts-dev/check_locked_deps_have_sdists.py` (151 packages) pass;
    `poetry lock --check` passes again after the comment over `Twisted` was
    rewritten (the `content-hash` does not cover comments), and again in the
    second to twelfth rounds, which changed no lock file (the sixth on
    `6c0aab8`'s tree, the seventh on `2bf76ad`'s, the eighth on a
    `git archive` of `57d9d26`, the ninth on one of `54043e4`'s
    `pyproject.toml` and `poetry.lock`, with poetry 1.3.2,
    `finish/r4/scan/poetry-lock-check.log`; the tenth on `8c74e04`'s clean
    tree, `finish/r5/scan/poetry-lock-check.log`; the eleventh on
    `b1b91e8`'s clean tree, `finish/r6/scan/poetry-lock-check.log`; the
    twelfth on `23ea07c`'s clean tree,
    `finish/r7/scan/poetry-lock-check.log`). Every file
    hash in
    the two new lock entries matches PyPI's JSON (2 of 2 for twisted, 50 of 50 for
    zope-interface). `poetry export --extras all --without-hashes`, with and
    without the dev group, differs from `develop`'s in the `twisted`,
    `twisted[tls]` and `zope-interface` entries only; the hashed export the
    image uses differs in those entries and their `--hash` lines, 94 lines
    ([The lock](#the-lock)).
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
    53 skipped, 33 failures, 7 errors, in 24 s and 25 s (the time trial
    itself reports, here and in the full-suite table). Compared by test id,
    the 92 non-passing ids are the same with the same outcomes. The second round's
    run of the same modules from the after venv, with the five new manhole
    tests: 765 tests, 673 passing, the same 92 ids with the same outcomes,
    in 26 s; the third round's, on `d5fa741`: the same 765, 673 and 92 ids
    with the same outcomes, in 42 s; the fourth round's, on `89c1606`: the
    same again, in 58 s (`build-r4/targeted-compare-vs-r3.txt`); the fifth
    round's, with `ce1bca9`'s code: 768 tests (the three new manhole tests),
    676 passing, the same 92 ids with the same outcomes, in 35 s
    (`build-r5/targeted-compare-vs-r4.txt`). The sixth round ran two of the
    targeted modules again under each venv on `6c0aab8`'s tree:
    `tests.config`, 103 tests, and `tests.blackout_runtime`, 69 tests (the
    manhole module's eighteen among them, and the JWT module's fourteen,
    one fewer since #997), all passing under each version; its logs were
    not kept. The seventh round ran the two again under each venv on its
    tree, each run started with the 1-minute load under 3.5: `tests.config`,
    103 tests, and `tests.blackout_runtime`, 71 (the manhole module's twenty
    among them), all passing under each version (`finish/logs/config-*.log`,
    `finish/logs/runtime-*.log`). The eighth round ran the two again under
    each venv on its tree, under the same load rule: `tests.config`, 103
    tests, and `tests.blackout_runtime`, 74 (the manhole module's
    twenty-three among them), all passing under each version
    (`finish/r3/logs/config-*.log`, `finish/r3/logs/runtime-*.log`). The
    ninth round ran the two again under each venv on `54043e4`'s clean tree,
    under the same load rule: `tests.config`, 103 tests, and
    `tests.blackout_runtime`, 76 (the manhole module's twenty-five among
    them), all passing under each version (`finish/r4/logs/heavy.log` for
    both modules, 05:10:39 to 05:11:17 UTC, and `finish/r4/logs/runtime-*.log`;
    the two `tests.config` logs of those runs were overwritten by a rerun at
    05:20 UTC on `a5c2b77`, since moved to `config-head-*.log`, and the
    `config-t26.*.log` files there now hold runs from a `git archive` of
    `54043e4`, one per venv, 103 passing in each, as
    `finish/r4/logs/NOTE-config-logs.txt` says). The tenth round ran the two
    again under each venv on `8c74e04`'s clean tree, under the same load
    rule: `tests.config`, 103 tests, and `tests.blackout_runtime`, 76 (the
    manhole module's twenty-five among them), all passing under each
    version (`finish/r5/logs/config-*.log`, `finish/r5/logs/runtime-*.log`,
    each headed with the commit and a clean worktree, and
    `finish/r5/logs/heavy.log`). The eleventh round ran the two again under
    each venv on `b1b91e8`'s tree, under the same load rule: `tests.config`,
    103 tests, and `tests.blackout_runtime`, 80 (the manhole module's
    twenty-nine among them), all passing under each version
    (`finish/r6/tests.config-*.log`, `finish/r6/tests.blackout_runtime-*.log`,
    each headed with the paths `synapse` and `tests` were imported from, and
    `finish/r6/heavy.log`). The twelfth round ran the two again under each
    venv on `23ea07c`'s clean tree, under the same load rule:
    `tests.config`, 103 tests, and `tests.blackout_runtime`, 80, all passing
    under each version (`finish/r7/logs/tests.config-*.log`,
    `finish/r7/logs/tests.blackout_runtime-*.log`, each headed with the
    import paths, and `finish/r7/logs/heavy.log`, which records the commit
    and a clean worktree). All 40
    failures and
    errors are in `tests.http`: 18 failures and 1 error in the federation
    agent's module, 13 and 6 in the federation client's, 2 failures in the
    proxy agent's. Those are this sandbox's proxy variables, which the
    2026-10-30 record's fifth review traced (`https_proxy`/`HTTPS_PROXY` on
    `127.0.0.1`, read by upstream's `getproxies_environment()` call); they
    were not unset, and the same ids fail the same way under 26.4.0.
-   **The proxy-masked `tests.http` modules without the sandbox's proxy
    values** (fifth round): `tests.http.federation.test_matrix_federation_agent`,
    `tests.http.test_matrixfederationclient` and `tests.http.test_proxyagent`,
    107 tests, run under each venv through a wrapper
    (`build-r5/bin/trial_without_sandbox_proxy.py`) that replaces the
    `getproxies_environment` that `synapse.http.proxyagent` and
    `synapse.http.federation.matrix_federation_agent` call with one that
    drops every value identical to a proxy variable the sandbox exported,
    then starts trial in the same process. The environment is not changed:
    `HTTPS_PROXY`, `https_proxy` and the `no_proxy` pair stay set, a proxy
    variable a test sets itself is still seen, and these modules run on the
    test suite's memory reactor (`ThreadedMemoryReactorClock`,
    `HomeserverTestCase`) and import no real one. As they are, under each
    version: 107 tests, 63 passing, 5 skipped, 33 failures and 7 errors (39
    ids, `test_client_sends_body` under both). Filtered, under
    each version: 100 passing, 5 skipped, 2 failures, the same ids under
    both: `test_proxyagent`'s `test_http_request_via_uppercase_no_proxy` and
    `test_https_request_via_uppercase_proxy_with_blocklist`, which need the
    lowercase variables absent rather than filtered (Python's
    `getproxies_environment` lets a lowercase variable win over an uppercase
    one, so the filter drops the test's own uppercase value with it). So 37
    of the 39 ids pass under both Twisted versions once the sandbox's proxy
    is out of the way (`build-r5/logs/trial-http-noproxy-compare.txt`). The
    third and fourth reviews had run the same three modules this way and got
    the same result.
-   **The full trial suite, before and after** (`-j2`, from the two trees
    above):

    |                                                                        | Tests | OK    | Skipped | Failure | Error | Trial time |
    | ---------------------------------------------------------------------- | ----- | ----- | ------- | ------- | ----- | ---------- |
    | before (26.4.0)                                                        | 3,379 | 3,063 | 173     | 110     | 34    | 183 s      |
    | after (26.10.0)                                                        | 3,379 | 3,063 | 173     | 110     | 34    | 188 s      |
    | after, second round (26.10.0, with the manhole fix and its five tests) | 3,384 | 3,068 | 173     | 110     | 34    | 192 s      |
    | after, third round (26.10.0, `d5fa741`)                                | 3,384 | 3,068 | 173     | 110     | 34    | 205 s      |
    | after, fourth round (26.10.0, `89c1606`)                               | 3,384 | 3,068 | 173     | 110     | 34    | 220 s      |
    | after, fifth round (26.10.0, `ce1bca9`'s code and its three new tests) | 3,387 | 3,071 | 173     | 110     | 34    | 308 s      |

    Compared by test id (the ids trial lists under `[FAIL]`, `[ERROR]` and
    `[SKIPPED]`): 110, 34 and 173 on each side, the same ids with the same
    outcomes, one of them (`test_client_sends_body`) under both `[FAIL]` and
    `[ERROR]` on both sides, and `tests.test_rust` as a module-level error on
    both. Compared with the 2026-10-31 run of the fourth review (3,374
    tests, same 173/110/34; the second round compared against its log,
    `v48/r5/logs/trial-full-r5-final.log`, and kept the result,
    `build-r2/full-compare-vs-1031.txt`; the log itself is no longer in the
    session's scratch directory, whose `v48` folder last changed at 04:20
    UTC, after the second round), the non-passing ids are the same set, so the
    five tests added since pass under both versions. The second round's run
    has the same 316 non-passing ids as the two first-round runs and as the
    2026-10-31 run; its five new tests (`tests.blackout_runtime.test_manhole`)
    pass, and the same five error with the `AttributeError` when run against a
    `git archive` of the head before the fix. The third round's run, on
    `d5fa741`, has the same 316 non-passing ids with the same outcomes as the
    first round's before run and as the second round's run
    (`build-r3/full-compare-vs-r1-before.txt`, `full-compare-vs-r2.txt`). The
    fourth round's, on `89c1606`, has them again, compared with the first
    round's before run and with the third round's
    (`build-r4/full-compare-vs-r1-before.txt`, `full-compare-vs-r3.txt`). The
    fifth round's, with `ce1bca9`'s code, has them again, compared with the
    first round's before run and with the fourth round's
    (`build-r5/full-compare-vs-r1-before.txt`, `full-compare-vs-r4.txt`); its
    three new tests pass. Of
    the 144 failures
    and errors, 40 are the `tests.http` proxy-variable ones above (39 ids,
    with `test_client_sends_body` counted under both); the other
    104 are the fork's existing ones. The 2026-10-25 record gives examples of
    their causes (`synapse_rust` shadowing, the `m.blackout.signal`
    validation, and
    `tests.storage.databases.main.test_events_worker.DatabaseOutageTestCase.test_recovery`,
    which fails only under `-j`); trial's messages show others as well, for
    example a function with no `invalidate_all` (the purge and server-notice
    tests), `DeviceStore.store_device()` missing an argument and revoked
    device keys (end-to-end keys), nine `200 != 500` in
    `tests.rest.admin.test_room`, a power-level refusal in `test_events`,
    `m.room.message` blocked in signaling-only mode in `tests.test_federation`,
    and 404s in the profile and push-rule-attribute tests. Compared id by id
    with the first round's 26.4.0 run, the exception line trial prints for
    each of the 144 is the same once timestamps, paths and object addresses
    are removed (`build-r5/logs/full-reasons-vs-r1-before.txt`), so every one
    fails for the same reason under both versions. So no test changes outcome with Twisted
    26.10.0 and zope.interface 8.7; the `LoggingFile`, `dataReceived`,
    `headerReceived` and asyncio-reactor paths that the suite exercises
    behave the same.

-   **`blackout_runtime_tests`:** 85 passed under each venv (`pytest -q`,
    pytest 8.3.5 added with `--no-deps` as before), and 85 again from the
    after venv in the second, third, fourth and fifth rounds (not run in the
    sixth, seventh, eighth, ninth, tenth, eleventh or twelfth).
    `tests/blackout_runtime`
    is in the trial suite above.
-   **Boot, before and after:** `--generate-config` wrote a sqlite config
    with the 8008 listener on `['::1', '127.0.0.1']`, `tls: false`, `client`
    and `federation` resources and no `no_redirect_stdio`. This sandbox has
    no IPv6: the first start under each version failed with
    `CannotListenError: Couldn't listen on ::1:8008: [Errno 97] Address
family not supported by protocol`, the same traceback apart from Twisted's
    line numbers and the version banner's branch suffix. With
    `bind_addresses: ['127.0.0.1']` and nothing else changed, each homeserver
    answered `/health` with `OK` within 3 s and `/_matrix/client/versions`
    with a 17-entry `versions` list, and exited 0 on SIGTERM. Each first-round
    `homeserver.log` holds both starts, 350 lines: the failed `::1` start's
    190 (its `CannotListenError` traceback and one `CRITICAL`), then the
    successful start's 160, with no `Traceback`, `ERROR` or `CRITICAL`, two
    `WARNING` lines (the start banner and the version line) and
    `Redirected stdout/stderr to logs`, which is the `LoggingFile` path;
    `boot.log` holds the eight-line trusted-key-server notice only. Stripped
    of timestamps, paths, object addresses and the one request's timing, the
    two successful starts differ in one line: the version banner of the run
    from this branch's worktree carries the git branch suffix (`(b=<branch>,<sha>)`),
    which a run from a `git archive` lacks. The second round repeated both
    runs from the scratch directory, with the `::1` address removed before
    the first start, with the same result (a 160-line `homeserver.log` each,
    that one differing line) and added the manhole runs
    ([The manhole](#the-manhole-without-a-configured-key-pair-could-not-start)). The third round ran the
    manhole boot once more from the after venv on `d5fa741`: `/health`
    answered `OK` within 8 s, `/_matrix/client/versions` with 17 entries,
    the shell opened and printed `2` for `1+1`, the second shell request was
    refused with the same `ERROR` line, the 184-line `homeserver.log` has no
    other `ERROR` but the probe's disconnect and no `Traceback` or
    `CRITICAL`, and the homeserver exited 0 on SIGTERM. The fourth round
    booted twice more under each venv. With a manhole listener and no key
    pair (sqlite): asyncssh offering only `mlkem768x25519-sha256` opened a
    shell and `6*7` printed `42` under 26.10.0, and failed under 26.4.0 with
    `KeyExchangeFailed No matching key exchange algorithm found, sent
    mlkem768x25519-sha256 and received curve25519-sha256,…`; offering only
    `curve25519-sha256` it got the shell under both. The only `ERROR` lines
    are `Got remote error, code 11`, asyncssh's own disconnect
    (`SSH_DISCONNECT_BY_APPLICATION`), one per completed session. Shaped
    like production (Postgres, Redis, metrics, the template's resources):
    under each version `/health` answered `OK` within 2 s,
    `/_matrix/client/versions` listed 17 versions, `/register` without
    credentials answered 403, the metrics listener served 947 and 952 lines
    of `synapse_` samples (26.4.0, then 26.10.0), Redis listed the two
    replication channels (`localhost`, `localhost/USER_IP`) and the log has
    `Successfully subscribed to redis stream, sending REPLICATE command` and
    `REPLICATE successfully sent`, Postgres held 154 tables at schema
    version 84 with 9 and 8 connections from the homeserver, neither
    `homeserver.log` nor the Postgres server log has an `ERROR`, `FATAL`,
    `CRITICAL` or `Traceback` line, and each homeserver exited 0 on
    SIGTERM. A second `listenTCP` on a port already listening on 0.0.0.0
    raised `CannotListenError` (`[Errno 98] Address already in use`) under
    both versions and the first listener kept accepting; over 20 such
    failures, with the probe keeping the last exception, the process's open
    descriptors went from 9 to 10 under 26.4.0 and stayed at 9 under
    26.10.0. The fifth round showed the 26.4.0 extra to be that kept
    exception's socket: with each exception dropped the count stays at 9
    under both (the #6108 row). The third review had run a Redis
    boot and the same bind probe first, with the same results. The fifth
    round booted ten times more: the manhole with only `ssh_priv_key_path`
    and with only `ssh_pub_key_path`, from this branch's tree under each
    version and once each under 26.10.0 from `bf32a2b`'s `manhole.py`
    ([One half configured](#one-half-configured)); and, from this branch's
    tree, a
    `path:` HTTP listener on a UNIX socket, with the default and the asyncio
    reactor, under each version (the `unix.Port` row). Every one answered
    `/health` with `OK` within 2 s and `/_matrix/client/versions` with 200,
    and exited 0 on SIGTERM. The sixth round booted eight times more from
    this branch's tree, four under each version: an Ed25519 key alone and an
    ECDSA P-256 pair, each serving a session, and two refused shapes, each
    stopping with its `ConfigError`
    ([Host keys other than RSA](#host-key-types)). The seventh round booted
    ten times more from its tree, five under each version: those four shapes
    with the same outcomes, and a secp256k1 `EC PRIVATE KEY` PEM at
    `ssh_priv_key_path`, stopping with its `ConfigError`
    ([the curve paragraph](#curve-refusal)). The eighth round
    booted seven times more, with a DSA key at `ssh_priv_key_path`: a
    2048-bit one from the merge commit `e66794c`'s tree under each version,
    each answering `/health` and then failing every manhole connection; a
    1024-bit one from that tree under 26.10.0, serving a session; and each
    of the two from this branch's tree under each version, each stopping
    with its `ConfigError` ([DSA](#dsa-refusal)). The ninth round booted
    nothing; its 2048-bit DSA key with a 160-bit subgroup order was served
    only in the session test. The tenth round booted nothing either. The
    eleventh round booted eight times, four shapes under each version, each
    with an http listener on loopback: an `openssl` 2048/256 DSA key, and an
    RSA key beside another RSA key's `.pub`, each with no manhole listener
    (answering `/health`, exit 0 on SIGTERM) and with one (exit 1 with the
    `ConfigError`) ([Only when the config declares a manhole
    listener](#listener-condition)). The twelfth round booted nothing; it
    ran `synapse.app.admin_cmd`, which starts no listener, eight times, four
    configs under each version (the same paragraph).
-   **Lint:** the first round changed no Python file, so ruff, black, isort
    and mypy did not run then. The second round's two Python files
    (`synapse/util/manhole.py`, `tests/blackout_runtime/test_manhole.py`)
    pass the locked ruff 0.1.7, black 23.10.1 (after it rewrapped three
    lines of the test) and isort 5.13.1. mypy 1.5.1 with the fork's
    `mypy.ini` and its plugins reports no error in either file. Run where no
    venv's path names the tree (a `git archive` copy of this branch), the
    two files' import graph reports 55 errors in 27 files under Twisted
    26.4.0 and zope.interface 6.0 and 53 in 26 under 26.10.0 and 8.7, three
    lines apart (next bullet), none in either manhole file. The second
    round's "one error, in `stubs/txredisapi.pyi`" came from runs that could
    report nothing else (next bullet). mypy first reported 17 typing errors in
    the test (conch's `dict[bytes, bytes]` annotation on the key dicts,
    `Optional` channel and transport attributes, override signatures), fixed
    with casts and asserts rather than ignores. The third round's
    `synapse/handlers/send_email.py` (a comment) passes ruff, black and
    isort, and mypy reports no error in it (next bullet). The fifth round's
    two files pass ruff, black (after it rewrapped two statements of the
    test) and isort. The sixth round's three (`synapse/util/manhole.py`,
    `synapse/config/server.py`, the test module) pass ruff (after an unused
    import was removed), black and isort. The seventh round's two
    (`synapse/config/server.py`, the test module) pass ruff, black (after it
    rewrapped one statement of the test) and isort, under both venvs. The
    eighth round's two (the same files) pass ruff, black and isort as
    written, under both venvs (`finish/r3/logs/lint-wip.txt`). The ninth
    round's two (the same files) pass ruff, black and isort as written,
    under both venvs; mypy first stopped at a comment line of the test that
    began with `type:`, which it reads as a type comment, and the comment
    was reflowed (`finish/r4/mypy/after-*-typecomment.txt`). The tenth
    round's two (the same files) pass ruff, black and isort as written,
    under both venvs (`finish/r5/logs/lint-wip.txt`). The eleventh round's
    two (the same files) pass ruff, black and isort as written, under both
    venvs (`finish/r6/lint-*.log`). The twelfth round's two (the same files,
    docstrings and a comment) pass them as written, under both venvs
    (`finish/r7/logs/lint.log`).
-   **mypy, before and after, compared evenly from the third round on.** The
    second round ran mypy on the two manhole files from both venvs in the
    worktree, got the same single `stubs/txredisapi.pyi` error, and
    concluded that mypy-zope behaved the same under zope.interface 8.7 on
    that import graph. Neither run could have shown a difference. mypy puts
    every directory on the interpreter's `sys.path` on its package path and
    silences errors in modules it finds there (`is_silent_import_module`),
    so when the tree is on that path only the files named on the command
    line and `stubs/` can report. The after venv's editable install puts the
    worktree there; the baseline venv's points at a `git archive` of
    `develop`, but the second round's runs had the worktree's fork directory
    on `PYTHONPATH` as well (as its trial runs did; its mypy command line was
    not kept). The fourth round reproduced the second round's output byte
    for byte from the baseline venv in the worktree with that `PYTHONPATH`
    ("Found 1 error in 1 file"), and got "Found 55 errors in 27 files" with
    it unset, the same as in a `git archive` copy. So both second-round runs
    were silenced, not one of them, as the third round wrote. The third
    round's own check of `send_email.py` in the worktree, without
    `PYTHONPATH`, was the uneven one: 1 error from the after venv, 52 in 26
    files from the baseline venv. Run instead in a
    `git archive` copy of `d5fa741`, which neither venv's `sys.path` names,
    the fork's whole `mypy.ini` file list (925 source files) reports 311
    errors in 69 files from the baseline venv and 309 in 68 from the after
    venv. The difference is three error lines, all from Twisted's own
    types: the
    two `unreachable` errors at `synapse/metrics/_reactor_metrics.py:130` and
    `:132` ("Subclass of `_IReactorCommon` and `AsyncioSelectorReactor`
    cannot exist") are gone under 26.10.0, whose #12767 aligned that
    reactor's signatures with the interfaces, and the existing
    `HostnameEndpoint` error at `synapse/http/proxyagent.py:378` now names
    Twisted's new `Binding` type among the expected ones. No error is new
    under 26.10.0 and zope.interface 8.7, and none of the 309 is in
    `synapse/util/manhole.py`, `tests/blackout_runtime/test_manhole.py` or
    `synapse/handlers/send_email.py`. `send_email.py`'s own import graph in
    the copy: 52 errors in 26 files before, 50 in 25 after, the same three
    lines apart. The fourth round's run of the two manhole files in a
    `git archive` copy of this branch: 55 errors in 27 files before, 53 in
    26 after, the same three lines apart, none in either file. The fifth
    round's, in a `git archive` copy of `bf32a2b` with the two changed files
    copied in: the same 55 in 27 and 53 in 26, the same error lines as the
    fourth round's runs (sorted output identical), none in either file.
    The sixth round's, on its three changed Python files
    (`synapse/util/manhole.py`, `synapse/config/server.py`, the test module)
    in `git archive` copies of `33d9ef1` without and with the change copied
    in: 55 errors in 27 files under 26.4.0 and 53 in 26 under 26.10.0 on each
    side, the same error lines before and after (sorted output identical),
    none in the three files. It also said the two new
    `type: ignore[dict-item]` comments in `manhole.py` are used because
    `warn_unused_ignores` is on; `mypy.ini` turns that option on globally and
    off for `synapse.util.manhole`, so those runs could not have reported an
    unused ignore there. The eighth round checked it: in a `git archive`
    copy of `57d9d26` with that module's `warn_unused_ignores` set to True,
    mypy 1.5.1 under 26.10.0 reports 50 errors in 25 files for
    `manhole.py`'s import graph, none in `manhole.py` and so no unused
    ignore there (`finish/r3/mypy/forced-t26.10.txt`). The seventh round's, on
    its two changed Python files in `git archive` copies of `cd6b0a4` without
    and with the change copied in: the same 55 in 27 and 53 in 26 on each
    side, the same error lines before and after (sorted output identical),
    none in the two files (`finish/mypy/`). The eighth round's, on the same
    two files in `git archive` copies of `e66794c` without and with
    `57d9d26`'s versions: again 55 in 27 under 26.4.0 and 53 in 26 under
    26.10.0 on each side, the same error lines before and after (sorted
    output identical), none in the two files (`finish/r3/mypy/`). The ninth
    round's, on the same two files in `git archive` copies of `6f9117b`
    without and with `54043e4`'s versions: again 55 in 27 under 26.4.0 and
    53 in 26 under 26.10.0 on each side, the same error lines before and
    after (sorted output identical), none in the two files
    (`finish/r4/mypy/`). The tenth round's, on the same two files in
    `git archive` copies of `d673fe6` without and with `8c74e04`'s
    versions: again 55 in 27 under 26.4.0 and 53 in 26 under 26.10.0 on
    each side, the same error lines before and after (sorted output
    identical), none in the two files (`finish/r5/mypy/`). The eleventh
    round's, on the same two files in `git archive` copies of `4e759b4` and
    of `b1b91e8`: again 55 in 27 under 26.4.0 and 53 in 26 under 26.10.0 on
    each side, the same error lines before and after (sorted output
    identical), none in the two files (`finish/r6/mypy/`). The twelfth
    round's, on the same two files in `git archive` copies of `c1a12e9` and
    of `23ea07c`: again 55 in 27 under 26.4.0 and 53 in 26 under 26.10.0 on
    each side, the same error lines before and after (sorted output
    identical), none in the two files (`finish/r7/mypy/`).
-   **OSV:** osv-scanner 2.3.3 on `pnpm-lock.yaml` with `TZ=UTC`,
    `TZ=Etc/GMT-3` and `TZ=Pacific/Kiritimati`: exit 0 each time, "Filtered 4
    vulnerabilities" (deepmerge, the two image-size entries with the new
    reason printed, minimatch), no unused-ignore line; the second, third and
    fourth rounds re-ran the three on their trees with the same output (the
    fourth on a `git archive` of `433fc29`, printing the reasons as that
    commit words them), the fifth on a `git archive` of `0f0aa13` and the
    sixth on one of `6c0aab8`. The seventh round's three runs, on a
    `git archive` of `2bf76ad`, exit 1 in each time zone, for a change in
    OSV's data and not in the tree: "Filtered 3 vulnerabilities" (deepmerge
    and the two image-size entries), `GHSA-g3hv-75wg-m249` listed as an
    unused ignore, and one Medium reported, lodash 4.18.0 under
    GHSA-f23m-r3pf-42rh (CVSS 6.5, fixed 4.18.1). `develop`'s `7bda9eb`,
    whose `pnpm-lock.yaml` is byte-identical, gives the same. In a scratch
    copy of the lock and the ignore file with a lodash entry added, the run
    exits 0 and prints "No issues found" beside the unused-ignore line, so
    the exit code is the lodash advisory's, not the unused ignore's
    ([Found outside scope](#found-outside-scope-not-fixed-here), item 6;
    `finish/scan/osv-*.log`). The eighth round's three runs, on a
    `git archive` of `57d9d26`, after the merge brought in `develop`'s
    lodash 4.18.1, exit 0 in each time zone: "Filtered 3 vulnerabilities"
    (deepmerge and the two image-size entries), `GHSA-g3hv-75wg-m249` still
    listed as an unused ignore, and "No issues found". `develop`'s
    `27d8c17`, whose `pnpm-lock.yaml` is byte-identical, gives the same
    under `TZ=UTC`, the one time zone the eighth round ran it in
    (`finish/r3/scan/osv-*.log`). The ninth round's runs, on a
    `git archive` of `54043e4` and on one of `develop`'s `27d8c17`, each in
    all three time zones, give the same six times: exit 0, "Filtered 3
    vulnerabilities", `GHSA-g3hv-75wg-m249` listed as unused, and "No issues
    found" (`finish/r4/scan/osv-*.log`). The tenth round's runs, on a
    `git archive` of `8c74e04` and on one of `develop`'s `0f9df74`, after
    #999 removed the minimatch entry, each in all three time zones, give
    the same six times: exit 0, "Filtered 3 vulnerabilities" (deepmerge and
    the two image-size entries, each side printing its own image-size
    reason), no unused-ignore line, and "No issues found"
    (`finish/r5/scan/osv-*.log`). The eleventh round's runs, on a
    `git archive` of `b1b91e8` and on one of `develop`'s `97756ff`, after
    #1001 took image-size out of the lock (1,493 packages, from 1,491) and
    its two entries out of `osv-scanner.toml`, each in all three time zones,
    give the same six times: exit 0, "Filtered 1 vulnerability" (deepmerge),
    no unused-ignore line, and "No issues found"
    (`finish/r6/scan/osv-*.log`); no run prints an image-size reason any
    more. The twelfth round's, on a `git archive` of `23ea07c` and on one of
    `develop`'s `97756ff`, each in all three time zones, give the same six
    times (`finish/r7/scan/osv-*.log`). On
    `apps/blackout-server/poetry.lock`, which no gate scans this way:
    `develop`'s lock shows the eight Twisted rows (the seven above and
    GHSA-8pqf, `--` for its fix) plus black 23.10.1, pygments 2.15.1 and
    sentry-sdk 1.35.0; this branch's lock shows no Twisted row and the same
    black, pygments and sentry-sdk rows, 6 in 3 packages
    ([Found outside scope](#found-outside-scope-not-fixed-here)).
-   **pnpm audit:** `pnpm audit --prod --audit-level high` and
    `pnpm run guard:audit-clean` (`--audit-level moderate`) exit 0, both
    reporting "1 low | 1 moderate (1 ignored) | 2 high (2 ignored)", in each
    of the first five rounds. The sixth round's record names no run of
    them, and the seventh and eighth did not run them. The ninth round ran
    both with pnpm 9.15.4 on a `git archive` of `54043e4` and on one of
    `develop`'s `27d8c17`, whose `package.json` and `pnpm-lock.yaml` are
    byte-identical: exit 0 and "1 low | 2 high (2 ignored)" from each, the
    moderate gone because GitHub moved GHSA-g3hv-75wg-m249's range past the
    locked minimatch, the same change that leaves its OSV ignore unused
    ([Found outside scope](#found-outside-scope-not-fixed-here), item 6;
    `finish/r4/scan/pnpm-*.log`). The tenth round ran both again on
    `git archive` copies of `8c74e04` and of `develop`'s `0f9df74`, after
    #999 dropped two `ignoreGhsas` entries that matched nothing: exit 0 and
    "1 low | 2 high (2 ignored)" from each (`finish/r5/scan/pnpm-*.log`).
    The eleventh round ran both on `git archive` copies of `b1b91e8` and of
    `develop`'s `97756ff`, after #1001 took image-size out of the lock and
    emptied `ignoreGhsas`: exit 0 and "1 low" from each, the two ignored
    highs, image-size's, gone (`finish/r6/scan/pnpm-*.log`). The twelfth
    round ran both on `git archive` copies of `23ea07c` and of `develop`'s
    `97756ff` with the same result (`finish/r7/scan/pnpm-*.log`).
    Unchanged by this PR.
-   **gitleaks 8.21.2** over `origin/develop..HEAD`: after the first two
    commits, 2 commits scanned, no leaks; after the fourth (`20362e4`), 4
    commits scanned, no leaks; after the sixth (`d5fa741`), 6 commits
    scanned, no leaks; after the ninth (`89c1606`), 9 commits scanned, no
    leaks; after the twelfth (`0f0aa13`), 12 commits scanned, no leaks; in
    the sixth round, after the merge and `6c0aab8`, 14 commits scanned
    of the 15 in the range (the merge commit is not counted), no leaks; in
    the seventh round, after the second merge and `2bf76ad`, 17 commits
    scanned of the 19 in the range (two merge commits), no leaks; in the
    eighth, after the third merge and `57d9d26`, 19 commits scanned of the
    22 in the range (three merge commits), no leaks
    (`finish/r3/scan/gitleaks-*.log`); in the ninth, after `54043e4`, 21
    commits scanned of the 24 in the range, no leaks
    (`finish/r4/scan/gitleaks-after-fix.log`); in the tenth, after the
    fourth merge and `8c74e04`, 23 commits scanned of the 27 in the range
    (four merge commits), no leaks (`finish/r5/scan/gitleaks-code.log`); in
    the eleventh, after the fifth merge and `b1b91e8`, 25 commits scanned of
    the 30 in the range (five merge commits), no leaks
    (`finish/r6/scan/gitleaks-code.log`); in the twelfth, after `23ea07c`,
    28 commits scanned of the 33 in the range (five merge commits), no leaks
    (`finish/r7/scan/gitleaks-code.log`).
-   **Semgrep 1.95.0**, the version the third review used, from PyPI into a
    scratch venv, with `security.yml`'s rulesets (`p/security-audit`,
    `p/secrets`) over the files the branch changes, each time in a
    `git archive`: on `0f0aa13`, the fifteen it changes against `f6da7b7`,
    and on `6c0aab8`, the sixteen it changes against `develop`'s `0367abd`
    (the fifteen and `synapse/config/server.py`). The summaries read "Ran
    116 rules on 15 files: 0 findings" and "… on 16 files: 0 findings", with
    no errors, and each also says "Scan skipped: 1 files matching
    .semgrepignore patterns". With `--verbose` that file is
    `apps/blackout-server/tests/blackout_runtime/test_manhole.py`: the
    repository has no `.semgrepignore`, so semgrep applies its built-in list
    (`semgrep/templates/.semgrepignore` in the package), which ignores `tests/`,
    and its summary counts the skipped file. So 14 of the 15 files were scanned
    on `0f0aa13`, and 15 of the 16 on `6c0aab8`. The test module, scanned on its
    own with an empty `.semgrepignore` in the copy, gives 0 findings (115 rules
    on 1 file). Whether the workflow's `semgrep ci` skips it the same way was
    not checked. The fifth round's bullet gave the summary's count and left out
    the skip. Semgrep did not run in the seventh, eighth, ninth, tenth,
    eleventh or twelfth round.
-   **Centralized CI Parity** (`centralized-ci-parity.yml`, which this PR
    triggers through `docs/**`) runs `pnpm lint`, `pnpm test`, `pnpm build`,
    `guard:ops-artifacts` and the smoke-aligned checks. Run here:
    `guard:ops-artifacts`, `guard:feature-registry`, `guard:feature-budget`,
    `guard:dev-filters` and `guard:preset-complete`, each exit 0. Not run:
    the turbo `lint`, `test` and `build` pipelines and the web client build.
    This branch changes no file they build or lint (no TypeScript or
    JavaScript, no `package.json` or lockfile; `@blackout/server`'s three
    scripts run `@blackout/api`'s, which do not read the Python fork or
    `docs/`), so they cannot differ from `develop`'s; the PR's own run is the
    check.
-   **prettier 2.8.1**, the root's version, `--check` on every changed
    Markdown and YAML file: clean, in every round (the sixth on the files
    `git diff --name-only origin/develop` lists that prettier parses).
    `.trivyignore` and `osv-scanner.toml` are skipped by `--ignore-unknown`;
    `pyproject.toml` and `poetry.lock` are under `apps/blackout-server/`,
    which `.prettierignore` leaves alone apart from `PATCHES.md`.
-   **No pre-commit hook ran.** `core.hooksPath` is `.husky/_`, which this
    worktree does not have (its `node_modules` were installed with
    `--ignore-scripts`). The hook's two steps were run by hand on the staged
    files before each commit, and passed each time: lint-staged's `prettier
--write --ignore-unknown` (as `--check`) and `node
tools/ci/check-auth-secrets.mjs`.
-   **A model name appears in no changed file;** checked with a
    case-insensitive grep for model and vendor names over
    `git diff origin/develop...HEAD`, the branch's own changes, with no hit.
    The record refers to the repository's root agent-notes file without its
    file name, which the grep would match.

## Before merge or release

-   **The fork image was not built here** (no Docker daemon, as in the
    earlier records), and no workflow builds it. The Synapse fork's image
    comes from `apps/blackout-server/docker/Dockerfile` (poetry 1.3.2,
    `poetry export --extras all`, then `pip install -r` of the export).
    `infra/single-server-baseline/deploy.sh` builds it on the server as
    `blackout-synapse:stable`, after resetting its checkout to
    `origin/develop`, then recreates the stack's `synapse` service with
    `docker compose` in its runtime directory `INFRA_DIR`
    (`infra/single-server-baseline/docker-compose.yml` defines that service
    on `blackout-synapse:${SYNAPSE_TAG:-stable}`); `RUNBOOK.md` gives the same
    build by hand. `docker.yml` and `release.yml` build
    `apps/blackout-server/Dockerfile`, which is the Node backend API image
    (`@blackout/api`) and installs nothing from `poetry.lock`. So the first
    `pip install` of this lock's export happens on the first `deploy.sh` run
    (or hand build) after this merges to `develop`, and a `deploy.sh` run
    also puts Twisted 26.10.0 into the running homeserver. The install set
    differs from `develop`'s in the three export entries above (two packages),
    and neither package needs a system library the image lacks (twisted's
    wheel is pure Python; zope-interface 8.7 ships cp311 manylinux wheels
    for x86_64 and aarch64). Checking `pip show twisted zope.interface` in
    the built `blackout-synapse:stable` once (26.10.0 and 8.7) is enough.
-   **The metro update, before 2026-11-30.** Done by #1001 (eleventh round;
    the rest of this bullet is as the earlier rounds wrote it). #1001 was
    opened on 2026-11-08 at 05:17:59 UTC and merged at 06:28:36 UTC, and
    the merge `4e759b4` brought it here, so no image-size ignore is left to
    lapse. "No change for it exists yet", below, was true when the fourth
    round wrote it (`bf32a2b`, 2026-11-02 13:58 UTC; #1001's commit
    `7e3cc87` is dated 17:09 UTC that day) and false when the tenth round
    kept it (until the twelfth round this note named the first round and
    `648c914`, which only reflowed it): #1001 had been open since 05:17:59
    UTC, and that round's Method bullet names it. As written before: the
    image-size ignores lapse at
    the start of that day in all three places that enforce a date (the two
    OSV gates through `ignoreUntil`, Trivy through `exp:`). The OSV gates'
    `ignoreUntil` is that date on `develop` already, so they go red then
    whether or not this change merges. No change
    for it exists yet, and this one does not schedule it, so it needs
    queuing. The fix is a within-range metro update that removes image-size
    from the lock ([image-size](#image-size-superseded-by-1001)).
    The recorded method re-resolves build tools the web clients use as well
    as the React Native toolchain; a narrower route, such as
    `pnpm.overrides` entries for metro and its `metro-*` packages that leave
    other resolutions in place unless metro 0.83.8's own ranges need newer
    ones, may move less and was not tried. Either way it needs its own
    change with the client build compared byte for byte against `develop`'s,
    `pnpm --filter @blackout/ui lint`, metro's `getAssetSize` and
    `getAssetData` run under 0.83.8 on a PNG (the two consumers track no
    image; react-native's LogBox PNGs serve), and then the removal
    of the three image-size entries (`.trivyignore`, `osv-scanner.toml`,
    `pnpm.auditConfig.ignoreGhsas`). If it is not going to land in time,
    moving the date without it would repeat what this change had to correct;
    the alternative is to let the gates go red on the day and say why.
-   **The OSV gate was red from 2026-11-03 until #998, on `develop` and on
    this branch**, for a change in OSV's data and not in any tree: lodash
    4.18.0, which `pnpm-lock.yaml` held through the
    `lodash@4.17.23: ^4.18.0` override in `package.json`, fell inside
    GHSA-f23m-r3pf-42rh's range that day (fixed 4.18.1). `security.yml`'s
    osv-scanner step failed on every push to `develop` and on every pull request
    that touches a path the workflow watches, this one included. #998 moved the
    override to `^4.18.1` and the lock to 4.18.1 on `develop` (`77e6e68`, merged
    2026-11-08 03:36 UTC), and the eighth round merged it here, so the step
    passes on this branch's head and on `develop`'s `27d8c17`
    ([Validation](#validation), OSV). It still reports the minimatch entry of
    `osv-scanner.toml` as an unused ignore, without failing for it, as that
    entry's own plan anticipated: GitHub corrected GHSA-g3hv-75wg-m249's range
    to start at 7.0.0 on 2026-11-04, so 3.1.5 is out of it. #999, open at the
    time of writing, removes the entry and its `pnpm.auditConfig.ignoreGhsas`
    mirror on `develop` ([Found outside
    scope](#found-outside-scope-not-fixed-here), item 6). (Tenth round: #999
    merged on 2026-11-08 at 05:51 UTC and the merge `d673fe6` brought it
    here; the step passes on this branch's head and on `develop`'s `0f9df74`
    with no unused-ignore line.)

## Found outside scope (not fixed here)

1.  **Advisories in `poetry.lock` that no gate reports: two Lows first
    noted here, and black's four (dev) as the 2026-10-25 triage left
    them.** osv-scanner
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
    In all, osv-scanner prints 6 vulnerabilities in 3 packages for this
    branch's lock ("1 Critical, 2 High, 1 Medium, 2 Low", by the CVSS it
    shows). The other four are black 23.10.1's: PYSEC-2026-2120 (CVSS 9.8),
    GHSA-cg8m-r9f2-5wm2 (8.7), PYSEC-2026-2121 (7.5) and PYSEC-2024-48
    (5.3). black is a dev dependency, which Trivy's poetry analyzer skips
    and the image does not install; `synapse-dependencies-triage-2026-10-25.md`
    ("Black: dev-only, not bumped") triaged all four and left the formatter
    for a reconciliation with upstream. Unchanged here.
2.  **The baseline venv's console scripts point at a venv that no longer
    exists.** `venv-r5` under this session's scratch directory was made as a
    copy of `venv-after`, so its `bin/pip`, `bin/trial` and the rest carry
    `venv-after`'s interpreter in their shebang. That is why this task's
    notes read `pip show pyasn1` as 0.6.4 in a venv whose `dist-info` and
    `pyasn1.__version__` said 0.6.5 (the 2026-10-30 record itself contains no
    such reading): that `pip` ran the other venv's Python.
    Every command here used `<venv>/bin/python -m ...`. A scratch matter, not
    a repository one, recorded so the earlier note is explained. The fifth
    round's task again listed `venv-r5` among the venvs to delete before
    making one; it is this record's 26.4.0 baseline, so it was kept (none was
    made this round, and the other three paths listed no longer exist).
3.  **The within-range metro update was pending** when this item was
    written. (Eleventh round: #1001, opened 2026-11-08 05:17:59 UTC and
    merged 06:28:36 UTC, is that update, and the merge `4e759b4` brought it
    here; [Before merge or release](#before-merge-or-release).) The dry run
    also printed pnpm's `unmet peer react@^18.2.0: found 19.2.5` for the
    React Native tree; whether that warning exists on `develop`'s lock,
    before or after #1001, was not checked, and #1001's record does not
    mention it.
4.  **`.trivyignore` still carries the dead brace-expansion entries** that the
    2026-10-30 record's item 7 describes. Unchanged here. (Tenth round: #999
    removed their `pnpm.auditConfig.ignoreGhsas` mirror on `develop`, and the
    merge `d673fe6` brought that here; the two `.trivyignore` lines remain.)
5.  **The `--manhole` help string calls the manhole a telnet service.**
    `synapse/config/server.py` says "Turn on the twisted telnet manhole
    service on the given port"; the manhole is SSH
    (`twisted.conch.manhole_ssh`), and upstream `develop`'s string says
    "twisted manhole". It understates rather than overstates the transport's
    protection, but it is still untrue. A fork file outside this change's
    approved scope; found by the fourth round's grep and left for its own
    change.
6.  **lodash 4.18.0 is now inside GHSA-f23m-r3pf-42rh, and the minimatch
    ignore is now unused.** Both are changes in OSV's data between the sixth
    round (2026-11-02) and the seventh (2026-11-08), found by the seventh
    round's osv-scanner runs ([Validation](#validation), OSV). The lodash
    advisory (CVE-2026-2950, prototype pollution through array paths in
    `_.unset`, `_.omit` and `_.pullAt`, CVSS 3.1 6.5, GitHub Moderate) was
    published on 2026-04-01 with lodash 4.17.23 as its one affected version;
    its entry, modified 2026-11-03T15:45Z, now gives introduced 4.17.23 and
    fixed 4.18.1 (the same for lodash-es and lodash-amd, and fixed 4.18.0 for
    the `lodash.unset` and `lodash.omit` packages, which the lock does not
    hold). The lock's one lodash is 4.18.0 (the override that answered the
    4.17.23 advisory; npm marks 4.18.0 deprecated, "Bad release", in the
    lock's own entry). The minimatch advisory (CVE-2026-118764), modified
    2026-11-04T17:01Z, now gives introduced 7.0.0 and fixed 11.0.1, where it
    gave 0 before, so minimatch 3.1.5 is out of its range and
    `osv-scanner.toml`'s `GHSA-g3hv-75wg-m249` entry (ignoreUntil
    2026-12-01) no longer matches anything; the entry's own text planned for
    this and says to delete it and its `pnpm.auditConfig.ignoreGhsas` mirror
    then. Neither is in this change's scope (a lockfile change and an ignore
    change outside the Twisted and image-size entries); both are for one
    change on `develop`. Trivy's CRITICAL/HIGH gate and `pnpm audit
--audit-level high` pass either way, the advisory being Moderate.
    (Eighth round: #998 moved lodash to 4.18.1 on `develop`, and the merge
    `e66794c` brought it here, so the lodash half is closed. The minimatch
    entry is still unused, and #999, open when this was written, removes
    it. Tenth round: #999 merged, and the merge `d673fe6` brought the
    removal here, so the minimatch half is closed too.)

## Not verified

-   The fork image with this lock: not built here (no Docker daemon), and no
    workflow builds it; `deploy.sh` does, on the server
    ([Before merge or release](#before-merge-or-release)).
-   The two `tests.http.test_proxyagent` tests that need the lowercase proxy
    variables to be absent (`test_http_request_via_uppercase_no_proxy`,
    `test_https_request_via_uppercase_proxy_with_blocklist`), under either
    Twisted version. The other 37 of the 39 ids this sandbox's proxy
    variables stop pass under both versions with those values filtered
    inside the test process (Validation). `HTTPS_PROXY` was not unset to run
    them. A runner without those variables would run them; no root workflow
    runs trial, and the fork's own workflows do not run.
-   An IPv6 listener, and the default `bind_addresses`. The production
    template (`infra/single-server-baseline/synapse/homeserver.yaml.template`)
    gives its 8008 listener no `bind_addresses`, so it takes
    `DEFAULT_BIND_ADDRESSES`, `['::', '0.0.0.0']` (`synapse/config/server.py`):
    it listens on `::`, which takes IPv4 too, and then expects `0.0.0.0` to
    fail, which `check_bind_error` in `synapse/app/__init__.py` lets pass.
    This sandbox has no IPv6
    (`[Errno 97] Address family not supported by protocol`), so every boot
    here listened on 127.0.0.1 only, and no listener bound `::` or `::1`.
    What was checked without IPv6: the failed
    `::1` start of the first round raised the same `CannotListenError` under
    both versions, and a failed second bind on 0.0.0.0 raises
    `CannotListenError` under both, 26.10.0 closing the socket first and
    26.4.0 when the exception is released (the #6108 row). A `::` listener
    followed by the `0.0.0.0` failure that
    `check_bind_error` lets pass was not run.
-   The production images' own Postgres stack. The fourth round's boot used
    psycopg2-binary 2.9.9 (a wheel with its own libpq), Ubuntu's Postgres
    16.15 and redis-server 7.0.15 with an empty database; the image builds
    psycopg2 2.9.9 from source, and production runs
    `postgis/postgis:16-3.4-alpine` and `redis:7.2-alpine` with its data.
    `twisted/enterprise/adbapi.py`, through which Synapse's database pool
    runs, is byte-identical in the two Twisted versions; `threadpool.py`
    differs in one comment.
-   An OpenSSH client against the manhole. None is installed here; asyncssh
    stood in for one, and only on RSA host keys. The Ed25519 and ECDSA host
    keys of the sixth and seventh rounds were exercised with Twisted's own client only
    (the tests and the boots), and that a default OpenSSH 9.9 client offers
    no `ssh-dss` host-key algorithm was read in its source, not observed
    ([DSA](#dsa-refusal)). That a default OpenSSH 9.9 or 10.0 client
    negotiates `mlkem768x25519-sha256` with it was worked out from their
    default lists and Twisted's selection rule, not observed.
-   Of the three hardenings against a misbehaving peer, one: a DNS response
    from an address other than the one queried was read in the release notes
    and the fork's code, not sent to a running homeserver. The other two were
    observed. The first round's review sent a header value with a bare CR and
    one with a bare LF to a running homeserver: `400 Bad Request` under
    26.10.0, `200 OK` under 26.4.0 (its logs are under the session's scratch
    directory, `verify-r1-compat/boot-*-nomh.log`). The second round's probe
    sent a second shell request on one manhole channel: refused under
    26.10.0, accepted under 26.4.0 ([The manhole](#the-manhole-without-a-configured-key-pair-could-not-start)).
-   Whether 26.10.0 fixes GHSA-8pqf-f4m5-798g. The `wildcardToRegexp` change
    was read in the two installed copies; neither OSV, GitHub nor `NEWS.rst`'s
    CVE list says so, and the IMAP4 server is not imported.
-   Twisted's GitHub release notes for 26.10.0, 26.10.0rc1 and 26.10.0rc2
    (GitHub not reachable from this session); the sdist's `NEWS.rst` was the
    source, and it says the final release has no changes since rc2.
-   metro 0.83.8's own image parser on any image file (the two consumers
    track none; react-native's LogBox PNGs are what a bundle would read),
    and the client build after the metro update. Only the lockfile-only dry
    run was done here. (Eleventh round: #1001 made the update; its record
    reports runs of both, which this record did not repeat.)

## Corrected after the first review

The first round (commits `6b6d96e`, `03a426e`, `be7bbe2`) was reviewed under
three lenses: compatibility, gates and advisory facts, and the truth of every
sentence. Each finding and what changed:

1.  **A manhole listener without a configured key pair could not start, on
    either Twisted version** (medium). Fixed
    in code with tests and a PATCHES.md entry
    ([The manhole](#the-manhole-without-a-configured-key-pair-could-not-start)); the SSHSession table row
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
    (The log has since been removed from the scratch directory; the
    comparison's output is kept, `build-r2/full-compare-vs-1031.txt`.)

## Corrected after the second review

The second round (commits `20362e4`, `4089f7f`) was reviewed under the same
three lenses. Each finding and what changed, in commit `d5fa741` (the fork
comment and PATCHES.md) and in this record:

1.  **`send_email.py`'s comment named 26.4.0 as the minimum Twisted** (low).
    Fork text from the 2026-10-25 relock (upstream's file at `cc172f7` has no
    such comment). It now says the floor is far above 21.2 without naming a
    version, and PATCHES.md's 2026-11-02 entry has a bullet for it.
2.  **PATCHES.md's 2026-10-25 entry still said only the rc fixes the three
    advisories** (low). A one-line "Superseded on 2026-11-02" pointer follows
    that sentence; the dated text is unchanged. (After the fourth review the
    pointer reads "Superseded by the 2026-11-02 entry below", item 20 of
    that list.)
3.  **The commit trailers carry a model name** (low, operator visibility). No
    change: the two trailer lines are the session's required attribution,
    no commit may be amended, and no file in the change names a model.
    (Until the third review this item also said "A squash merge would
    replace the per-commit messages". This repository merges PRs with merge
    commits: every commit on `develop`'s first-parent line since #901 of
    2026-09-08, `f6da7b7` among them, has two parents, so the per-commit
    messages land on `develop` as they are.)
4.  **The "Before merge or release" bullet named builds that never install
    the lock** (medium). `docker.yml` and `release.yml` build the Node
    backend image; the fork image is `docker/Dockerfile`, which only
    `deploy.sh` builds, on the server. The bullet and the matching "Not
    verified" item are rewritten.
5.  **Trivy's `--download-db-only` was said to have found nothing newer**
    (low). It skips the download without contacting the registry while the
    local `NextUpdate` lies ahead. The Method says so; the third round
    deleted the cached database, downloaded a newer one (2026-11-02 07:17
    UTC) and re-ran the gate rows on it ([The gate](#the-gate)).
6.  **"Differ by those two lines"** (low). The export changes three lines
    for two packages; corrected in the Lock section, Validation, "Before
    merge or release" and PATCHES.md. `pip list --format=freeze` does differ
    by two lines, and those sentences stand.
7.  **"No Python file changed, so mypy did not run"** (low). Rewritten.
    Re-checking it showed the second round's before/after mypy comparison
    could not show a difference: both of its runs were silenced, because the
    tree was on the interpreter's path for both (this item said "uneven"
    until the third review, see the mypy bullet). The even comparison, over
    the fork's whole `mypy.ini` file list in a `git archive` copy, replaces
    it ([Validation](#validation)).
8.  **The full-suite time column mixed two bases** (low). It now gives
    trial's own `Ran … in` time on every row, as the targeted figures
    already did.
9.  **The first round's `homeserver.log` was said to be 160 lines** (low).
    Each holds both starts, 350 lines; the Boot bullet says so.
10. **"The two differ only in those Twisted session lines"** (low). Six lines
    differ, including where the port-closed line falls; corrected.
11. **The Scope paragraph's watched paths missed `package.json` and the
    framing-guard script** (low). It now lists `security.yml`'s whole
    `paths:` filter.
12. **zope.interface 8.7's reference-leak fix was placed in the lookup
    caches** (low). Rewritten from the changelog's own entries, with the
    Python 3.10 drop and the removed static-type code path it also lists.
13. **"`legacy/blackout-web` with vite"** (low). Its `build` is
    `tsc --build`; vite runs in `build:web`, `dev` and `preview`.
14. **Commit-message sentences the record corrected only partly** (low).
    Listed below.

Found while making these changes:

15. **The review that found the manhole bug was called "the second review"**
    in the Scope paragraph, the manhole section and PATCHES.md, and "the
    first review" in "Not verified", for the same review: the one of the
    first round. All now say the review of the first round.
16. **"Reverting that commit's three fork files"** would not have split the
    manhole fix out cleanly: PATCHES.md changed in later commits, and
    `20362e4` also carries record corrections. The Scope paragraph now says
    which files to return and what to drop.
17. **The 2026-10-31 full-suite log the record called "kept" is gone** from
    the scratch directory (its `v48` folder last changed at 04:20 UTC, after
    the second round). The full-suite bullet and item 14 above say so and
    name the comparison output that is kept.

## Corrected after the third review

The third round (commits `d5fa741`, `ed9c843`) was reviewed under the same
three lenses. Each finding and what changed, in this record, PATCHES.md
(commit `89c1606`), and both ignore files and `security.yml` (commit
`433fc29`, comments and reason strings only); no fork code and no lock file
changed:

1.  **The `mlkem768x25519-sha256` key exchange (#12520) sat in the "Not
    used" row** (low). Under 26.10.0 the manhole's SSH server offers it
    first, and OpenSSH clients use it by default since 10.0; the tests and
    probes, all on Twisted's own client, never negotiated it. It has its own
    row in [What changed](#what-changed-in-the-modules-the-fork-imports),
    with the fourth round's check by an independent client (asyncssh got a
    shell with it under 26.10.0; 26.4.0 does not offer it), and the Result
    bullets and PATCHES.md's behaviour-change bullet name it. Found while
    fixing it: the row's closing clause, "the rest are in modules the fork
    never imports", was false for `dns.Message`'s class attributes,
    `ThreadedResolver`, `_makeGetterFactory` and the socket options, whose
    modules the fork does import; the cell now says which names are unused
    and which modules are never imported.
2.  **The zope.interface summary left out 8.3 and 8.5** (low): exceptions
    in `implementedBy`/`providedBy` no longer swallowed, and `isOrExtends()`
    raising `TypeError` for an unhashable object. The section now gives
    every changelog entry from 6.1 to 8.7, by kind, and says that the
    suite's outcomes are unchanged.
3.  **"Not verified" did not say that the boots ran unlike production**
    (low). Production uses Postgres, Redis and the default
    `['::', '0.0.0.0']`. The fourth round booted on Postgres 16 with Redis
    replication, a metrics listener and the template's HTTP resources under
    both versions, and probed a failed second bind
    ([Validation](#validation), Boot). The default bind addresses and the
    production images' own Postgres stack are "Not verified" items now, and
    the Result bullet that said "No operator-visible change" rests on what
    was run.
4.  **Both ignore files said the images metro would parse were this
    repository's committed assets** (low). `packages/ui` and
    `legacy/blackout-web` track no image; a bundle would parse files on
    disk, such as react-native's five LogBox PNGs. The two files, the OSV
    reasons (which now say "if something did it would parse" beside
    "nothing here runs metro"), the image-size section, "Before merge or
    release" and "Not verified" say so; the last two had "a committed PNG"
    and "this repository's committed assets" too.
5.  **The OSV reasons said the metro update "is planned before
    ignoreUntil"** (low). Nothing schedules it. The reasons and the block
    say "due before ignoreUntil", and "Before merge or release" says that it
    needs queuing.
6.  **Commit `6b6d96e`'s subject says "the seven advisories against
    26.4.0"** (low). OSV and GitHub list eight; see
    [Commit messages](#commit-messages).
7.  **"Two Low advisories in `poetry.lock` that no gate reports" read as
    the whole list** (low). Retitled; the item gives osv-scanner's count, 6
    in 3 packages, with black's four rows and their scores.
8.  **`security.yml` cited "synapse/util/manhole.py's upstream demo RSA
    key"** (low, from #878 on 2026-08-10). That key was removed on
    2026-09-13. The example is now `apps/blackout-server/tests/http/ca.key`
    and `server.key`, which Trivy 0.69.3's secret scanner reports as private
    keys (`--scanners secret` over the fork's `tests/`).
9.  **The third round's account of the second round's mypy runs was
    false** (low). They were not uneven: both were silenced. The fourth
    round reproduced that output with the tree on `PYTHONPATH` and the
    unsilenced figures without it; the Lint bullet gives the even figures
    for the two manhole files (55 errors in 27 files before, 53 in 26
    after, none in either file), and item 7 of the previous list is
    reworded.
10. **"Three lines" was measured on a hashless export** (low). The image's
    hashed export differs in 94 lines. Corrected in [The lock](#the-lock),
    Validation, "Before merge or release", PATCHES.md and the
    [Commit messages](#commit-messages) note.
11. **The first Result bullet said no changed API behaves differently**
    (low). It now says so for a well-behaved peer and names the three
    hardenings and the key exchange.
12. **The Scope paragraph and the manhole heading overstated the bug**
    (low). Both say a manhole listener without a configured key pair now;
    the heading's anchor changed with it, and every link in this record
    follows (no other file linked it).
13. **The instruction for splitting out the manhole fix was incomplete**
    (low). The Scope paragraph now says to remove or reword every sentence
    that relies on the fix and lists where `grep -n -i manhole` finds them.
14. **The `exp:` probe rows did not match what was run** (low). On
    `develop` only the Twisted lines carry `exp:`; the rows now say the
    entries were given the date, which the image-size ids show, and that the
    edited copy was not kept.
15. **"A squash merge would replace the per-commit messages"** (low).
    Replaced in item 3 of the previous list: this repository merges PRs
    with merge commits, which keep them.

## Corrected after the fourth review

The fourth round (commits `433fc29`, `89c1606`, `bf32a2b`) was reviewed under
the same three lenses. Each finding and what changed, in commit `ce1bca9` (fork
code, its tests, the two manhole documentation pages and PATCHES.md), commit
`0f0aa13` (comments in both ignore files and `security.yml`; no entry, id or
date) and this record with its cross-references:

1.  **A default OpenSSH 9.9 client negotiates `mlkem768x25519-sha256` with
    the manhole too, not only 10.0** (low, two lenses). 9.9's default list
    puts two `sntrup761x25519` names first, which Twisted does not implement,
    then `mlkem768x25519-sha256`; Twisted's server takes the first common
    one. Worked out from 9.9p1's `myproposal.h` (tarball sha256 matching the
    release notes) and the server transport `manhole()` builds: 9.9 and 10.0
    lists get `mlkem768x25519-sha256` under 26.10.0 and `curve25519-sha256`
    under 26.4.0. The #12520 row, the Result bullet, PATCHES.md, "Not
    verified" and the Commit messages note say so.
2.  **The #6108 "descriptor left behind" under 26.4.0 was the probe's own
    reference** (low, two lenses). The fourth round's probe kept the last
    `CannotListenError`, whose traceback held the socket. Re-probed with
    each exception dropped (9 descriptors before and after under both
    versions) and with the last one kept (10 under 26.4.0 until dropped).
    The row, the Boot bullet and "Not verified" now say 26.10.0 closes the
    socket before raising and 26.4.0 when the exception is released, which
    in Synapse's `listen_tcp` happens when its `except` block ends.
3.  **The 40 proxy-masked `tests.http` results were listed as never run**
    (low). The third and fourth reviews had run them with the sandbox's own
    proxy values filtered inside the test process; this round did the same
    under both venvs: 37 of the 39 ids pass, and the same two
    `test_proxyagent` tests fail under both versions, needing the lowercase
    variables absent. Validation says how it was run; "Not verified" names
    only those two.
4.  **"The other 104 are the fork's existing ones (…)" read as a complete
    list of causes** (low). It says "for example" now, as the 2026-10-25
    record does, and names further causes trial's messages show. Compared
    id by id, each of the 144 fails with the same exception line under
    26.4.0 and 26.10.0.
5.  **`unix.Port`'s change, which `NEWS.rst` does not mention, and the
    asyncio reactor were not reached by any check** (low). A `unix.Port` row
    now cites this round's boots with a `path:` listener under both
    reactors and both versions, and a paragraph under the table says which
    modules were diffed whole and which `NEWS.rst` entries the table leaves
    out.
6.  **The image-size ranges read as open-ended** (low). Both ignore files
    say "1.2.0 to 2.0.2" and "0.6.3 to 2.0.2".
7.  **GHSA-8pqf was called the one advisory "the scanners can still
    match"** (low). It is the one with no fixed version, and only
    `develop`'s 26.4.0 matches it; the paragraph says what Trivy reports
    there.
8.  **The metro update was called a React Native toolchain refresh** (low).
    The recorded dry run also moves terser, which both vite versions
    resolve, and workbox-build's `@babel/preset-env`, 127 package names in
    all. Both ignore files, the Result bullet, the image-size section and
    "Before merge or release" say so; the last names a narrower route to
    try, not tried here.
9.  **"Listed 2.0.3 as the fix since 2026-09-24"** (low). The date is the
    records' last modification; the Result bullet says that.
10. **`exp:2026-11-30` on the Trivy lines went beyond the approved
    correction, and the Scope paragraph did not say so** (low). It does now,
    with what each gate does on 2026-11-30 whichever way this PR lands, and
    how to drop the suffixes alone. The suffixes stay: they match the
    `ignoreUntil` that `develop`'s `osv-scanner.toml` already carries.
    Trivy's cut-off was also measured off UTC this round (the gate section).
11. **Two PR-triggered gates were not run: Semgrep SAST and Centralized CI
    Parity** (low). Semgrep 1.95.0 with the workflow's rulesets over the
    branch's changed files reports nothing. Of the parity pipeline, the five
    guards ran and pass; its turbo lint, test and build did not run here,
    and Validation says why they cannot differ from `develop`'s. Both are
    the PR's own checks to watch.
12. **The task's cleanup list named the baseline venv** (low, workflow).
    Kept; "Found outside scope" item 2.
13. **`docs/manhole.md` tells operators to set keys the code ignores, and
    the record vouched for it** (medium). Fixed in the page, with a note on
    the old names, in `config_documentation.md`'s fork paragraph and in
    PATCHES.md; upstream `develop`'s page has the same names
    ([The documented key names](#the-documented-key-names)).
14. **"No `ssh_priv_key_path`" shrank the set of configs the crash hit, and
    a listener with only that path set discarded it** (low). The sentences
    say "without a configured key pair (either path unset)", and the code is
    fixed rather than recorded as outside scope: the private key alone is
    used, the public key alone is ignored with a warning that says so, and
    three tests fail without the change
    ([One half configured](#one-half-configured)).
15. **The split instruction's list of reliant sentences was incomplete**
    (low). The Scope paragraph now names every section `grep` finds and the
    sentences that stay true either way.
16. **The table claimed every `NEWS.rst` behaviour change and left out
    #12656** (low). `twistd` is in the "Not used" row; the paragraph under
    the table lists what the table leaves out.
17. **"The repository's `docker-compose.yml` runs that image"** (low). It is
    `infra/single-server-baseline/docker-compose.yml`.
18. **"Changes no fork file" and "whose only fork change is a comment"**
    (low). "No fork code" and "whose only fork code change is a comment".
19. **`security.yml` said scanning vulnerabilities only keeps Trivy from
    "double-reporting" the test-key fixtures** (low). gitleaks scans only
    the commits a push or PR adds, and no recent commit touches the
    fixtures, so Trivy's secret scanner would be their only reporter. The
    comment says so. Checked: gitleaks with `--no-git` on copies of the two
    files reports both as `private-key`, `.gitleaksignore` has no entry for
    them, and Trivy's secret scanner reports both as `private-key` (HIGH)
    in a `git archive` of `0f0aa13`.
20. **Sentences dated 2026-11-02 that are true only from the merge** (low).
    Reworded without the date: `security.yml`, `.trivyignore` (twice),
    `osv-scanner.toml`, the `manhole.py` comment, the test docstring,
    PATCHES.md's pointer, and the cross-references in
    `dependency-advisories-server-desktop-2026-10-30.md` (twice),
    `synapse-dependencies-triage-2026-10-25.md` and
    `dependency-advisories-2026-10-30.md`.
21. **`bf32a2b`'s message overstates the production-shaped boot** (low).
    A bullet in the Commit messages note.

Found while making these changes:

22. **`config_documentation.md` said leaving both key paths unset "is no
    longer a confidentiality problem"** (fork text from 2026-09-13). A host
    key that changes on every restart leaves a client unable to tell a
    restart from an impersonator; the paragraph says that now.
23. **The commit messages of `433fc29`, `89c1606` and `bf32a2b`** carry
    sentences that this round corrects; see the note below.

## Corrected after the fifth review

The fifth round (commits `ce1bca9`, `0f0aa13`, `648c914`) was reviewed, and
its findings reached this round in the task that carried them, without
severities, so none are given here. This round first merged `develop`
(`33d9ef1`, [Method](#method)). Each finding and what changed, in commit
`6c0aab8` (fork code, its tests, the two manhole documentation pages and
PATCHES.md), in commit `16c6b84` (two PATCHES.md sentences on those tests and
on which round made the fixes) and in this record:

1.  **The manhole filed every host key under `ssh-rsa`.** An Ed25519 or ECDSA
    key at `ssh_priv_key_path` started the manhole without a warning, and
    every connection failed with a `KeyError` in Twisted's host-key lookup.
    The key is filed under its own type, each factory has its own dicts, and
    sessions on Ed25519 and on each ECDSA curve are tested, failing before
    the change ([Host keys other than RSA](#host-key-types)). PATCHES.md has
    a bullet for it.
2.  **A public key at `ssh_priv_key_path`, and an `ssh_pub_key_path` that is
    not the private key's public half, were accepted.** Each starts a
    manhole on which no session completes. `synapse/config/server.py`
    refuses them at startup with a `ConfigError` that names the setting and
    the file, and the refusal tests fail before the change. PATCHES.md has a
    bullet for it; `docs/manhole.md` and `config_documentation.md` say so.
3.  **The config manual said the key pair is "used to encrypt the manhole
    traffic".** That is upstream's opening of the bullet. A host key lets a
    client authenticate the server; the keys that encrypt a session come from
    the SSH key exchange. The bullet says so, `docs/manhole.md` says it under
    its `ssh-keygen` line, and PATCHES.md records the change to an upstream
    line.
4.  **The Scope paragraph said its `grep` finds items 15 and 22 of the fourth
    list.** Neither names the manhole or an `ssh_p` setting, so the grep finds
    neither, though both rely on the fixes (15 is about the split instruction
    itself, 22 about the `config_documentation.md` sentence). The paragraph
    now names them apart from the grep's hits, which were mapped again, item
    by item, on this round's text.
5.  **The Semgrep bullet's file count.** It said 116 rules ran on the
    fifteen changed files. Semgrep's summary counts a file it skips: the
    run's own output said one file matched the ignore patterns, and
    `--verbose` names the test module, which semgrep's built-in list leaves
    out (`tests/`; the repository has no `.semgrepignore`). Re-run on
    `0f0aa13`, 14 of the 15 were scanned. The bullet says so, with the sixth
    round's run (15 of 16) and the test module scanned on its own.
6.  **The fifth round's sentences that `ssh_priv_key_path` alone is enough**
    held for an RSA key only (item 1). They hold for RSA, Ed25519 and ECDSA
    keys from `6c0aab8`; PATCHES.md's fourth-round bullet says when that became
    true, and the Result bullet and both documentation pages name the types.

Found while making these changes:

7.  **`ConchFactory`'s two key dicts are class attributes**, shared by every
    factory in a process, and upstream writes into them. Each factory now
    gets its own (item 1).
8.  **The task placed `_getHostKeys` in `twisted/conch/ssh/factory.py`**
    (workflow). It is in `twisted/conch/ssh/transport.py`, in both versions;
    `factory.py` builds the list of offered algorithms. The code comment,
    PATCHES.md and this record cite each where it is.
9.  **The commit messages of `ce1bca9` and `648c914`** carry sentences that
    this round supersedes; see the note below.

## Corrected after the sixth review

The sixth round (commits `33d9ef1`, `6c0aab8`, `16c6b84`, `cd6b0a4`) was
reviewed under two lenses, the manhole's behaviour and the record's claims,
and its findings reached this round in the task that carried them, each
marked low. This round first merged `develop` again (`d972bbd`,
[Method](#method)). Each finding and what changed, in commit `2bf76ad`
(`synapse/config/server.py`, the test module, the two manhole documentation
pages and PATCHES.md) and in this record:

1.  **PATCHES.md's fifth-round `manhole.py` bullet named four tests as
    failing before the fix; five do.** Both lenses found it: the sentence
    before it lists the P-384/P-521 session among the new tests, and the
    bullet named the Ed25519 and P-256 sessions and the two factory tests,
    so a reader took the P-384/P-521 session to pass against the old file.
    It fails there too, with the server's `KeyError: b'ecdsa-sha2-nistp384'`,
    as this record's host-key section said; `16c6b84` corrected the
    `server.py` bullet's test sentence and left this one. The bullet now
    names the five.
2.  **An EC key on a curve Twisted has no SSH name for passed
    `_check_manhole_host_key`.** This record said `server.py` "now refuses
    at startup a key file the manhole could not use" and the check's
    docstring said the same; for a secp256k1 PEM at `ssh_priv_key_path` the
    config loaded and the homeserver stopped in `start_listening` with a
    bare `KeyError: b'secp256k1'`, naming no setting. The check now refuses
    such a key at `ssh_priv_key_path`, or at `ssh_pub_key_path` beside a
    private key (this item said "at either path" until the eighth round),
    with a `ConfigError` naming the file and the curve; two tests, both
    documentation pages and PATCHES.md cover it, and
    a boot of that shape stops with the message
    ([the curve paragraph](#curve-refusal)).
3.  **The record said `buildProtocol` "read[s] the same in the two
    versions".** `_getHostKeys` is byte-identical, and so are
    `buildProtocol`'s host-key lines, but its key-exchange filter line
    differs between 26.4.0 and 26.10.0. The Method bullet now says which
    lines are the same and which one differs.
4.  **The sixth round cited evidence files under `finish/` that did not
    exist.** Its scratch directory, `v52/finish/` under the session's
    scratch directory, was never created, so `finish/logs/mismatch-probe.log`,
    the `manhole-*.log`, `config-*.log` and `runtime-*.log` files,
    `finish/bin/boot.sh` and `finish/boots/boots.txt` named runs whose logs
    were not kept (the sixth review re-derived every result they stood for
    and found each to hold). This round created the directory, ran every
    cited check again from its tree and kept the logs there, so each
    citation now names a file that exists and holds this round's run; where
    a sentence describes the sixth round's own run, it now says so and
    cites nothing.
5.  **The `git grep -i manhole` sentence under-reported the grep's hits.**
    Outside the fork's code, tests and documentation and this record, the
    grep also finds two earlier `docs/security/` records (8 and 2 lines).
    Both are documentation, so "no tracked config enables the manhole"
    stands; the sentence now lists all four files it finds.

Found while making these changes:

6.  **`develop`'s documentation commits arrive unformatted.** Seven of the
    nine files the merge brings in are not as the root prettier config
    would have them (360 added and 324 deleted lines, mostly table
    alignment). The merge keeps them as `develop` has them, and no workflow
    checks formatting ([Method](#method), the seventh round).
7.  **The OSV gate is red on `develop` and on this branch, for a change in
    OSV's data**, not in any tree: lodash 4.18.0 under GHSA-f23m-r3pf-42rh,
    whose range was extended on 2026-11-03, and the minimatch ignore now
    unused after GitHub corrected that advisory's range on 2026-11-04
    ([Found outside scope](#found-outside-scope-not-fixed-here), item 6;
    [Before merge or release](#before-merge-or-release)). (It passes again
    from the eighth round's merge, seventh list, item 12; this item kept the
    present tense until the ninth round, eighth list, item 5.)
8.  **The commit messages of `6c0aab8` and `cd6b0a4`** carry test counts
    this round supersedes; see the note below.

## Corrected after the seventh review

The seventh round (commits `d972bbd`, `2bf76ad`, `0bd19b9`) was reviewed
under two lenses, the manhole's behaviour and the record's claims, and its
findings reached this round in the task that carried them, one marked
medium (item 2) and the rest low. This round first merged `develop` again
(`e66794c`, [Method](#method)). Each finding and what changed, in commit
`57d9d26` (`synapse/config/server.py`, the test module, the two manhole
documentation pages and PATCHES.md) and in this record:

1.  **A DSA host key passed `_check_manhole_host_key`.** The check's
    docstring said it refuses a key "the SSH server could not use", and its
    message that the host key "must be an RSA, Ed25519 or ECDSA P-256,
    P-384 or P-521 key", but `sshType()` calls every DSA key `ssh-dss` and
    nothing refused one. A 2048-bit DSA key in a PEM file, from
    cryptography, whose 2048-bit keys have a 256-bit subgroup order, loaded,
    passed, and failed every key exchange with `OverflowError` while the
    homeserver started without a word; a 1024-bit one served a session, and
    so does a 2048-bit one with a 160-bit subgroup order, which this item
    did not say until the ninth round (eighth list, item 1). The check now
    refuses any DSA key with a `ConfigError` naming the key type and the
    types that work, and its docstring says which reason holds for which
    key (it said "size" until the ninth round); three tests, both
    documentation pages and PATCHES.md cover it,
    and boots of the shape stop with the message ([DSA](#dsa-refusal)).
2.  **The Scope paragraph's map of what the `grep` finds was incomplete
    again** (medium; the third round running). It named neither the
    Method's seventh-round bullet nor the "Corrected after the sixth review"
    list, whose opening sentence and items 1, 2, 4 and 5 hold hits, and it
    left items 3 and 8 of that list out of the sentences that rely on the
    fixes without a hit. The map was redone from the grep's output on this
    round's text, hit by hit, with each hit assigned to the bullet, row,
    paragraph or numbered item that holds it, and now also covers this
    round's additions.
3.  **The record contained a model-vendor string while its Validation
    bullet said no changed file names a model.** The `git grep` sentence
    under [Host keys other than RSA](#host-key-types) named the root
    agent-notes file by its file name. It now refers to that file without
    the name, and the Validation bullet says what was grepped and over
    which diff.
4.  **"The other new tests stop earlier, at the `fromCryptographyKey`
    `AttributeError`" was false of the curve refusals.** Against `develop`
    the two curve refusal tests fail with "the config loaded", as this
    round's two DSA refusals do; the sentence now says so, from this
    round's run of the twenty-three-test module against `27d8c17`.
5.  **The mypy bullet said the two `type: ignore[dict-item]` comments are
    used because `warn_unused_ignores` is on.** `mypy.ini` turns it off for
    `synapse.util.manhole`, so the runs it cited could not show that. The
    bullet now says so, and this round checked the fact itself with the
    option forced on in a scratch copy: no unused ignore.
6.  **"At either path" for the curve refusal.** A key at
    `ssh_pub_key_path` with no private key is not checked: the check
    returns first and `manhole()` ignores the public key with its warning.
    The config manual, PATCHES.md, the curve paragraph and item 2 of the
    sixth list now say "at `ssh_priv_key_path` or at `ssh_pub_key_path`
    beside a private key", and the DSA refusal is described the same way;
    the check's docstring says it too.
7.  **"Fails on every push and pull request" overstated the OSV step's
    triggers.** `security.yml` runs on pushes to `develop`, `master` and
    `main`, on pull requests that touch its `paths:` list, and in the merge
    queue. The bullet under [Before merge or release](#before-merge-or-release)
    now says "every push to `develop` and every pull request that touches a
    path the workflow watches", and it is in the past tense: the lodash
    advisory no longer fails the step after this round's merge (item 12).
8.  **The seventh round's account of `develop`'s fifteen commits** left out
    the habit and participation strategy and two of the places linking to
    the new plans. The Method bullet now names the strategy, the
    differentiation brief and the strategy's own link, as the merge
    commit's message does. (Both still left out the build plan's link to
    the MVP, `8e85b45`; the bullet names it from the ninth round, eighth
    list, item 7.)
9.  **The opening said reviews found "three fork bugs".** It went on to
    list four defects in host-key handling and a documentation one, and it
    left out the sixth review's finding. It now gives no count and names
    every review's finding, the seventh's included.
10. **The `blackout_runtime_tests` bullet said "(not run in the sixth)"**,
    and the seventh round did not run it either. It now says "the sixth,
    seventh or eighth".
11. **PATCHES.md said `_manhole_key_type` is called from
    `ServerConfig.read_config`.** `read_config` calls
    `_check_manhole_host_key`, which calls its helper `_manhole_key_type`;
    the bullet now says so.

Found while making these changes:

12. **The OSV gate passes again, on `develop` and on this branch.** #998
    moved lodash to 4.18.1 (`77e6e68`), and the merge `e66794c` brought it
    here; osv-scanner exits 0 on this branch in three time zones and on
    `develop` in the one it was run in, `TZ=UTC` (the ninth round ran
    `develop`'s in all three, with the same result: eighth list, item 6),
    and still lists the minimatch ignore as unused, which #999, open when this was written,
    removes ([Validation](#validation), OSV;
    [Found outside scope](#found-outside-scope-not-fixed-here), item 6).
13. **The commit messages of `2bf76ad` and `0bd19b9`** carry sentences this
    round supersedes; see the note below.

## Corrected after the eighth review

The eighth round (commits `e66794c`, `57d9d26`, `6f9117b`) was reviewed
under three lenses, the manhole's behaviour, the merge and its gates, and
the record's claims, and its findings reached this round in the task that
carried them, each marked low. `develop` had not moved since the eighth
round's merge, so this round merged nothing ([Method](#method)). Each
finding and what changed, in commit `54043e4` (`synapse/config/server.py`,
the test module, the two manhole documentation pages and PATCHES.md) and in
this record:

1.  **The DSA refusal's stated reason was false for a DSA key larger than
    1024 bits with a 160-bit subgroup order.** Two lenses found it. The
    message said "the SSH server cannot sign with a DSA key larger than
    1024 bits", and the check's docstring ("one larger than 1024 bits
    serves no session"), both documentation pages, PATCHES.md (which also
    said every refused config "but the 1024-bit DSA key" serves no
    session), the test module's docstring and this record (the opening, the
    first Result bullet, the DSA paragraph and its quotation of the message,
    and item 1 of the seventh list) said the same. Twisted's 20-byte
    packing fails on the subgroup order, not on the key's size: a 2048-bit
    key with a 160-bit one, from FIPS 186-2-style parameters, loads, signs
    and serves a full session. The refusal stands, because every ssh-dss
    signature uses SHA-1. The message now gives that reason for every DSA
    key and the subgroup order as the reason the server cannot sign with a
    standard larger one, every place above says the same, and two tests pin
    the line from both sides: such a key is refused with SHA-1 named, and
    handed to `manhole()` directly it gets a session
    ([DSA](#dsa-refusal)). (The line this round drew, a subgroup order
    longer than 160 bits, is not where signing stops either; ninth list,
    item 1.)
2.  **A test helper's docstring said a PEM `DSA PRIVATE KEY` is the one
    format that holds a DSA key larger than 1024 bits and that Twisted
    loads.** Twisted's own OpenSSH serializer, which the module's
    `_write_openssh_dsa_key` already uses, writes a 2048-bit DSA key, and
    Twisted loads it back as a private 2048-bit key; only cryptography
    refuses to write one. The docstring now says so, and that the PEM file
    stands for a key made with `openssl`; the DSA paragraph says the same.
3.  **The record cited OpenSSH 9.9p1 for "the one size `ssh-keygen` writes
    for DSA"**, and a default 9.9p1 build writes no DSA key: its
    `configure.ac` offers `--enable-dsa-keys`, off by default, and its
    `sshkey.c` builds the DSA implementation only under `WITH_DSA`. Read
    again in the same tarball (sha256 `b343fbcd…`). The DSA paragraph now
    says the 1024-bit limit is that of DSA-enabled and older builds.
4.  **The pnpm audit bullet quoted counts the step no longer gives**, "1
    low | 1 moderate (1 ignored) | 2 high (2 ignored)" "in all five
    rounds", when the record had eight, and did not say the later rounds
    had not run it. This round ran both commands on `git archive` copies of
    `54043e4` and of `develop`'s `27d8c17`: exit 0 and "1 low | 2 high (2
    ignored)" on each. The bullet now gives both readings, says why the
    moderate went, and says which rounds ran the commands.
5.  **Item 7 of the sixth list still said the OSV gate "is red"**, after
    the eighth round's merge had made it pass on both sides and every other
    present-tense statement of it had been updated. It now carries a note
    pointing to item 12 of the seventh list.
6.  **Item 12 of the seventh list said osv-scanner exits 0 on both sides
    "in three time zones"**; `develop`'s `27d8c17` was scanned under
    `TZ=UTC` only, and Validation's OSV bullet leaned on the same logs. Both
    now say so. This round scanned `develop` in all three time zones too,
    with the same result, and kept the logs.
7.  **The seventh round's Method bullet still left out one of `develop`'s
    link commits**: `8e85b45` adds a link to the MVP from the field
    operations build plan. The bullet now names the build plan, and item 8
    of the seventh list says it was missing.

Found while making these changes:

8.  **The commit messages of `57d9d26` and `6f9117b`** carry sentences this
    round supersedes; see the note below.

## Corrected after the ninth review

The ninth round (commits `54043e4`, `a5c2b77`) was reviewed, and its
findings reached this round in the task that carried them, under two
lenses, the manhole's behaviour and the record's claims, each marked low.
This round first merged `develop` again (`d673fe6`, [Method](#method)).
Each finding and what changed, in commit `8c74e04` (`synapse/config/server.py`,
the test module, the two manhole documentation pages and PATCHES.md) and in
this record:

1.  **The DSA refusal put the limit of signing at a subgroup order longer
    than 160 bits.** The message said "the SSH server cannot sign at all
    with a DSA key whose subgroup order is longer than 160 bits", and the
    check's docstring, `_manhole_key_type`'s docstring (the 20-byte packing
    "fits only a 160-bit subgroup order"), both documentation pages,
    PATCHES.md (such a key raised `OverflowError` "on every key exchange"),
    the test module's docstring and this record (the opening, the first
    Result bullet, the DSA paragraph and its quotation of the message, and
    the manhole section's Scope paragraph) said the same. `Key.sign` raises only
    when r or s is 2^160 or more, and both are reduced modulo q: on a
    1024-bit key with a 161-bit q, made by hand, it returned a signature
    for 108 of 300 messages under 26.10.0 and 113 under 26.4.0, each valid
    by the review's pure-Python check, and this round's count on the same
    key returned 122 and 100.
    With the 224- or 256-bit q of every standard key larger than 1024 bits
    it fails on every signature in practice. The refusal and its SHA-1
    reason stand, and nothing ordinary makes such a key. The message now
    says the server "cannot in practice sign with a DSA key whose subgroup
    order is 224 or 256 bits, as every standard DSA key larger than 1024
    bits has", every place above says the same,
    `_manhole_key_type`'s docstring gives the 2^160 condition and the case
    of a q just over 160 bits, and the 2048-bit refusal test pins the new
    wording and its key's q of 224 or 256 bits, failing against
    `54043e4`'s message ([DSA](#dsa-refusal)). The eighth list's item 1 and
    the `57d9d26` note under Commit messages, which drew the same line, get
    notes.
2.  **A test helper's docstring credited FIPS 186-2 with h = 2.** It said
    g is 2^((p-1)/q) mod p "as FIPS 186-2's generator procedure starts";
    FIPS 186-2 (Appendix 4, step 3) lets h be any integer with
    1 < h < p - 1, and 2 is the h OpenSSL chose. g itself is right: it
    equals OpenSSL's g for these p and q, checked against the ninth round's
    parameter dump (`finish/r5/logs/dsa-generator-check.txt`). The
    docstring now says g is the generator openssl derived for these p and q
    (h = 2), and that FIPS 186-2 lets h be any integer with 1 < h < p - 1.
3.  **Validation's ninth-round sentence on `tests.config` cited logs that no
    longer held the runs it describes.** It cited
    `finish/r4/logs/config-*.log` for runs on `54043e4`'s clean tree; a
    rerun at 05:20 UTC overwrote those files, and the ones there now hold
    runs from a `git archive` of `54043e4` and, as `config-head-*.log`, on
    `a5c2b77`. The clean-tree results, 103 passing under each venv, are in
    `finish/r4/logs/heavy.log`. The sentence now cites that file and
    `finish/r4/logs/NOTE-config-logs.txt`, and says what the
    `config-*.log` files hold.

Found while making these changes:

4.  **The commit messages of `54043e4` and `a5c2b77`** carry sentences this
    round supersedes; see the note below.
5.  **#999 merged** on 2026-11-08, and this round's merge brought it here,
    so the record's "open when this was written" about it is now history:
    the OSV bullet of [Before merge or release](#before-merge-or-release)
    and items 4 and 6 of
    [Found outside scope](#found-outside-scope-not-fixed-here) get tenth-round
    notes, and Validation's OSV and pnpm audit bullets give this round's
    runs, with no unused-ignore line.

## Corrected after the tenth review

The tenth round (commits `d673fe6`, `8c74e04`, `71fdfce`) was reviewed
under three lenses, the manhole's behaviour, the merge and its gates, and
the record's claims, and its findings reached this round in the task that
carried them: six, two marked high (one merge conflict, found under two
lenses) and four low. This round first merged `develop` again (`4e759b4`,
[Method](#method)). Each finding and what changed, in that merge, in commit
`b1b91e8` (`synapse/config/server.py`, the test module, the two manhole
documentation pages and PATCHES.md), in `0d36d47` (a test docstring and a
reflowed paragraph) and in this record:

1.  **The branch no longer merged cleanly with `develop`.** Two lenses
    found it. #1001 (metro 0.83.8) merged at 06:28:36 UTC as `97756ff`, 18
    minutes after `71fdfce`, and
    `git merge-tree --write-tree HEAD origin/develop` conflicted in
    `.trivyignore`, `osv-scanner.toml` and the 2026-10-30 record, each
    where this branch had rewritten an image-size entry that #1001 deletes; kept, this branch's entries would have been
    unused ignores against a lock with no image-size. The merge `4e759b4`
    takes #1001's removals in all three and keeps this branch's Twisted
    removal ([Method](#method)). Every image-size claim of this record now
    carries an eleventh-round note or is rewritten: the Scope opening, the
    summary table's image-size rows, the third Result bullet, the
    image-size section (now headed "superseded by #1001", with a note at
    its head), the gate's opening paragraph, its rows and its closing
    paragraph, Validation's OSV and pnpm audit bullets, the metro bullet of
    [Before merge or release](#before-merge-or-release), item 3 of [Found
    outside scope](#found-outside-scope-not-fixed-here), the metro bullet
    of [Not verified](#not-verified), the tenth-round Method bullet's
    "#1001 ... had not merged", and the manhole section's Scope paragraph.
    PATCHES.md describes no image-size edit, and the 2026-10-30 record now
    carries `develop`'s "Resolved on 2026-11-02" bullet where this branch
    had its "Corrected by" bullet. This round's scans, on `b1b91e8` and on
    `develop`'s `97756ff`, pass on both sides and find no image-size
    package ([The gate](#the-gate), [Validation](#validation)).
2.  **The metro bullet of Before merge or release said no change for the
    update existed**, while the same round's Method bullet named #1001,
    open since 05:17:59 UTC. The sentence came from the fourth round's
    `bf32a2b` (this item said `648c914`, which only reflowed it: eleventh
    list, item 2) and was false when the tenth round kept it. The bullet and
    item 3 of Found outside scope now say that #1001 was opened at 05:17:59
    UTC and merged at 06:28:36 UTC, and the bullet says the sentence was
    false when the
    tenth round kept it.
3.  **The gate's closing paragraph said Twisted 26.10.0 matches no advisory
    "in any of the four databases"**, written in `648c914` when four had
    been used; the seventh to tenth rounds added rows on a fifth (2026-11-08
    00:37 UTC) without updating it. It now says five and gives their range.
    The claim holds on the fifth, in this round's rows too.
4.  **PATCHES.md said a DSA key with a subgroup order just over 160 bits
    would serve a session "on the key exchanges whose signature fits".**
    The server signs some key exchanges with such a key, but Twisted's
    client refuses its host key, and the review got no session in 30
    connections under each version; and OpenSSL rejects every signature
    `Key.sign` returns with it, valid as each is, because it refuses the
    key's 161-bit subgroup order before it reads a signature (62 and 61 of
    200 under 26.4.0 and 26.10.0 in the twelfth round's check; this item
    gave the eleventh round's 46 and 71, from a check that read r and s from
    the wrong bytes: eleventh list, item 1). PATCHES.md's rationale
    sentence, rewritten in `b1b91e8`, puts such a key with the configs that
    serve no session and says what it said before; the DSA paragraph of
    this record says the same ([DSA](#dsa-refusal)).
5.  **The host-key check ran when no manhole listener was configured**, so a
    homeserver that runs no manhole and has a stale `manhole_settings`
    block, which `develop` runs, stopped at config load, and no document
    said so. From `b1b91e8` the check runs only when the config declares a
    manhole listener for the process it is loaded as (this item said "for a
    process that starts a manhole listener": eleventh list, item 3), four
    tests pin it, both documentation pages and PATCHES.md say so, and the
    first and fourth Result bullets and the opening paragraph name the
    condition ([Only when the config declares a manhole
    listener](#listener-condition)).

Found while making these changes:

6.  **The commit messages of `d673fe6`, `8c74e04` and `71fdfce`** carry
    sentences this round supersedes; see the note below.

## Corrected after the eleventh review

The eleventh round (commits `4e759b4`, `b1b91e8`, `0d36d47`, `c1a12e9`) was
reviewed under the same three lenses. The manhole's behaviour and the merge
lenses found nothing; the claims lens found four, one marked medium and
three low, which reached this round in the task that carried them.
`develop` had not moved from `97756ff`, so this round merges nothing
([Method](#method)). Each finding and what changed, in commit `23ea07c`
(`docs/manhole.md`, the manhole paragraph of `config_documentation.md`,
PATCHES.md, docstrings in `synapse/config/server.py` and the test module,
and the comment over the test's listener constants) and in this record:

1.  **The eleventh round's q161 check read r and s from the wrong bytes**
    (medium). Its `probe/q161_check.py` took r and s from
    `common.getNS(sig)[1]`, the remainder after the signature's first
    string, which still begins with the second string's 4-byte length
    (`00000028`), so OpenSSL was never given the signatures the server
    makes; the same decoding rejects all 200 valid signatures of a
    standard 1024-bit key with a 160-bit q. Its "rejected all 46 and 71"
    was cited by the DSA paragraph, by item 4 of the tenth list and by
    PATCHES.md. This round's check reads them from
    `common.getNS(sig, 2)[1]` and keeps that control: under each version
    the control verifies 200 of 200 that way and none the old way, and the
    q161 key's signatures (62 and 61 of 200) are all valid by a pure-Python
    check and all rejected by OpenSSL 4.0.3 through cryptography 50.0.2,
    because OpenSSL's `dsa_do_verify` refuses a q that is not 160, 224 or
    256 bits before it reads the signature ("bad q value", as
    `openssl dgst -verify` 3.0.13 prints it). The review's own re-run under
    both venvs found the same (70 and 67 signed, all rejected; the control
    200 of 200; `finish/verify-r6-claims/q161-recheck.log`), and this round
    ran its script again (`finish/r7/logs/q161-recheck.log`). The DSA paragraph
    ([DSA](#dsa-refusal)) and item 4 of the tenth list give this round's
    counts, the reason and the logs; PATCHES.md's sentence says that
    OpenSSL refuses such a subgroup order before it reads a signature, that
    every signature the server returned in this round's check was valid,
    and that the eleventh round's wording rested on the broken check; the
    eleventh-round Method bullet says its check was replaced.
2.  **The record named the wrong round and commit for "No change for it
    exists yet"** (low). The metro bullet of [Before merge or
    release](#before-merge-or-release) said the first round wrote it, in
    `648c914`, and item 2 of the tenth list that it came from `648c914`.
    It first appears in `bf32a2b` (2026-11-02 13:58 UTC), the fourth
    round's record commit; `648c914`, the fifth round's, only reflowed it,
    and the first round's commits never had it (`git show` of this file,
    lines joined, at each of the thirteen commits from `6b6d96e` to
    `648c914`). Both now name the fourth round and `bf32a2b`. It was true
    when written: #1001's commit `7e3cc87` is dated 17:09 UTC that day.
3.  **"Only for a process that starts a manhole" was not exact** (low).
    `_starts_manhole_listener` decides from `worker_app` and the listeners
    the config declares, not from what the process starts:
    `synapse.app.admin_cmd`, which starts no listener, loads the
    homeserver's config with no `worker_app`, so it is checked as the main
    process and stops at config load with the manhole `ConfigError` when
    that config has a manhole listener and a key the check refuses. The
    review showed it with `admin_cmd export-data`; this round ran that
    under each version, and also with a worker config naming `admin_cmd`,
    with and without `worker_manhole` ([Only when the config declares a
    manhole listener](#listener-condition)). `docs/manhole.md`, the config
    manual, PATCHES.md, the docstrings of `_starts_manhole_listener`,
    `_check_manhole_host_key` and the test module, the comment over the
    test's listener constants, and this record (the
    opening paragraph, the first and fourth Result bullets, the paragraph
    now headed "Only when the config declares a manhole listener", the
    eleventh-round Method bullet's link and item 5 of the tenth list) now
    say the check runs when the config declares a manhole listener for the
    process it is loaded as, and that `admin_cmd` is checked as the process
    whose config it reads. The code is unchanged; the homeserver refuses
    the same configs.
4.  **PATCHES.md's documentation bullet did not record the eleventh round's
    fork text** in `docs/manhole.md` (its paragraph on when the checks run,
    which ends "A key file that cannot be read stops startup either way.")
    and in the config manual's fork paragraph (its sentence on the same).
    The bullet now does, and records this round's rewording of both.

Found while making these changes:

5.  **The commit messages of `b1b91e8` and `c1a12e9`** carry sentences this
    round supersedes; see the note below.

## Corrected after the twelfth review

The twelfth round (commits `23ea07c` and `13bd9cf`) was reviewed on
2026-11-08; the merge lens found it clean, and the manhole and claims lenses
made four low findings. The thirteenth round answers them in one commit,
which changes `synapse/config/server.py` (one condition and its docstring),
the test module (one more process in the table), `docs/manhole.md` and this
record. On that commit `test_manhole` passes 29 of 29 under both venvs, the
listener test fails without the condition's change (the new empty
`worker_app` case loads with no ConfigError), and ruff, black and isort pass
on both Python files under both venvs.

1.  **A main process with `worker_app: ""` skipped the host-key check.**
    `synapse/app/homeserver.py` refuses to start only for a truthy
    `worker_app`, so `""` starts as the main process and opens its
    `listeners` manhole, but `_starts_manhole_listener` read it as a worker
    name. It now takes any falsy `worker_app` as the main process, and the
    test table has that case.
2.  **`docs/manhole.md` said that before the Twisted change "only an RSA
    host key worked"** and that an Ed25519 or ECDSA key "started without a
    warning". That held only for a key pair; a key set alone stopped the
    homeserver from starting, RSA included. The paragraph now says so.
3.  **The DSA paragraph said the eleventh round's check rejected a control
    key's 200 signatures.** That check had no control; the 200 rejections
    come from the same decoding re-applied in the twelfth round's check.
    The sentence now says that.
4.  **"Docstrings only" for `23ea07c`** left out the comment it rewrote
    over the test's listener constants. The Method bullet, the Lint bullet,
    the eleventh list's opening and its item 3 now name it.

## Commit messages

No commit may be amended, so these sentences stand in the branch's history;
each is superseded as follows.

-   `6b6d96e`: the subject's "the seven advisories against 26.4.0": OSV and
    GitHub list eight against 26.4.0; 26.10.0 fixes the seven that name a
    fix, and GHSA-8pqf-f4m5-798g names none ([its item](#ghsa-8pqf)).
    "have sat in .trivyignore since 2026-10-25 and 2026-10-30":
    three entries were committed on 2026-10-26 01:28 UTC, the fourth on
    2026-10-30 20:34 UTC (Scope). "the one advisory reachable through
    twisted.web behind nginx" (GHSA-q7qq): reachable in principle; the
    2026-10-25 triage judged nginx's header rebuild to block it, unverified
    ([The advisories](#the-advisories)). "the image's --extras all export
    differs by those two lines": three requirement entries for two packages
    in the hashless export, 94 lines in the image's hashed one
    ([The lock](#the-lock)). "No fork source changes": true of that commit;
    `20362e4` changes `manhole.py` and `d5fa741` a comment in
    `send_email.py`. "the manhole sends one shell per channel": written
    before any run of the manhole (the boot check's listener had no key pair
    and could not start); the later probe shows 26.10.0
    refusing a second shell request on one channel
    ([The manhole](#the-manhole-without-a-configured-key-pair-could-not-start)).
-   `03a426e`: "Trivy 0.69.3 with the database of 2026-11-01 19:08 UTC": that
    timestamp was read during the run and not retained ([Method](#method)).
-   `be7bbe2`: "with the database of 2026-11-01": the same. "the image is
    first built on the next main or tag build": no workflow builds the fork
    image; `deploy.sh` does, on the server
    ([Before merge or release](#before-merge-or-release)).
-   `20362e4`: "Found by the second review of the Twisted 26.10.0 change":
    the review of the first round. "mypy (... identical from both venvs)":
    identical because both runs were silenced, the tree being on the
    interpreter's path for each; run evenly, the two files' import graph
    reports 55 errors in 27 files under 26.4.0 and 53 in 26 under 26.10.0,
    none in the two files ([Validation](#validation), mypy).
-   `4089f7f`: the subject's "second review" is that same first-round review,
    which the commit answers; the section it names "Corrected after review"
    is now headed "Corrected after the first review". "the manhole that
    could not start": only a manhole listener without a configured key pair
    could not; the same message's "a homeserver with a manhole listener and
    no configured key died" is the exact statement.
-   `d5fa741`: "the image's --extras all export differs by three lines
    (twisted, twisted[tls] and zope-interface), not two": three requirement
    entries in the hashless export; the image's hashed export differs in 94
    lines ([The lock](#the-lock)).
-   `ed9c843`: "the second round's mypy comparison was uneven: ... the after
    venv's editable install puts the worktree there, so from that venv only
    the named files could report": both second-round runs were silenced, the
    worktree being on the interpreter's path for both, so the comparison
    showed nothing on either side; the third round's own `send_email.py`
    check in the worktree was the uneven one. "the export differs by three
    lines (two packages)": as for `d5fa741`. "the zope.interface 8.7
    changelog is quoted by entry": the third round's list left out the 8.3
    and 8.5 entries; the section now gives every entry from 6.1 to 8.7.
-   `433fc29`: its sentences on `security.yml` are true, but the comment
    they describe kept "so Trivy does not double-report" the fixtures;
    gitleaks scans only new commits, so Trivy's secret scanner would be
    their only reporter (reworded in `0f0aa13`).
-   `89c1606`: "OpenSSH clients use it by default since 10.0, so an
    operator's ssh negotiates it with the manhole now": a default OpenSSH
    client from 9.9 on negotiates it with the manhole (9.9 lists two
    `sntrup761x25519` names first, which Twisted lacks; 10.0 lists it
    first), worked out from their default lists, not run. The fourth
    round's own correction of this bullet said a 9.9 client "offers it",
    which left the 9.9 case open; the default lists settle it.
-   `bf32a2b`: "OpenSSH clients use it by default since 10.0": as for
    `89c1606`. "on a throwaway Postgres 16 with psycopg2 2.9.9 ... and the
    template's HTTP resources": psycopg2-binary 2.9.9 (a wheel with its own
    libpq), where the image builds psycopg2 from source, and the template's
    resources other than `consent`. "a failed second bind raises
    CannotListenError without leaking its socket under 26.10.0": 26.4.0 does
    not leak it either; it closes it when the exception is released (the
    #6108 row). "the split instruction lists every place that relies on the
    fix": it left some out; the Scope paragraph's list replaces it.
-   `ce1bca9`: "Now a configured private key with no public key is the host
    key" and "config_documentation.md's fork paragraph says the private key
    alone is enough": true of an RSA key only until `6c0aab8`
    ([Host keys other than RSA](#host-key-types)).
-   `648c914`: "semgrep 1.95.0 with the workflow's rulesets finds nothing in
    the 15 changed files": it scanned 14 of them; semgrep's built-in ignore
    list skipped the test module, which, scanned on its own in the sixth
    round, has no findings either (Validation, Semgrep). "The split
    instruction for the manhole fixes now names every section that relies on
    them": it also counted items 15 and 22 of the fourth list among the
    grep's hits, which they are not; the Scope paragraph now names them
    apart.
-   `6c0aab8`: "ten new" tests and "all eighteen pass": twelve new and
    twenty from the seventh round's two curve tests, fifteen new and
    twenty-three from the eighth round's three DSA tests, seventeen new and
    twenty-five from the ninth round's two, twenty-one new and twenty-nine
    from the eleventh round's four; "the three refusals": five after
    the seventh round, seven after the eighth, eight after the ninth
    ([Host keys other than RSA](#host-key-types), [DSA](#dsa-refusal)).
-   `cd6b0a4`: "the ten new tests with what fails before the change (eight
    of them, the same under Twisted 26.4.0 and 26.10.0)": twelve, ten of
    them, after the seventh round, and the eighth round's three run against
    its own baseline ([DSA](#dsa-refusal)); "the manhole module 18 of 18":
    true of that tree, twenty after the seventh round, twenty-three after
    the eighth, twenty-five after the ninth and twenty-nine after the
    eleventh.
-   `2bf76ad`: "`_manhole_key_type` now turns that KeyError into a
    ConfigError at the setting whose file holds the key": at
    `ssh_priv_key_path`, or at `ssh_pub_key_path` beside a private key; a
    public key with no private key is not checked
    ([the curve paragraph](#curve-refusal)). "two new (twenty in all)":
    twenty-three since the eighth round, twenty-five since the ninth and
    twenty-nine since the eleventh.
-   `0bd19b9`: "the security workflow's OSV step fails on every pull request
    until develop moves lodash to 4.18.1": on every push to `develop` and
    every pull request that touches a path the workflow watches, and only
    until #998, which moved lodash to 4.18.1 on `develop` and which the
    eighth round merged ([Before merge or release](#before-merge-or-release)).
-   `57d9d26`: "which fits only a 160-bit subgroup order, as in a 1024-bit
    key, so a 2048-bit DSA key in a PEM DSA PRIVATE KEY file loaded, passed
    the config, and the server raised OverflowError on every key exchange":
    true in practice of a 2048-bit key with a 224- or 256-bit subgroup
    order, as every standard one and every one cryptography or `openssl`'s
    defaults make has (not of every order longer than 160 bits: one just
    over it signs some times, ninth list, item 1); a 2048-bit key with a
    160-bit subgroup order signs and serves a session, and is refused for
    SHA-1 ([DSA](#dsa-refusal)). "(the size ssh-keygen
    wrote)": in builds that write DSA at all, which a default OpenSSH 9.9p1
    build does not. "three new (twenty-three in all)": twenty-five since the
    ninth round and twenty-nine since the eleventh.
-   `6f9117b`: "a 2048-bit one then failing every key exchange with
    OverflowError": as for `57d9d26`. "osv-scanner exits 0 again on this
    branch and on develop, in three time zones": `develop` was scanned under
    `TZ=UTC` only in that round; the ninth round scanned it in all three.
    "the manhole module 23 of 23" and "tests.blackout_runtime 74": 25 and 76
    since the ninth round, 29 and 80 since the eleventh.
-   `54043e4`: "the SSH server cannot sign at all with a DSA key whose
    subgroup order is longer than 160 bits" (the message it quotes) and "so
    it fails on the subgroup order q": `Key.sign` fails when r or s is
    2^160 or more, which with a 224- or 256-bit q is every signature in
    practice and with a q just over 160 bits some of them; the message names
    the 224- and 256-bit orders from `8c74e04` (ninth list, item 1). "The
    existing 2048-bit refusal test now also pins that its key's q is longer
    than 160 bits": 224 or 256 bits since the tenth round.
-   `a5c2b77`: "they give the subgroup order as the limit": as for
    `54043e4`. "tests.config 103 ... under both Twisted versions on
    54043e4's clean tree": true, but the logs the record cited for those
    runs were overwritten; `finish/r4/logs/heavy.log` keeps their results
    (ninth list, item 3).
-   `d673fe6` (the tenth round's merge): "#1001 has not merged, so this
    branch's image-size reasons stay": #1001 merged at 06:28:36 UTC, and the
    eleventh round's merge `4e759b4` removed those reasons with the entries
    ([image-size](#image-size-superseded-by-1001)).
-   `8c74e04`: "with the change all 25 pass under both": true of that tree;
    29 since the eleventh round.
-   `71fdfce`: "the manhole module 25 of 25 and tests.config 103 and
    tests.blackout_runtime 76": 25, 103 and 76 on that tree; 29, 103 and 80
    since the eleventh round. "pnpm audit '1 low | 2 high (2 ignored)' on
    both sides": true then; "1 low" on both since #1001 took image-size out
    of the lock (Validation, pnpm audit). The record it commits kept the
    metro bullet's "No change for it exists yet" and said #1001 had not
    merged; both have eleventh-round notes (tenth list, items 1 and 2).
-   `b1b91e8`: the subject's "runs only for a process that starts a manhole"
    and the body's "The sentence now says the check runs only for a process
    that starts a manhole": it runs when the config declares a manhole
    listener for the process it is loaded as, `synapse.app.admin_cmd`,
    which starts none, included (eleventh list, item 3). "OpenSSL 4.0.3,
    through cryptography 50.0.2, rejected all 46 and 71 of the signatures
    Key.sign returned": that check read r and s from the wrong bytes; read
    correctly, OpenSSL rejects every one (62 and 61 of 200 in the twelfth
    round) because it refuses the 161-bit q, and each is valid (eleventh
    list, item 1).
-   `c1a12e9`: "OpenSSL 4.0.3 (cryptography 50.0.2) rejected all 46 and 71
    of the 200 signatures": as for `b1b91e8`. The paragraph it names, "Only
    for a process that starts a manhole", is now headed "Only when the
    config declares a manhole listener" (eleventh list, item 3).
