# Upstream advisory triage — 2026-10-09

One triage pass over the 24 upstream advisories (22 Synapse, 2 Cinny) that the
advisory aggregation bot has been re-filing daily since 2026-09-06. Every
advisory is classified against the code actually in this tree, and every
classification cites where it was checked. Nothing here is a guess. Where
something could not be verified, that is stated.

Ledger: [`docs/operations/UPSTREAM_ADVISORIES.md`](../operations/UPSTREAM_ADVISORIES.md).
Fork delta record: [`apps/blackout-server/PATCHES.md`](../../apps/blackout-server/PATCHES.md)
(section "2026-10-09 upstream security advisory ports").

**Result:** 20 of the 22 Synapse advisories applied to this tree, and 19 of
those are now ported. One applies and is **not** ported (GHSA-gjgr-7834-rhxr,
authenticated media), with the reason below. 2 Synapse advisories do not apply
(Sliding Sync is absent). Both Cinny advisories do not apply to what runs here: one fix was
already present, and the other affects a workflow file GitHub never executes.

---

## Why there were 34 PRs

The bot (`.github/workflows/upstream-advisories.yml` running
`tools/ci/fetch-upstream-advisories.mjs`) deduplicates against the IDs already
in `UPSTREAM_ADVISORIES.md` **on `develop`**. Its PRs only ever added rows marked
`needs-review` and none was merged, so each daily run found the same 24 IDs
missing and opened another PR. Checked via the API: all 34 open PRs touch only
`docs/operations/UPSTREAM_ADVISORIES.md` and add the same 24 IDs.

| Superseded PRs (all open, base `develop`, branch `security/upstream-advisories-YYYYMMDD`) |
| --- |
| #895 #897 #899 #902 #906 #908 #909 #910 #912 #913 #915 #916 #917 #918 #920 #922 #923 #926 #927 #928 #931 #933 #934 #935 #936 #939 #940 #941 #943 #944 #946 #950 #951 #952 |

This PR adds the same 24 rows to the table, with their real classification,
the date in the first column and the ID in the third. Those columns are what
`parseExistingIds` matches. Once it merges, the bot finds every ID present and
stops re-filing them. Closing the 34 PRs is left to the maintainer.

---

## Method

**Our base version.** `apps/blackout-server/pyproject.toml` says
`version = "1.98.0+blackout.1"`, and `CHANGES.md` tops out at Synapse 1.98.0
(2023-12-12). I diffed `synapse/` against the PyPI 1.98.0 sdist: 192 files
differ, but in every file these advisories touch, the difference is
Blackout-specific code or comment rewording, not an upstream fix. So every
upstream fix after 1.98.0 was absent unless shown otherwise.

**What upstream changed.** For each advisory I diffed the last vulnerable
and the first fixed `matrix-synapse` sdists from PyPI. Each archive was
fetched with `curl`, checked against PyPI's sha256, and extracted into its own
directory; none of its code was run. Pairs: 1.105.0→1.105.1,
1.109.0→1.110.0, 1.111.0→1.112.0, 1.120.0→1.120.2 (1.120.1 was not published
to PyPI; 1.120.2 is "functionally identical"), 1.127.0→1.127.1,
1.138.2→1.138.4, 1.152.0→1.152.1, 1.157.1→1.157.2.

**Advisory text.** OSV (`api.osv.dev`) for the 13 it has. The 11
2026-07-28 Synapse advisories and Cinny GHSA-mxfq-g77w-7668 are not in OSV;
their text came from the GitHub advisory pages via WebFetch, which returns a
model summary rather than verbatim text. IDs and severities were cross-checked
against Synapse 1.157.2's `CHANGES.md`. The summaries also gave CVE numbers
for the July batch, but NVD has no record of them, so they are left out.

**Cinny.** `raw.githubusercontent.com` served the `v4.10.2` and `v4.10.3`
sources of every file the fix touched. The commit list came from the compare
page (WebFetch).

**Proving each port.** Each fix comes with its regression test, either
upstream's (adapted to this tree's 1.98 test harness) or a new one where
upstream shipped none. Every regression test was also run against an
unmodified checkout of `develop` (`f42b1a9`) to confirm it **fails** there.
A test that passes both before and after a fix proves nothing. That happened
once (GHSA-8q93, below), and a test that does fail before the fix was added.

---

## Summary table

| Advisory | Upstream sev. | Fixed upstream in | Outcome here |
| --- | --- | --- | --- |
| GHSA-3h7q-rfh9-xm4v | High | 1.105.1 | **Ported** |
| GHSA-4mhg-xv73-xq2x | — | 1.110.0 / 1.112.0 (advisory says 1.106) | **Ported** |
| GHSA-gjgr-7834-rhxr | — | 1.106–1.120 (feature) | **Applicable, not ported** |
| GHSA-rfq8-j7rh-8hf2 | — | 1.120.1 | **Ported** |
| GHSA-f3r3-h2mq-hx2h | — | 1.120.1 | **Ported** |
| GHSA-vp6v-whfm-rv3g | — | 1.120.1 | **Ported** |
| GHSA-56w4-5538-8v8h | — | 1.120.1 | Not applicable |
| GHSA-v56r-hwv5-mxg6 | High | 1.127.1 | **Ported** |
| GHSA-fh66-fcv5-jjfr | — | 1.138.3 / 1.138.4 | **Ported** |
| GHSA-8q93-326v-3m7g | — | 1.152.1 | **Ported** (see note) |
| GHSA-6qf2-7x63-mm6v | — | 1.152.1 | **Ported** |
| GHSA-fp53-rw9v-hcf9 | High | 1.157.2 | **Ported** |
| GHSA-rgv2-84w7-5j9p | High | 1.157.2 | **Ported** |
| GHSA-27p5-4f45-gx76 | High | 1.157.2 | **Ported** |
| GHSA-95fh-hv8c-chvq | High | 1.157.2 | **Ported** |
| GHSA-cjh7-rcpx-xpf8 | High | 1.157.2 | **Ported** |
| GHSA-6wjm-9p2x-gvpm | High | 1.157.2 | **Ported** |
| GHSA-qcjr-46gf-7f4r | Moderate | 1.157.2 | **Ported** |
| GHSA-r66v-qhwx-8rg4 | Moderate | 1.157.2 | **Ported** |
| GHSA-jhcg-5392-5mjw | Moderate | 1.157.2 | Not applicable |
| GHSA-vh4c-pqh4-w3wq | Low | 1.157.2 | **Ported** |
| GHSA-hgcg-p9gx-fq5f | Low | 1.157.2 | **Ported** |
| GHSA-j944-w549-3453 (Cinny) | High | 4.10.3 | Not affected: fix already present |
| GHSA-mxfq-g77w-7668 (Cinny) | High | none listed | Not applicable: workflow never runs |

"—" means the source I used gives no severity. The ones that do come from
Synapse's changelog (1.157.2), OSV, or the advisory page.

---

## Deployment context that raises the stakes

Both production homeserver templates
(`deploy/docker/blackout-backend/synapse/homeserver.yaml.template`,
`infra/single-server-baseline/synapse/homeserver.yaml.template`) expose the
`federation` listener with no `federation_domain_whitelist` (open
federation), and set `max_upload_size: 100M`, twice upstream's default. The
infra baseline sets `dynamic_thumbnails: true`. Every "servers that do not
federate are not affected" escape hatch in the advisories below is therefore
closed for us, and the multipart and thumbnailing advisories hit exactly the
configuration they warn about.

---

## Ported

Every item below is a direct edit outside `blackout_runtime/` and is listed
in `PATCHES.md`.

### GHSA-v56r-hwv5-mxg6: federation DoS via out-of-range `depth` (exploited in the wild)

- **What:** A remote server sends an event whose `depth` is beyond the
  canonical-JSON integer range (2^53−1). Synapse accepted and stored it in room
  versions without strict canonical JSON, and then included it in outgoing
  transactions. Peers that enforce the range reject those transactions, so
  federation to them stalls.
- **Upstream:** affected < 1.127.1, fixed 1.127.1 (commit `2277df2a` per OSV).
- **Our tree (develop):** `synapse/api/constants.py:27` `MAX_DEPTH = 2**63 - 1`;
  `synapse/federation/federation_server.py:467` parses every PDU in a
  transaction with no per-PDU error handling; `synapse/federation/units.py:100`
  forwards `self.pdus` unfiltered; `synapse/events/validator.py:204` only
  validates `event.content`. Checked directly: `event_from_pdu_json` on
  `develop` accepts `depth = 2**60` in a v1 room, and `Transaction.get_dict()`
  forwards it.
- **Outcome:** ported. `MAX_DEPTH` is now the canonical-JSON limit, bad PDUs
  are dropped inbound and outbound, and the validator checks the whole PDU.
  Upstream shipped no test; `tests/federation/test_pdu_depth_advisory.py` is new.
  One assumption was wrong and the test caught it: `canonicaljson` 2.0
  *does* encode the oversized integer. The breakage is on the receiving side,
  not a local encoding error, and the test asserts that instead.
- **Source:** OSV; sdist diff 1.127.0→1.127.1.

### GHSA-3h7q-rfh9-xm4v: auth chain cover index DoS

- **What:** A remote room member could craft events so that Synapse wrote the
  *transitive closure* of auth-chain links into `event_auth_chain_links`. That
  costs high CPU and a fast-growing database.
- **Upstream:** affected < 1.105.1, fixed 1.105.1 (`55b0aa84`). The fix
  relies on the 1.105.0 read path, which traverses links instead of assuming
  the closure is stored.
- **Our tree:** `synapse/storage/databases/main/events.py:833` ("Step 2b, add
  a link to chains reachable from the auth event") and `:2462`
  (`get_links_between`). The read side in `event_federation.py` did one-hop
  lookups.
- **Outcome:** ported both halves (1.98.0→1.105.0 read side, 1.105.0→1.105.1
  write side) plus upstream's three `delta/84/` files under their upstream
  names. Upstream's 1.105.1 tests in `tests/storage/test_event_chain.py`: 4 fail
  on develop, all pass here.
- **Rollback hazard (not in upstream's form):** upstream raised
  `SCHEMA_COMPAT_VERSION` to 84 so that pre-fix code refuses to run on a
  database written without transitive links. This tree already used schema 84
  for its monetization delta, so that guard cannot work here and was not made.
  **Do not roll a server back past this change once it has persisted events.**
  The old read path would compute incomplete auth chains. Recorded in
  `PATCHES.md`.
- **Source:** OSV; sdist diffs 1.105.0→1.105.1 and (read side) our tree vs 1.105.0.

### GHSA-rfq8-j7rh-8hf2 + GHSA-6wjm-9p2x-gvpm: `multipart/form-data` memory exhaustion (and its case-change bypass)

- **What:** Twisted buffers a whole `multipart/form-data` POST body in
  memory, so an unauthenticated request could exhaust memory. Upstream's first
  fix compared the content type case-sensitively, and `Multipart/Form-Data`
  bypassed it.
- **Upstream:** first fixed in 1.120.1; the bypass fixed in 1.157.2.
- **Our tree:** no `requestReceived` override on `SynapseRequest` at all
  (`synapse/http/site.py`, around `:136`), so we were exposed to the original
  issue, not just the bypass.
- **Outcome:** ported the 1.120.1 override with the 1.157.2 lower-casing.
  Checked that nothing in this repo POSTs multipart to Synapse: the client's
  only `FormData` uses are a local form read and the rageshake forwarder,
  which posts to a separate service. Upstream tests ported
  (`tests/http/test_site.py`, three content-type variants): all 3 fail on
  develop and pass here.
- **Source:** OSV (rfq8), advisory page (6wjm); sdist diffs 1.120.0→1.120.2,
  1.157.1→1.157.2.

### GHSA-4mhg-xv73-xq2x: disk fill via unauthenticated remote media downloads

- **What:** Anyone, without authenticating, could make the server download
  and cache unlimited remote media.
- **Upstream:** the advisory says "1.106". The rate limit is not in the
  1.106.0 sdist; it first appears in **1.110.0** (#17256) and was refined in
  **1.112.0** (#17439). Those are the diffs ported.
- **Our tree:** `synapse/media/media_repository.py:621`
  (`_download_remote_file`) and `synapse/http/matrixfederationclient.py:1408`
  (`get_file`) have no rate limit.
- **Outcome:** ported only the rate-limit hunks, not the MSC3916 multipart
  work in the same releases. That gives a per-IP leaky bucket (500 MiB burst,
  87 KiB/s drain), at most 6 concurrent downloads per IP, and an up-front
  `max_upload_size` check. `thumbnail_resource.py` had diverged from
  upstream, so its plumbing was done by hand. The new config options are
  documented. Upstream tests (`RemoteDownloadLimiterTestCase`, 1.110 + 1.112)
  fail on develop: the 17th 30 MiB download goes through. All pass here.
- **Operational note:** the bucket is keyed on the client address, so a
  listener behind a proxy needs `x_forwarded: true`. Both production templates
  have it. The upstream-default `apps/blackout-server/docker/conf/homeserver.yaml`
  has `x_forwarded: false`.
- **Source:** OSV; sdist diffs 1.109.0→1.110.0, 1.111.0→1.112.0.

### GHSA-f3r3-h2mq-hx2h: malformed invite breaks the invitee's `/sync`

- **What:** A remote server sends an invite whose `invite_room_state` is not a
  list. The invitee's `/sync` breaks.
- **Upstream:** fixed 1.120.1 (`d82e1ed3`).
- **Our tree:** `synapse/federation/transport/server/federation.py:498`
  stored it unchecked, and `synapse/rest/client/sync.py:392` did `list(...)` on it.
- **Outcome:** ported to the four places upstream changed (Sliding Sync parts
  N/A). Upstream shipped no test. New `MalformedInviteRoomStateTests` sends a
  real signed v2 `/invite` and then syncs. On develop an `int` gives a 500 on
  `/sync`, and a `dict` puts non-event strings into `invite_state`. Both are
  fixed here.
- **Not changed (same as upstream):** the admin data-export path in
  `synapse/handlers/admin.py` reads `invite_room_state` unchecked.
- **Source:** OSV; sdist diff 1.120.0→1.120.2.

### GHSA-vp6v-whfm-rv3g: thumbnailing invokes arbitrary image decoders

- **What:** With `dynamic_thumbnails` (which the infra baseline enables), or
  with a crafted request, Pillow would decode any format it knows. Some
  decoders shell out (e.g. Ghostscript).
- **Upstream:** fixed 1.120.1 (`b64a4e5f`).
- **Our tree:** `synapse/media/thumbnailer.py:54` `Image.open(input_path)`.
- **Outcome:** ported (`formats=("jpeg", "png", "webp", "gif")`; Pillow 10.1 in
  the lockfile supports it). New test: BMP, TIFF and PPM are refused (3 fail on
  develop); PNG, JPEG, GIF and WebP still work.
- **Source:** OSV; sdist diff 1.120.0→1.120.2.

### GHSA-fh66-fcv5-jjfr: unvalidated device keys degrade federation

- **What:** A local user uploads malformed device keys. Those are federated,
  and they unpredictably break outbound federation.
- **Upstream:** fixed 1.138.3; 1.138.4 fixed a regression it introduced
  (`device_keys: null` → 500). Ported the 1.138.4 end state.
- **Our tree:** `synapse/rest/client/keys.py:115` passed the raw body
  straight through; `synapse/handlers/e2e_keys.py:819` also read the unstable
  `org.matrix.msc2732.fallback_keys` alias.
- **Outcome:** ported the pydantic request model and the check that the user
  and device IDs match the requester. Also stopped reading the unstable alias,
  which would otherwise bypass the new validation (upstream dropped it in the
  same release for the same reason). Left in place: upstream's removal of the
  unstable `/sync` response field, which is not security-relevant. Upstream's
  `KeyUploadTestCase`: 2 of its 3 tests fail on develop and all pass here. Not
  covered, same as upstream: the experimental MSC3814 dehydrated-device path
  (off by default) calls the handler without this servlet's validation.
- **Source:** OSV; sdist diff 1.138.2→1.138.4.

### GHSA-8q93-326v-3m7g: worker-lock back-off defect (CPU starvation upstream)

- **What upstream:** the lock re-poll interval used `max(5, next * 2)` where
  `min` was meant, so it grew without bound. In current upstream it eventually
  overflows `Duration(timedelta)`; the `OverflowError` is swallowed by
  `except Exception: pass`, and the loop spins with no wait.
- **Upstream:** fixed 1.152.1 (#19394).
- **Our tree:** the same defect is at `synapse/handlers/worker_lock.py:261`
  and `:336`. But this tree has no `Duration`; it calls
  `reactor.callLater(float)` directly. So **the upstream spin path does not
  exist here as described.** What does happen: the interval doubles on every
  wake-up, including notifications, so a waiter soon stops re-polling on its
  own and depends entirely on being notified. I did not find a way to turn
  that into CPU starvation here, so I do not claim one.
- **Outcome:** ported anyway. The defective code is the same, and the fix
  (60 s cap, back off only on real timeouts, log unexpected exceptions) is
  small. Upstream's regression test passes on develop *and* here, so it does
  not discriminate in this tree. A new
  `test_missed_notification_is_retried_within_cap` releases the lock without
  notifying the waiter; it fails on develop and passes here.
- **Source:** OSV; sdist diff 1.152.0→1.152.1; PR #19394 (WebFetch) for the mechanism.

### GHSA-6qf2-7x63-mm6v: pagination stops at a page of rejected events

- **What:** A malicious server makes a page of `/messages` consist only of
  rejected events. Synapse returned no `end` token, so clients stopped
  back-paginating.
- **Upstream:** fixed 1.152.1.
- **Our tree:** `synapse/handlers/pagination.py:601` `if not events:` treats an
  empty page as the end of the room.
- **Outcome:** ported. `_paginate_room_events_txn` / `paginate_room_events`
  return `limited`, as upstream's do. Upstream's regression test fails on
  develop and passes here.
- **Not changed (same as upstream):** the admin data-export loop in
  `synapse/handlers/admin.py` still treats an empty page as done.
- **Source:** OSV; sdist diff 1.152.0→1.152.1.

### GHSA-fp53-rw9v-hcf9: unlimited push rules

- **What:** A user can create unlimited, arbitrarily large push rules. That
  can fill the disk, and since rules are loaded for every event, exhaust memory.
- **Upstream:** fixed 1.157.2.
- **Our tree:** `synapse/storage/databases/main/push_rule.py:397`
  (`add_push_rule`) and `:587` (insert) have no limits.
- **Outcome:** ported. New `push_rules.limits` config with upstream's defaults
  (10 000 rules, 300-byte IDs, 1024-byte bodies), enforced in the store and
  documented. Upstream parses the section with pydantic `ParseModel`, which
  this tree lacks; it is parsed by hand with the same defaults and bounds and
  has its own tests (which caught a bug in my first version: `[]` was
  accepted as "empty"). Upstream's `PushRuleLimitTestCase`: 3 of its 7 cases
  fail on develop and all pass here.
- **Residual gap, same as upstream:** actions set on a server-default rule
  (`PUT .../actions` on `.m.rule.*`) are not size-checked. The number of such
  rules is fixed, but each one's size is bounded only by the request size
  limit. Left as upstream has it, to stay faithful; candidate follow-up.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-rgv2-84w7-5j9p: spoofed to-device sender accepted

- **What:** A remote server sends to-device messages whose `sender` claims
  another server.
- **Our tree:** `synapse/handlers/devicemessage.py:106` logs "Dropping device
  message ... with spoofed sender" and then **delivers it anyway** (no `return`).
- **Outcome:** ported the `return`. Upstream test: fails on develop, passes here.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-27p5-4f45-gx76: `/get_missing_events` discloses events from other rooms

- **What:** A malicious server that is joined to *any* room on ours can read
  events from rooms it is not in, by naming them in `latest_events`.
- **Our tree:** `synapse/storage/databases/main/event_federation.py:1650`
  walks `event_edges` with no room constraint.
- **Outcome:** ported. Upstream's 8 tests: 2 fail on develop, all pass here.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-qcjr-46gf-7f4r: `/event_auth` discloses auth events from another room

- **Our tree:** `synapse/federation/federation_server.py:984` →
  `synapse/handlers/federation.py:573` `get_event(event_id)` with no room check.
- **Outcome:** ported (`check_room_id`). The wrong-room test fails on develop
  and passes here.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-r66v-qhwx-8rg4: `/timestamp_to_event` answers for rooms the requester is not in

- **Our tree:** `synapse/federation/federation_server.py:229` has no
  `assert_host_in_room`.
- **Outcome:** ported. The not-in-room test fails on develop and passes here.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-95fh-hv8c-chvq: remote 401 relayed to clients forces logout

- **What:** A malicious server answers a federation request (an invite to
  one of its users, a join via it, and so on) with `401` / `M_UNKNOWN_TOKEN`,
  and Synapse relays that to the client. Clients treat it as "you were
  logged out" and can destroy their crypto state, permanently losing encrypted
  history for users without key backup. On a platform built around encrypted
  messaging this is the most consequential of the batch.
- **Our tree:** `synapse/api/errors.py:782` `to_synapse_error` relays errcode
  and status verbatim. Relay paths confirmed in this tree:
  `FederationClient._try_destination_list` (make_join/send_join etc.) and the
  remote invite path. (Profile and room-directory lookups already map 4xx to
  502.)
- **Outcome:** ported. Untrusted errors never carry `M_UNKNOWN_TOKEN` or 401;
  worker replication keeps the verbatim behaviour. Upstream's tests use a
  room policy server, which this tree does not have, so new tests drive a
  remote invite end to end. On develop the client receives `401
  M_UNKNOWN_TOKEN`; here it receives `400 M_UNKNOWN`.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-cjh7-rcpx-xpf8: room aliases redirected via a fake room upgrade

- **What:** A local user joins a malicious remote room that claims a local
  room as its predecessor. That room's aliases and directory listing move to
  the malicious room.
- **Our tree:** `synapse/handlers/federation.py:779` trusted the remote room's
  `predecessor` without checking the old room's tombstone.
- **Outcome:** ported. Upstream's tests and remote-join helper are ported,
  adapted to this harness (no `make_test_event`; `create_room_as` defaults to
  public here, so it is made explicit). The two attack tests fail on develop
  and pass here; the three legitimate-upgrade tests pass on both, so real
  upgrades still migrate aliases.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-vh4c-pqh4-w3wq: inserted path segments ignored

- **What:** `/_matrix/INSERTED/static/...` was served as `/_matrix/static/...`,
  which can evade path-based proxy rules or rate limits.
- **Our tree:** `synapse/http/server.py:611` `getChild` returned `self`.
- **Outcome:** ported. Upstream test fails on develop, passes here.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-hgcg-p9gx-fq5f: trailing data accepted on some endpoints

- **What:** Unanchored servlet regexes accepted extra trailing path data. That
  can bypass reverse-proxy rules that route on a normalised path.
- **Our tree:** 29 patterns in 19 files. I compared every unanchored pattern
  in our `synapse/rest/` with 1.157.2, which also catches ones upstream
  anchored before 1.157.2. In `profile.py` this tree still has separate
  `displayname` / `avatar_url` servlets, and both are anchored.
  `blackout_runtime/` registers no regex routes.
- **Outcome:** ported. Upstream shipped no test; the new
  `tests/rest/test_pattern_anchoring.py` checks each anchored servlet still
  matches its canonical path and rejects `/extra`, `/` and `/../x` suffixes.
  All 30 cases fail on develop and pass here.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

---

## Applicable, not ported

### GHSA-gjgr-7834-rhxr: unauthenticated remote media fetch lets anyone plant content

- **What:** The legacy `/_matrix/media/v3/download|thumbnail` endpoints let an
  unauthenticated requester make the server fetch and cache media from any
  remote server, then serve it from our domain.
- **Upstream:** the fix is the MSC3916 *authenticated media* feature as a whole:
  client `/_matrix/client/v1/media/*` endpoints (1.106–1.109), federation media
  endpoints with multipart responses (1.110–1.111), and the 1.120
  `enable_authenticated_media` freeze of the unauthenticated endpoints. The
  advisory itself calls 1.106 a "partial mitigation".
- **Our tree:** affected. `synapse/rest/media/download_resource.py` serves
  remote media with no authentication (`allow_remote` defaults to true), and
  no `v1/media` endpoint or `enable_authenticated_media` exists anywhere in
  `synapse/` (0 matches). `/versions` advertises up to v1.9, so clients use
  the legacy endpoints.
- **Why not ported:** this is a feature spread over five releases. It spans
  new client and federation endpoints, a multipart response parser in the
  federation client, and schema changes. Hand-porting it into a 1.98 tree is
  not a minimal, faithful security port, and a partial port would risk breaking media for every
  client. Freezing the legacy endpoints without the authenticated ones would
  break remote media outright.
- **What mitigates it now:** the GHSA-4mhg rate limit (ported above) bounds how
  much a single IP can make us fetch. It does not stop planting content.
- **Recommendation:** treat it as tracked work: port MSC3916 as its own change,
  or re-baseline the fork on a current upstream (see `PATCHES.md`: merges are
  not automatable today). Meanwhile the operator can block
  `/_matrix/media/*/download/*` and `/thumbnail/*` for remote server names at
  the reverse proxy for unauthenticated requests, accepting broken remote
  media for clients that do not send a token there.
- **Source:** OSV; upstream changelog entries #17213, #17350, #17365, #17433,
  #17889 (1.120.0 `CHANGES.md`).

---

## Not applicable

### GHSA-56w4-5538-8v8h: Sliding Sync partial room state leak

- **Upstream:** affects 1.113.0rc1 → 1.120.0 only.
- **Our tree:** Sliding Sync does not exist. No `synapse/handlers/sliding_sync`,
  and no match for `msc3575`, `msc4186` or `SlidingSync` in `synapse/` or the
  config manual. The fork predates the affected range.
- **Source:** OSV.

### GHSA-jhcg-5392-5mjw: invalid Sliding Sync (MSC4186) responses

- **Our tree:** same evidence as above. Upstream's fix only touches
  `synapse/handlers/sliding_sync/__init__.py`.
- **Source:** advisory page; sdist diff 1.157.1→1.157.2.

### GHSA-mxfq-g77w-7668 (Cinny): PR preview workflow publishes fork artifacts with Netlify credentials

- **What:** Cinny's `deploy-pull-request.yml` runs on `workflow_run` and
  deploys artifacts built from fork PRs using repository secrets.
- **Our tree:** the vulnerable file was carried over verbatim at
  `apps/blackout-client/.github/workflows/deploy-pull-request.yml` (and Synapse's
  similar `apps/blackout-server/.github/workflows/docs-pr-netlify.yaml`). GitHub
  only runs workflows from the repository root's `.github/workflows`. Checked
  against the Actions API: neither file is registered as a workflow in this
  repo. No root workflow uses `workflow_run`. The two root workflows on
  `pull_request_target` (`backport.yml`, `triage-move-review-requests.yml`) make
  API calls only and never check out PR code.
- **Outcome:** not applicable. Upstream Cinny's `dev` branch still has no
  fork gate on that workflow (it now uses a separate token). **Recommendation:**
  delete the inert nested `apps/*/.github/workflows/` directories, so that a
  later move to the root cannot activate them.
- **Source:** advisory page (WebFetch); `gh api repos/Blackmarket-coa/blackout/actions/workflows`.

## Not affected: fix already present

### GHSA-j944-w549-3453 (Cinny): access token sent to attacker via emoji pack avatar

- **What:** (1) EmojiBoard fell back to the user-controlled `pack.meta.avatar`
  as an image URL. (2) The service worker attached the user's bearer token to
  *any* URL containing `/_matrix/client/v1/media/...`, whatever the host.
- **Upstream:** fixed in 4.10.3, via #2609 ("Prevent invalid mxc from getting
  used") and #2605 (session pushed to the service worker).
- **Our tree:** `apps/blackout-client/package.json` says 4.10.5, but a version
  string is not evidence, so each fixed form was checked against upstream's
  4.10.3 source:
  - `src/sw.ts`: `validMediaRequest` requires the request URL to start with the
    full `new URL(path, session.baseUrl).href`, on both the stored-session and
    the requested-session paths. Our file is a later revision than 4.10.3 and
    keeps that check.
  - `src/app/components/emoji-board/EmojiBoard.tsx:235,300`:
    `mxcUrlToHttp(...) ?? undefined`, with no `pack.meta.avatar` fallback.
  - `emoji-board/components/Item.tsx`, `editor/autocomplete/EmoticonAutocomplete.tsx`,
    `message/FileHeader.tsx` and `message/content/{Audio,File,Image,Thumbnail,Video}Content.tsx`
    all match 4.10.3's fixed form (`?? ''`, or `throw new Error('Invalid media URL')`).
  - Raw-key fallbacks remain in `editor/Elements.tsx:96`,
    `emoji-board/components/Preview.tsx:40` and `message/Reaction.tsx:32`.
    They are identical in upstream 4.10.3, which did not change them. With the
    service-worker host check in place they cannot leak the token. They can
    still make the client fetch an attacker URL without credentials (an IP
    disclosure). Not part of this advisory; candidate follow-up.
- **Source:** OSV; Cinny v4.10.2/v4.10.3 sources via `raw.githubusercontent.com`;
  compare page and commit summaries via WebFetch.

---

## Tests run

The Python test environment is a venv built from `poetry.lock` pins (Python
3.11, Twisted 23.10, SQLite). The tests run in-tree with
`PYTHONPATH=. python -m twisted.trial`. Every number below was observed, on
SQLite only; nothing ran against Postgres, so the three Postgres-only schema
deltas are not exercised. No CI workflow in this repo runs the Synapse trial
suite, so CI will not re-check any of this.

Per-advisory regression tests: see each section above. Each fails, or shows
the bug, on develop `f42b1a9` and passes on this branch.

Wider suites were compared on develop and on this branch, by failing test ID:

| Suites | develop | this branch | New failures |
| --- | --- | --- | --- |
| `tests.storage.test_stream`, `tests.rest.client.test_rooms`, `tests.handlers.test_admin`, `tests.rest.admin.test_room` | 20 fail / 228 | 20 fail / 229 (+1 new test, passes) | 0 |
| `tests.push`, `tests.config`, `tests.handlers.test_room_member`, `tests.rest.client.test_push_rule_attrs` | 51 fail / 192 | 51 fail / 209 | 0 |
| `tests.media`, `tests.rest.media`, `tests.rest.admin.test_media`, `tests.replication.test_multi_media_repo`, `tests.federation.transport`, `tests.http.test_matrixfederationclient` | 72 fail / 282 | 72 fail / 293 | 0 |
| `tests.storage.test_event_chain`, `test_event_federation`, `tests.state`, `tests.test_state`, `tests.storage.test_purge`, `tests.handlers.test_federation`, `tests.storage.test_events` | 2 fail / 110 | 2 fail / 112 | 0 |

The full-suite comparison is in the PR description.

### Pre-existing failures found on develop (not caused or fixed here)

- `AttributeError: 'function' object has no attribute 'invalidate_all'` in the
  room purge / delete path. This fails the `DeleteRoom*` admin tests and
  `tests.storage.test_purge`.
- `AttributeError: 'RoomInitialSyncRestServlet' object has no attribute '_hs'`.
- `PushRuleEvaluator.__init__() got an unexpected keyword argument
  'room_version_feature_flags'`. The pure-Python fallback in
  `synapse/synapse_rust/push.py` does not match the evaluator API the tests
  (and callers) use. A `synapse/synapse_rust/` package directory takes import
  precedence over a compiled `synapse_rust` extension, so this shim is likely
  what runs in production too. That makes push-rule evaluation worth checking
  on its own.
- `tests.rest.client.test_sync`
  `test_revoked_device_metadata_flows_through_sync_and_keys_query`
  (`KeyError: 'ALICE_DEVICE'`).

---

## Licensing note

Upstream Synapse changed licence after 1.98 (Apache-2.0 → AGPL-3.0-or-later,
Element). Everything ported here comes from post-1.98 upstream releases, so it
is Element's AGPL code. Files copied wholesale keep upstream's AGPL header and
copyright. The repository is offered under AGPL-3.0, GPL-3.0 or
`LICENSE-COMMERCIAL`, and `apps/blackout-server/LICENSE` is still the 1.98-era
Apache text. AGPL code fits the AGPL and GPL options. Whether it can be offered
under the commercial licence is a question for the maintainer and counsel; this
document does not answer it.

## Follow-ups

1. GHSA-gjgr-7834-rhxr: port MSC3916 authenticated media, or re-baseline the fork.
2. Default-rule push actions are not size-limited (upstream gap, GHSA-fp53 residual).
3. Delete the inert `apps/blackout-client/.github/` and `apps/blackout-server/.github/` workflow directories.
4. Raw-key image fallbacks in `Elements.tsx`, `Preview.tsx`, `Reaction.tsx` (IP disclosure; not token).
5. Add a CI job that runs the Synapse trial suite; nothing currently does.
6. The pre-existing failures above, especially the push-rule evaluator shim.
