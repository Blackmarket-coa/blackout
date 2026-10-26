# Synapse upstream advisories triage — 2026-10-25

Second pass over upstream Synapse security fixes against this **1.98.0**-based
fork (`apps/blackout-server/pyproject.toml`: `version = "1.98.0+blackout.1"`).
The [2026-10-09 pass](upstream-advisory-triage-2026-10-09.md) classified every
advisory then in the ledger. This pass looks at what reached upstream since the
releases that pass diffed, including security fixes that never got an advisory,
and at the one repair that pass's GHSA-v56r port left undone. Every statement
below cites where it was checked; where something could not be verified, that
is stated.

Ledger: [`docs/operations/UPSTREAM_ADVISORIES.md`](../operations/UPSTREAM_ADVISORIES.md).
Fork delta record: [`apps/blackout-server/PATCHES.md`](../../apps/blackout-server/PATCHES.md)
(section "2026-10-25 upstream security fix ports (second pass)").

**Result:** four upstream fixes apply to this tree and all four are ported,
each with a regression test that fails on the unmodified tree and passes here
(commits `118dbfda`, `acb0920b`, `eef5f57b`, `f8b8b076`). One of them carries
a CVE (CVE-2026-24044, the banned ESS Community signing key); the other three
are security-relevant fixes upstream shipped without an advisory. OSV lists no
Synapse advisory against 1.98.0 that the ledger does not already hold. The
full trial suite has exactly the same failing tests before and after; the six
new tests are the only difference.

---

## Method

**Our base version.** As established on 2026-10-09, every upstream fix after
1.98.0 is absent from this tree unless shown otherwise. Each file touched here
was read on the unmodified tree (`git archive HEAD:apps/blackout-server` at
`3c19d0e327`, the merge of #976) before editing, and the four regression tests
were run against that snapshot.

**What upstream changed.** A clone of `element-hq/synapse`, `develop` at
`8d60450b3` ("Merge branch 'release-v1.164' into develop"), read with `git`;
none of its code was run. `CHANGES.md` gave the release and PR for each fix,
and the PR's merge commit gave the code and tests. The ported code was diffed
against upstream's current source after the port: apart from `typing.List` /
`Optional` / `Tuple` spellings for Python 3.8, black's line-wrapping, and this
tree's `_process_json` name, the blocks are identical.

**Advisory text.** OSV (`api.osv.dev/v1/vulns/CVE-2026-24044`) for the one
advisory, and `api.osv.dev` queried for `matrix-synapse` 1.98.0 for the
baseline. The GitHub advisory pages and the repository advisories API were not
reachable from this session (the session's GitHub access is scoped to its own
repositories and answered HTTP 403); nothing here depends on them.

**Proving each port.** Each fix comes with a regression test, upstream's where
one exists (three of four) or a new one (the OIDC cookie). The six tests were
copied into the unmodified snapshot and run there: four error because the
code they exercise does not exist (`BANNED_SERVER_SIGNING_KEYS`,
`fixup_max_depth_cap_bg_update`) and two fail on the behaviour (the
appservice receives `@local_user:test`'s private read receipt; the
`oidc_session_no_samesite` cookie has no `Secure` attribute). On this branch
all six pass.

---

## Summary table

| Fix | Upstream release (date), PR | Advisory | Outcome here |
| --- | --- | --- | --- |
| Banned ESS Community server signing key | 1.147.1 (2026-02-12), #19459, commit `be362429d` | CVE-2026-24044 / GHSA-qwcj-h6m8-vp6q (ESS Helm), ELEMENTSEC-2025-1670; CVSS 4.0 `AV:N/AC:H/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H` | **Ported** (`118dbfda`) |
| Private read receipts leaked to application services | 1.161.0 (2026-09-15), #20114, commit `470b94189` | none | **Ported** (`acb0920b`) |
| `oidc_session_no_samesite` cookie not `Secure` | 1.142.0 (2025-11-11), #19079, commit `2f65b9e00` | none | **Ported** (`eef5f57b`) |
| `topological_ordering` repair after GHSA-v56r-hwv5-mxg6 | 1.130.0 (2025-05-20), #18447, commit `67920c0ac` | follow-up to GHSA-v56r-hwv5-mxg6 | **Ported** (`f8b8b076`) |

The CVSS vector is OSV's; it carries no numeric score there.

---

## Deployment context

The 2026-10-09 doc records that both production homeserver templates
(`deploy/docker/blackout-backend/synapse/homeserver.yaml.template`,
`infra/single-server-baseline/synapse/homeserver.yaml.template`) federate
openly. Relevant here in addition:

- Both serve over HTTPS (`public_baseurl` is `https://`), so a `Secure`
  cookie attribute is honoured rather than breaking login.
- Classic `oidc_providers` is configured only in the infra baseline (line
  114); the Docker template has no OIDC configuration.
- The Docker template registers application services
  (`app_service_config_files`). The deaddrop registration
  (`deploy/matrix-appservice/registration.yaml`) sets
  `de.sorunome.msc2409.push_ephemeral: false`, so it never received
  receipts; any appservice that opts in would have.
- Neither template comes from the ESS Community Helm chart; `signing_key_path`
  points at a key file of our own. The banned-key exposure for us is remote
  servers that deployed with the weak key, not our own identity.

---

## Ported

Every item below is a direct edit outside `blackout_runtime/` and is listed in
`PATCHES.md`.

### CVE-2026-24044: requests and events signed with the ESS Community key

- **What:** The ESS Community Helm chart's secrets hook (matrix-tools before
  0.5.7) generated Synapse server signing keys with an insecure method
  (CWE-336). An attacker can recreate the key pair of a deployment that used
  it and then impersonate that server on federation: forge requests and
  events as it, in every room it is in. Upstream's mitigation in Synapse is to
  refuse the one known compromised key outright, on request authentication
  and on event signature verification.
- **Upstream:** 1.147.1, #19459 (`be362429d`). `BANNED_SERVER_SIGNING_KEYS`
  holds `l/O9hxMVKB6Lg+3Hqf0FQQZhVESQcMzbPN1Cz2nM3og=`.
- **Our tree:** `synapse/crypto/keyring.py` had no notion of a banned key
  (zero matches for `banned`); any key a server published was used once
  fetched.
- **Outcome:** ported. The check sits in `Keyring.process_request`, where
  each fetched key is about to be used: a banned key raises `SynapseError(401,
  ..., M_UNAUTHORIZED)`. `verify_json_for_server` (request auth) and
  `_check_sigs_and_hash` (events) both go through it. Upstream's two tests are
  ported: `tests/crypto/test_keyring.py`
  `test_verify_json_for_server_using_banned_key` and the new
  `tests/federation/test_federation_base.py`. Upstream's `patch.object` passes
  the key as a bare string and relies on substring `in`; the tests here pass a
  1-tuple, the shape the constant has. Both error on the unmodified tree.
- **Source:** OSV; upstream `CHANGES.md` 1.147.1; commit `be362429d`.

### Private read receipts of other users sent to application services

- **What:** With MSC2409 an appservice can opt in to ephemeral events.
  `ReceiptEventSource.get_new_events_as` filtered the receipts it handed over
  by room only, so an opted-in appservice received every user's
  `m.read.private` receipts. Private read receipts exist so a user's reading
  position is not disclosed; this disclosed it to the appservice operator.
  The spec requires private receipts to be sent only for users in the
  appservice's namespaces.
- **Upstream:** 1.161.0, #20114 (`470b94189`), labelled a long-standing bug.
- **Our tree:** `synapse/handlers/receipts.py` `get_new_events_as` returned
  the room's receipt events unfiltered by user. The ported test shows it: on
  the unmodified tree the appservice receives `@local_user:test`'s
  `m.read.private`.
- **Outcome:** ported. `filter_out_private_receipts` (the `/sync` path) now
  delegates to `_filter_private_receipts(rooms, is_visible)`, and
  `get_new_events_as` applies it with `service.is_interested_in_user`. Public
  receipts are unchanged. Upstream's test is ported unchanged.
- **Source:** upstream `CHANGES.md` 1.161.0; commit `470b94189`;
  `deploy/matrix-appservice/registration.yaml` for our appservice's opt-out.

### OIDC session cookie without `Secure`

- **What:** Synapse sets two cookies carrying the OIDC session macaroon
  (`state`, `nonce`, `code_verifier`, `client_redirect_url`): `oidc_session`
  with `SameSite=None` for cross-site callbacks, and
  `oidc_session_no_samesite` for browsers that mishandle `SameSite=None`.
  Only the first was `Secure`. A browser therefore also sent the second over
  plain HTTP to the host, where a network attacker (or an HTTP hop behind a
  misconfigured proxy) could read the in-flight login state.
- **Upstream:** 1.142.0, #19079 (`2f65b9e00`).
- **Our tree:** `synapse/handlers/oidc.py` `_SESSION_COOKIES` had
  `(b"oidc_session_no_samesite", b"HttpOnly")`.
- **Outcome:** ported; both cookies are `HttpOnly; Secure` and differ only in
  `SameSite=None`. Upstream shipped no test;
  `test_redirect_request_session_cookies_are_secure` is new and asserts the
  attributes of both cookies from a real `handle_redirect_request` call. It
  fails on the unmodified tree. The OIDC tests need the package metadata to be
  installed (`check_requirements("oidc")` reads it); run from a bare source
  tree they error with "Synapse source does not provide the feature 'oidc'",
  which is a test-environment problem, not a product one.
- **Source:** upstream `CHANGES.md` 1.142.0; commit `2f65b9e00`.

### Repair of `topological_ordering` in rooms hit by GHSA-v56r-hwv5-mxg6

- **What:** GHSA-v56r-hwv5-mxg6 (exploited in the wild) let a remote server
  insert events with an out-of-range `depth`. Synapse stores `depth` as
  `topological_ordering`, so those events sort after every message that
  follows, and `/messages` in an affected room is out of order for good.
  Capping new events, which the 2026-10-09 port does, leaves the stored rows
  as they were. Upstream added a one-off background update that caps the
  stored value at `MAX_DEPTH` in room versions with strict canonical JSON.
- **Upstream:** 1.130.0, #18447 (`67920c0ac`): `fixup_max_depth_cap`,
  scheduled by `delta/92/05` (ordering 9205).
- **Our tree:** commit `024f957` (2026-10-09) sets `MAX_DEPTH` to the
  canonical-JSON limit and drops bad PDUs, and nothing repairs rows persisted
  before it. This server federates openly and the advisory was exploited in
  the wild, so such rows are plausible.
- **Outcome:** ported into `synapse/storage/databases/main/events_bg_updates.py`,
  scheduled by `delta/84/04_fixup_max_depth_cap.sql` (ordering 8404; this tree
  is at `SCHEMA_VERSION = 84`, and 8404 was unused). The update walks `rooms`
  in batches and updates `events` for the rooms whose version has
  `strict_canonicaljson`. Upstream's `TestFixupMaxDepthCapBgUpdate` is ported;
  its last assertion builds the expected dict explicitly because this tree's
  `simple_select_list` is typed as a list of tuples. Both tests error on the
  unmodified tree. SQLite only; the SQL uses `make_in_list_sql_clause`, which
  handles both engines, but Postgres was not exercised.
- **Source:** upstream `CHANGES.md` 1.130.0; commit `67920c0ac`.

---

## Checked and left alone

- **OSV baseline.** `api.osv.dev` for `matrix-synapse` 1.98.0 returns 20
  records, which are 10 distinct advisories: GHSA-3h7q-rfh9-xm4v,
  GHSA-4mhg-xv73-xq2x, GHSA-6qf2-7x63-mm6v, GHSA-8q93-326v-3m7g,
  GHSA-f3r3-h2mq-hx2h, GHSA-fh66-fcv5-jjfr, GHSA-gjgr-7834-rhxr,
  GHSA-rfq8-j7rh-8hf2, GHSA-v56r-hwv5-mxg6, GHSA-vp6v-whfm-rv3g (each also
  under its PYSEC alias). All ten are in the ledger with a 2026-10-09
  classification. OSV has no record for GHSA-fp53-rw9v-hcf9 and the other
  2026-07-28 advisories, as the previous pass found.
- **GHSA-gjgr-7834-rhxr** (authenticated media) is still applicable and still
  not ported: `enable_authenticated_media` and `/_matrix/client/v1/media` have
  zero matches in `synapse/`. Unchanged from 2026-10-09.
- **Upstream security entries newer than 1.157.2** are all dependency bumps,
  which belong to the dependency passes, not this one: Pillow 13.0.0
  (1.163.2; done in `synapse-dependencies-triage-2026-10-24.md`), certifi
  2026.10.19 for GHSA-6q48-6c7w-9gw2 (1.163.1; recorded there under "Open
  items", Critical, lock still at 2023.7.22), cryptography 50.0.1 for
  CVE-2026-69247/69248/69249 (1.163.0; upstream says none affected Synapse),
  and the Rust crates below.
- **Rust crates (1.160.0, #20131).** `apps/blackout-server/Cargo.lock` has no
  `rustls-webpki`, so GHSA-82j2-j2ch-gfr8 does not apply. It has `pyo3 0.20.0`,
  which is below the 0.29.0 fix for GHSA-36hh-v3qg-5jq4 (out-of-bounds read in
  `nth`/`nth_back` on list and tuple iterators) and GHSA-chgr-c6px-7xpp
  (missing `Sync` bound on `PyCFunction::new_closure`). Whether the fork's
  Rust code reaches those paths was not analysed here, and the 2026-10-09
  pass already found that the `synapse/synapse_rust/` Python shim takes import
  precedence over the compiled extension, so it is unclear the Rust code runs
  in production at all. Follow-up, not a port.

---

## Tests run

Environment: Python 3.11 venv built from `poetry.lock` with `poetry export
--extras all --with dev` under poetry 1.3.2 (the version `docker/Dockerfile`
installs) and `pip install --no-deps --require-hashes`, leaving out
`psycopg2`, `psycopg2cffi(-compat)` and `pyicu`. Twisted 23.10.0, pydantic
2.5.2, Pillow 13.0.0, SQLite. The tree was installed editable for its package
metadata so that extras such as `oidc` resolve. Tests run in-tree with
`PYTHONPATH=. python -m twisted.trial -j4 tests`. Nothing ran against
Postgres. No CI workflow in this repo runs the Synapse trial suite (the only
"trial" in `.github/workflows/` is gitleaks' trial period), so CI will not
re-check any of this.

| Run | Unmodified tree (`3c19d0e327`) | This branch (`f8b8b076`) |
| --- | --- | --- |
| Full suite | 3343 tests: 3028 pass, 110 failures, 49 errors, 173 skips | 3349 tests: 3034 pass, 110 failures, 49 errors, 173 skips |
| Failing test IDs | 142 distinct | the same 142; 0 new, 0 fixed |
| The six new tests | 4 error, 2 fail (see Method) | 6 pass |
| Touched modules (11 modules, 147 tests) | — | 147 pass |

Lint on the nine changed files with the locked tools: black 23.10.1, isort
5.13.1 and ruff 0.1.7 clean; mypy 1.5.1 reports the same 25 pre-existing
errors in 14 other files before and after, none in a changed file.

The pre-existing failures are the ones the 2026-10-09 doc lists (room purge
`invalidate_all`, `RoomInitialSyncRestServlet._hs`, the push-rule evaluator
shim, `test_sync` `KeyError: 'ALICE_DEVICE'`); none is touched by this pass.

---

## Licensing note

As on 2026-10-09: everything ported here comes from post-1.98 upstream
releases and is Element's AGPL-3.0-or-later code. The two new test files keep
upstream's AGPL header. The commercial-licence question raised there is
unchanged and is for the maintainer and counsel.

## Follow-ups

1. `BANNED_SERVER_SIGNING_KEYS` is a list upstream extends when another key is
   burned. With upstream merges not automatable, each upstream release's
   `CHANGES.md` has to be checked for additions and the tuple updated by hand.
2. pyo3 0.20.0 against GHSA-36hh-v3qg-5jq4 / GHSA-chgr-c6px-7xpp, together
   with the open question of whether the compiled extension or the
   `synapse/synapse_rust/` shim runs in production (2026-10-09 follow-up 6).
3. Run `fixup_max_depth_cap` once on a Postgres copy before relying on it
   there; the test coverage here is SQLite only.
4. Still open from 2026-10-09, re-checked today: GHSA-gjgr-7834-rhxr (MSC3916
   or re-baseline), no CI job runs the trial suite, the inert
   `apps/blackout-client/.github` and `apps/blackout-server/.github`
   directories are still present, and the pre-existing test failures remain.
