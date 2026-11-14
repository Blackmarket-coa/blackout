# Local Synapse Fork Patches

This repository tracks upstream Synapse while carrying Blackout-specific extensions.

## Upstream sync discipline

1. Configure the canonical upstream remote:
   ```bash
   git remote add upstream https://github.com/element-hq/synapse.git
   ```
2. Merge upstream `develop` monthly, and immediately for security advisories.
3. Keep Blackout features isolated to `blackout_runtime/` and `blackout_runtime_tests/` wherever possible.
4. Document any unavoidable edits outside those directories in this file before merge/rebase.

## First upstream sync pass

- Completed initial upstream remote setup and fetch against `element-hq/synapse`:
  - `git remote add upstream https://github.com/element-hq/synapse.git`
  - `git fetch upstream develop --depth=1`
  - `git rev-list --left-right --count upstream/develop...HEAD` -> `1 310`
- Interpretation: this branch currently has 310 local commits not in `upstream/develop`, while upstream has 1 commit not present locally from the fetched head snapshot.

## Full upstream merge rehearsal

- Performed non-shallow upstream fetch:
  - `git fetch upstream develop`
- Rehearsed merge on temporary branch:
  - `git checkout -b merge-rehearsal-upstream`
  - `git merge --no-commit --no-ff upstream/develop` (failed: unrelated histories)
  - `git merge --no-commit --no-ff --allow-unrelated-histories upstream/develop` (rehearsal)
- Result: extensive `add/add` conflicts across the tree indicate this repository history currently diverges as unrelated from `element-hq/synapse`.
- Action: prefer a dedicated one-time history-reconciliation effort (or fresh fork baseline) before regular monthly merges can be reliably automated.

## Current non-upstreamed patch surface

Primary Blackout surface:

- `blackout_runtime/`: module semantics, API resources, and governance/reputation integration.
- `blackout_runtime_tests/`: runtime + integration coverage for Blackout behavior.
- `tests/blackout_runtime/`: end-to-end homeserver API tests for module behavior.

Current non-`blackout_runtime` deltas kept intentionally:

- `synapse/storage/_base.py`: cache invalidation fallback now safely handles non-cache callables (avoids crashing when a looked-up attribute has no `invalidate` method).
- `docs/bmc_server_execution_plan.md`: deployment/runbook-facing module enablement snippet.
- `DEPLOYMENT_READINESS.md`: rollout status pointers to execution plan.
- `PATCHES.md`: upstream merge discipline and fork delta log.

One direct core Synapse source edit is currently tracked in this phase (`synapse/storage/_base.py`) and should be monitored during upstream merges.

## 2026-03-17 readiness wave patch-log refresh

To keep upstream reconciliation explicit, the following non-`blackout_runtime/` deltas are currently present from readiness/CI hardening work:

- `synapse/handlers/federation_event.py`: convert blackout payload-strip validation failures into typed federation protocol errors.
- `synapse/handlers/message.py`: convert blackout payload-strip validation failures into typed client errors during local event creation.
- `synapse/synapse_rust/acl.py`: normalize ACL matching for case-insensitive host handling and bracketed-IPv6 parsing.
- `synapse/util/blackout.py`: accept `org.matrix.self_destruct_after` as schema-compatible TTL metadata.
- `tox.ini`: set explicit test-phase `PYTHONPATH={toxinidir}` for trial import reliability.
- `tests/federation/test_federation_client.py`, `tests/federation/test_federation_server.py`, `tests/handlers/test_federation_event.py`, `tests/handlers/test_message.py`, `tests/handlers/test_room_member.py`, `tests/handlers/test_send_email.py`: test harness and expectation updates aligned with stricter blackout/runtime behavior.
- `tests/blackout_runtime/__init__.py`: explicit package marker to stabilize trial module discovery.
- `docs/ci_readiness_triage_2026-03-17.md`, `docs/reports/readiness_next_25_steps_2026-03-17.md`: readiness execution logs and blocker tracking.

These files should be explicitly reviewed during any future upstream rebase/reconciliation effort.

## 2026-10-09 upstream security advisory ports

Hand-ported fixes for upstream Synapse security advisories. The fork is based
on Synapse **1.98.0** (`pyproject.toml` `version = "1.98.0+blackout.1"`), so
every advisory fixed upstream after December 2023 had to be checked against
this tree individually. Triage, per-advisory evidence and the advisories that
were _not_ ported (and why) are in
`docs/security/upstream-advisory-triage-2026-10-09.md`. Each source of truth
for "what upstream changed" is the diff between the vulnerable and patched
upstream sdists from PyPI, named per entry.

Each file below is a direct edit to core Synapse source outside
`blackout_runtime/` and must be re-checked during any reconciliation with
upstream.

### Federation endpoints and to-device (upstream 1.157.1 -> 1.157.2)

- `synapse/handlers/devicemessage.py`: drop to-device EDUs whose `sender`
  domain does not match the origin (it was logged and then delivered anyway).
  GHSA-rgv2-84w7-5j9p.
- `synapse/federation/federation_server.py`
  (`on_timestamp_to_event_request`): require the requesting server to be in
  the room. GHSA-r66v-qhwx-8rg4.
- `synapse/federation/federation_server.py` (`on_event_auth`),
  `synapse/handlers/federation.py` (`on_event_auth` now takes `room_id`):
  look the event up with `check_room_id`, so an event from another room is a
  404 like an unknown one. GHSA-qcjr-46gf-7f4r.
- `synapse/storage/databases/main/event_federation.py`
  (`_get_missing_events`): constrain the starting events and every step of the
  backwards walk to the requested room. GHSA-27p5-4f45-gx76.
- Tests: `tests/federation/test_federation_server_advisories.py` (new; upstream
  tests adapted to this harness), `tests/rest/client/test_sendtodevice.py`
  (`test_remote_spoofed_sender`).

### HTTP layer (upstream 1.120.0 -> 1.120.2 and 1.157.1 -> 1.157.2)

- `synapse/http/site.py` (`SynapseRequest.requestReceived`, new): reject
  `POST` with `Content-Type: multipart/form-data` (compared case-insensitively)
  with 415 before Twisted buffers the body in memory. GHSA-rfq8-j7rh-8hf2 and
  its bypass GHSA-6wjm-9p2x-gvpm. No Blackout endpoint accepts multipart.
- `synapse/api/errors.py`: `HttpResponseException.to_synapse_error` no longer
  relays a remote `401` or `M_UNKNOWN_TOKEN` to clients (clients treat those as
  "you have been logged out"); the verbatim behaviour moves to
  `unsafe_to_verbatim_synapse_error`, used only for worker-to-worker replication
  in `synapse/replication/http/_base.py`. GHSA-95fh-hv8c-chvq.
- `synapse/http/server.py` (`UnrecognizedRequestResource.getChild`): return a
  childless leaf instead of `self`, so an inserted path segment such as
  `/_matrix/INSERTED/static/...` is a 404 instead of resolving to
  `/_matrix/static/...`. GHSA-vh4c-pqh4-w3wq.
- Servlet `PATTERNS` anchored with `$` (GHSA-hgcg-p9gx-fq5f), exactly the set
  upstream anchored that exists in this tree:
  `synapse/rest/admin/{experimental_features,users}.py`,
  `synapse/rest/client/{account_data,appservice_ping,auth,devices,filter,knock,login,openid,presence,profile,register,relations,room,tags,thirdparty,tokenrefresh}.py`,
  `synapse/rest/media/create_resource.py`. In `profile.py` this tree still has
  the separate `displayname` / `avatar_url` servlets, so both are anchored.
- Tests: `tests/http/test_site.py` (`test_content_type_multipart`),
  `tests/api/test_errors_advisories.py` (new),
  `tests/util/test_httpresourcetree.py` (new, upstream),
  `tests/rest/test_pattern_anchoring.py` (new).

### Event and media input validation (upstream 1.120.1, 1.127.1, 1.157.2)

- `synapse/federation/transport/server/federation.py`,
  `synapse/handlers/federation.py` (knock), `synapse/push/push_tools.py`,
  `synapse/rest/client/sync.py`: tolerate / reject non-list
  `invite_room_state` and `knock_room_state`, which a remote server could use
  to break the invitee's `/sync`. GHSA-f3r3-h2mq-hx2h (upstream 1.120.1).
- `synapse/api/constants.py` (`MAX_DEPTH` lowered to the canonical-JSON
  integer limit, `CANONICALJSON_{MAX,MIN}_INT` moved here from
  `synapse/events/utils.py`), `synapse/events/validator.py` (validate the whole
  PDU), `synapse/federation/units.py` (`filter_pdus_for_valid_depth`,
  `serialize_and_filter_pdus`), `synapse/federation/federation_base.py`
  (`parse_events_from_pdu_json`), `synapse/federation/federation_client.py`,
  `synapse/federation/federation_server.py`: events with an out-of-range
  `depth` are no longer accepted, stored or forwarded. GHSA-v56r-hwv5-mxg6
  (upstream 1.127.1; exploited in the wild).
- `synapse/media/thumbnailer.py`: Pillow may only decode JPEG, PNG, WebP and
  GIF when thumbnailing. GHSA-vp6v-whfm-rv3g (upstream 1.120.1).
- `synapse/handlers/federation.py` (`do_invite_join`) and
  `synapse/api/constants.py` (`EventContentFields.TOMBSTONE_SUCCESSOR_ROOM`):
  only migrate aliases / directory state from a predecessor room that we are
  in and whose tombstone names the joined room. GHSA-cjh7-rcpx-xpf8
  (upstream 1.157.2).
- Tests: `tests/federation/test_federation_server_advisories.py`
  (`MalformedInviteRoomStateTests`), `tests/federation/test_pdu_depth_advisory.py`
  (new), `tests/media/test_thumbnailer_formats.py` (new),
  `tests/federation/_remote_join.py` and
  `tests/federation/test_federation_join_upgraded_room.py` (upstream, adapted).

### Worker locks and pagination (upstream 1.152.0 -> 1.152.1)

- `synapse/handlers/worker_lock.py` (`WaitingLock`, `WaitingMultiLock`): cap
  the lock re-poll interval at 60 s, only back off on real timeouts, and log
  rather than swallow other exceptions. The old `max(5, next * 2)` was meant
  to be `min`. GHSA-8q93-326v-3m7g. Upstream's CPU-spin path goes through
  `Duration(timedelta)` overflowing, which this tree does not have; here the
  same defect shows up as a waiter that stops re-polling on its own (see the
  triage doc).
- `synapse/storage/databases/main/stream.py` (`_paginate_room_events_txn` and
  `paginate_room_events` now also return `limited`; internal callers updated),
  `synapse/handlers/pagination.py` (only end pagination when the page is empty
  _and_ not limited), `synapse/handlers/admin.py` and
  `tests/storage/test_stream.py` (unpacking only). A page consisting solely of
  rejected events no longer ends `/messages` back-pagination.
  GHSA-6qf2-7x63-mm6v. The admin data-export loop in `handlers/admin.py` keeps
  its "empty page means done" logic, as upstream does.
- Tests: `tests/handlers/test_worker_lock.py` (upstream test plus
  `test_missed_notification_is_retried_within_cap`),
  `tests/rest/client/test_rooms_pagination_advisory.py` (upstream test).

### Device key upload validation (upstream 1.138.2 -> 1.138.4)

- `synapse/rest/client/keys.py` (`KeyUploadServlet`): validate the
  `/keys/upload` body with a pydantic model (`KeyUploadRequestBody`) and
  require `device_keys.user_id` / `device_keys.device_id` to match the
  requester. `null` fields are accepted (the 1.138.4 regression fix).
  GHSA-fh66-fcv5-jjfr. The request body handed to the handler is unchanged;
  unknown fields (including any Blackout extensions) are ignored by the model,
  not stripped.
- `synapse/handlers/e2e_keys.py` (`upload_keys_for_user`): stop reading the
  unstable `org.matrix.msc2732.fallback_keys` alias, which would bypass the new
  validation. (Upstream also dropped the unstable
  `org.matrix.msc2732.device_unused_fallback_key_types` field from `/sync`;
  that is not security-relevant and is left in place here.)
- Tests: `tests/rest/client/test_keys.py` (`KeyUploadTestCase`, upstream),
  `tests/handlers/test_e2e_keys.py` (unstable alias now ignored).

### Push rule limits (upstream 1.157.1 -> 1.157.2)

- `synapse/config/push_rules.py` (new), `synapse/config/homeserver.py`,
  `synapse/config/_base.pyi`: new `push_rules.limits` section (`rule_count`
  10000, `rule_id_length` 300, `rule_size` 1024 bytes by default). Upstream
  parses it with pydantic `ParseModel`, which this tree lacks; the same
  defaults and bounds are enforced by hand.
- `synapse/storage/databases/main/push_rule.py` (`PushRuleStore`): enforce the
  limits when adding a rule, when inserting a new row, and when changing a
  rule's actions. GHSA-fp53-rw9v-hcf9. As upstream, actions set on a
  _server-default_ rule are not size-checked (see the triage doc).
- `docs/usage/configuration/config_documentation.md`: documents `push_rules`.
- Tests: `tests/rest/client/test_push_rule_attrs.py` (`PushRuleLimitTestCase`,
  upstream), `tests/config/test_push_rules_config.py` (new).

### Auth chain cover index (upstream 1.98.0 -> 1.105.0 read side, 1.105.1 write side)

- `synapse/storage/databases/main/event_federation.py`: read auth-chain links
  by graph traversal (`_get_chain_links`, `_materialize`) instead of assuming
  `event_auth_chain_links` holds the transitive closure; register the
  `event_auth_chain_links_origin_index` background index. This is upstream's
  1.105.0 read path, a prerequisite for the security fix.
- `synapse/storage/databases/main/events.py` (`_add_chain_cover_index`,
  `_LinkMap.exists_path_from`): stop writing transitive links. Writing them was
  what let a remote room member blow up CPU and disk. GHSA-3h7q-rfh9-xm4v.
- `synapse/storage/schema/main/delta/84/01_auth_links_stats.sql.postgres`,
  `02_auth_links_index.sql`, `03_auth_links_analyze.sql.postgres`: upstream's
  deltas, same file names (Postgres planner statistics, the index's background
  update, `ANALYZE`). This tree's own `84/01_blackout_monetization_foundations.sql`
  is unaffected; servers already at schema 84 pick the new files up on start.
- **Rollback hazard.** Upstream bumped `SCHEMA_COMPAT_VERSION` to 84 so that
  code expecting transitive links cannot run against a database written
  without them. This tree already used schema version 84 for the monetization
  delta, so the same bump would not stop a rollback to an earlier Blackout
  build and was not made. Do not roll a server back past this change once it
  has persisted events; the older read path would compute incomplete auth
  chains.
- Tests: `tests/storage/test_event_chain.py` (upstream 1.105.1 changes).

### Remote media download rate limit (upstream 1.109.0 -> 1.110.0 and 1.111.0 -> 1.112.0)

- `synapse/config/ratelimiting.py`: new `remote_media_download_burst_count`
  (default 500M) and `remote_media_download_per_second` (default 87K).
- `synapse/media/media_repository.py`, `synapse/federation/federation_client.py`,
  `synapse/federation/transport/client.py`, `synapse/http/matrixfederationclient.py`
  (`get_file`), `synapse/rest/media/download_resource.py`,
  `synapse/rest/media/thumbnail_resource.py`: a per-requester-IP leaky bucket
  charged with the bytes of each remote download, at most 6 concurrent remote
  downloads per IP, and an explicit `max_upload_size` check on the remote's
  `Content-Length`. GHSA-4mhg-xv73-xq2x. The advisory says "1.106"; the code
  actually shipped in 1.110.0 (#17256) and was refined in 1.112.0 (#17439),
  and those are the diffs ported. Only the rate-limit hunks were taken; the
  MSC3916 federation multipart-download changes in the same releases were not.
  `thumbnail_resource.py` diverged from upstream, so its `ip_address` plumbing
  was done by hand.
- `docs/usage/configuration/config_documentation.md`: documents both options.
- The bucket is keyed on `request.getClientAddress()`, so a listener behind a
  reverse proxy needs `x_forwarded: true` (both production templates under
  `deploy/` and `infra/` have it) or every user shares one bucket.
- Tests: `tests/media/test_media_storage.py` (`RemoteDownloadLimiterTestCase`,
  upstream 1.110 + 1.112).

## 2026-10-11 Semgrep triage

Edits outside `blackout_runtime/` from the Semgrep pass recorded in
`docs/security/semgrep-triage-2026-10-11.md` (repository root). One behaviour
change and one defensive check; everything else is comments. Re-check each
during any reconciliation with upstream.

### Behaviour

- `synapse/handlers/auth.py` (`complete_sso_login`, new
  `_url_scheme_as_browsers_read_it` and `_SCRIPT_CAPABLE_URL_SCHEMES`): a
  client redirect URL whose scheme is `javascript:`, `vbscript:` or `data:`
  (read the way a browser reads it) is refused with the SSO error page (400,
  `invalid_request`) before a login token is minted. Otherwise the
  confirmation page offered it as a link with the token appended, and one
  click sent the token to whoever wrote the URL. **Not a port:** upstream
  `element-hq/synapse` `develop` has the same gap as of 2026-10-11. Tests:
  `tests/rest/client/test_login.py`
  (`CASTestCase.test_cas_redirect_refuses_script_schemes`,
  `test_cas_redirect_confirm_custom_scheme`).
- `synapse/media/url_previewer.py` (`_parse_data_url`): raise unless the URL
  starts with `data:`. Its only caller already checks; this keeps `urlopen`
  from ever being handed a `file:` URL. Test:
  `tests/media/test_url_previewer.py`
  (`test_parse_data_url_refuses_other_schemes`).

### Comment-only (`nosemgrep` with a justification line)

- `synapse/res/templates/`: `add_threepid.html`, `notice_expiry.html`,
  `notif.html`, `notif_mail.html`, `password_reset.html`, `registration.html`,
  `room.html`, `sso_auth_confirm.html`, `sso_new_user_consent.html`,
  `sso_redirect_confirm.html`, `terms.html`. These are Jinja `{# #}` comments,
  so rendered output gains whitespace only.
- `docs/website_files/theme/index.hbs`: Handlebars and JS comments.
- `synapse/state/v1.py`, `contrib/graph/graph.py`,
  `scripts-dev/check_pydantic_models.py`, `scripts-dev/check_schema_delta.py`,
  `scripts-dev/schema_versions.py`, `scripts-dev/release.py`.
- `synapse/util/managed_hosting.py`. This is a Blackout file that lives outside
  `blackout_runtime/` and was not listed here before; it should be.
  (2026-11-02: removed in `9493f41`, with its `nosemgrep`; the operator chose
  removal, as the entry "2026-11-02 the Nixpacks path and the hosting helpers
  are removed" says.)
- `debian/hash_password.ronn`: each annotation sits outside its example's code
  block so that ronn does not render it. Each example now renders as two
  adjacent blocks (command, then output). `debian/hash_password.1` was not
  regenerated.

## 2026-10-11 Black Mask panel session lengths (launch-plan B3)

No core Synapse source was edited: the feature lives in
`blackout_runtime/session_length.py` (wired from `blackout_runtime/module.py`,
off unless the module config sets `session_lengths_enabled: true`), with tests
in `tests/blackout_runtime/test_session_length.py`. It does lean on upstream
internals, which an upstream sync must re-check:

- It writes `access_tokens.valid_until_ms`, `refresh_tokens.expiry_ts` and
  `refresh_tokens.ultimate_session_expiry_ts` for one device, and relies on
  upstream enforcing them: `Auth.get_user_by_access_token`
  (`synapse/api/auth/internal.py`) and `AuthHandler.refresh_token`
  (`synapse/handlers/auth.py`).
- It invalidates `get_user_by_access_token` with the store's private
  `_invalidate_cache_and_stream`, as `_set_device_for_access_token_txn` does.
- It creates its own table, `blackout_session_lengths`, in Synapse's main
  database (`CREATE TABLE IF NOT EXISTS`, outside Synapse's schema versions),
  and reads `devices`.
- It signs devices out with `DeviceHandler.delete_devices` from a looping call
  that acts only on the main process, and registers an `on_logged_out`
  password-auth-provider callback to forget a deleted device's length.
- That callback (`SessionLengthStore.forget_if_device_gone`) deletes the
  length row only when the `devices` row is already gone. It relies on
  `DeviceHandler.delete_devices` (`synapse/handlers/device.py`) calling
  `store.delete_devices` before `AuthHandler.delete_access_tokens_for_user`,
  which is what fires `on_logged_out` (`synapse/handlers/auth.py`). Logout,
  `/logout/all` and the devices API all go through that method. If an upstream
  change makes `on_logged_out` fire while the `devices` row still exists, the
  rows of devices signed out that way are never deleted: a timed one is still
  cleared by the sweep at its end, an "Until I sign out" one never is, and a
  later sign-in that reuses the device ID gets 409 when it binds a length.
  `test_logout_forgets_the_length` would catch it, but CI runs no
  `apps/blackout-server` tests, so it has to be run by hand.
- It stays off under MSC3861 (delegated auth), where these tables do not hold
  the tokens.

## 2026-10-24 Pillow 13.0.0 on Python 3.11+, and the dependency check

Edits outside `blackout_runtime/` for the Pillow advisories recorded in
`docs/security/synapse-dependencies-triage-2026-10-24.md` (repository root).
Re-check each during any reconciliation with upstream.

- `pyproject.toml`: `Pillow` is now one constraint per Python range:
  `>=13.0.0` on Python >= 3.11 and the old `>=10.0.1` below that. The lock had
  10.1.0, which OSV lists 51 GitHub advisories against. 13.0.0 is the first
  release that fixes them all, and it requires Python 3.11. So 3.8-3.10 keep
  the 10.1.0 lock entry and all 51 advisories; no Pillow release they can run
  fixes them. The Docker image builds on 3.11 and gets 13.0.0. Upstream made
  the same split in 1.163.2 (#20398).
- `poetry.lock`: regenerated with `poetry lock --no-update` under poetry 1.3.2,
  the version `docker/Dockerfile` installs. It adds the `pillow` 13.0.0 entry
  and a new `content-hash`, and swaps the order of astroid's two `wrapt`
  constraints. Nothing else moved.
- `synapse/util/check_dependencies.py`: port of upstream #19110 (Synapse
  1.142.0), so `check_requirements()` skips a requirement whose markers do not
  apply to this interpreter, and stops treating a bare `python_version` marker
  as a dev dependency. Without it, the Pillow split stops Synapse starting on
  3.8-3.10 ("needs Pillow>=13.0.0; python_version >= "3.11", but got
  Pillow==10.1.0"), and 3.11 never checks the 13.0.0 floor. `dict[...]` and
  `set[...]` are spelled `typing.Dict` and `typing.Set` for Python 3.8. On a
  sync, take upstream's file, but keep this tree's `DISTRIBUTION_NAME`
  (`blackout-server`) and its source-tree fallback for missing metadata.
- `tests/util/test_check_dependencies.py`: upstream's
  `test_python_version_markers_respected`, plus `test_pillow_python_version_split`
  for the Pillow requirement as poetry-core writes it.
- `synapse/media/thumbnailer.py` needed no change for Pillow 13. It still calls
  the private `Image._getexif()`, which 13.0.0 keeps; upstream moved to
  `getexif()` in #19098.
- When the fork's Python floor is raised to 3.11, the `Pillow` constraint
  collapses to `>=13.0.0` and the 10.1.0 lock entry goes away.

## 2026-10-25 upstream security fix ports (second pass)

Hand-ported fixes from upstream Synapse releases 1.130.0 to 1.161.0, found by
re-checking upstream's `CHANGES.md` and OSV against this **1.98.0**-based tree
after the 2026-10-09 pass. Triage, per-fix evidence and what was left alone
are in `docs/security/synapse-upstream-advisories-triage-2026-10-25.md`
(repository root). The source of truth for "what upstream changed" is the
`element-hq/synapse` git history (`develop` at `8d60450b3`, release-v1.164
merged), read, not run; the release and PR are named per entry.

Each file below is a direct edit to core Synapse source outside
`blackout_runtime/` and must be re-checked during any reconciliation with
upstream.

### Banned server signing key (upstream 1.147.1, #19459)

- `synapse/crypto/keyring.py`: new module constant `BANNED_SERVER_SIGNING_KEYS`,
  a tuple of unpadded-base64 verify keys, holding the ESS Community Helm chart
  key from ELEMENTSEC-2025-1670 / CVE-2026-24044 (GHSA-qwcj-h6m8-vp6q). In
  `Keyring.process_request`, a fetched key that is in the tuple is refused with 401
  `M_UNAUTHORIZED` before it is used, so both federation request authentication
  (`verify_json_for_server`) and event signature checks
  (`_check_sigs_and_hash`) reject anything signed with it. Same tuple contents
  and same check as upstream; `_process_json` keeps this tree's name (upstream
  renamed it `process_json`). On a sync, take upstream's tuple: it is the list
  upstream extends when another key is burned.
- Tests: `tests/crypto/test_keyring.py`
  (`test_verify_json_for_server_using_banned_key`) and
  `tests/federation/test_federation_base.py` (new file), both upstream's.
  `patch.object` is given a 1-tuple here where upstream passes a bare string
  and relies on substring `in`.

### Private read receipts sent to application services (upstream 1.161.0, #20114)

- `synapse/handlers/receipts.py`: `ReceiptEventSource.filter_out_private_receipts`
  now delegates to a new `_filter_private_receipts(rooms, is_visible)`, and
  `get_new_events_as` runs the receipts it hands to an application service
  through it with `service.is_interested_in_user`. An appservice that opts in
  to ephemeral events (MSC2409) now sees `m.read.private` only for users in
  its namespaces (or its sender user); public receipts are unchanged. `List`
  is spelled `typing.List` for Python 3.8.
- Context: `deploy/matrix-appservice/registration.yaml` sets
  `de.sorunome.msc2409.push_ephemeral: false`, so the deaddrop appservice never
  received these; any appservice that opts in would have.
- Test: `tests/handlers/test_appservice.py`
  `test_application_services_receive_private_read_receipts_of_namespaced_users_only`
  (upstream's, unchanged).

### OIDC session cookie `Secure` attribute (upstream 1.142.0, #19079)

- `synapse/handlers/oidc.py`: in `_SESSION_COOKIES`, `oidc_session_no_samesite`
  now carries `HttpOnly; Secure` like its `oidc_session` twin; the only
  remaining difference is `SameSite=None`, as the cookie names say. Without
  `Secure` a browser also sends the session macaroon (`state`, `nonce`,
  `code_verifier`, `client_redirect_url`) over plain HTTP to the host. Both
  production templates serve over HTTPS (`public_baseurl`); classic
  `oidc_providers` is configured in `infra/single-server-baseline`.
- Test: `tests/handlers/test_oidc.py`
  `test_redirect_request_session_cookies_are_secure` (new; upstream shipped
  none).

### Repair of `topological_ordering` after GHSA-v56r-hwv5-mxg6 (upstream 1.130.0, #18447)

- `synapse/storage/databases/main/events_bg_updates.py`: new background update
  `fixup_max_depth_cap` (`fixup_max_depth_cap_bg_update`) that walks the
  `rooms` table in batches and, in room versions with strict canonical JSON,
  caps `events.topological_ordering` at `MAX_DEPTH`. The 2026-10-09 GHSA-v56r
  port stops new out-of-range depths; this repairs the `/messages` ordering of
  events persisted before it in rooms an attacker had already hit.
  `Tuple`/`List`/`Optional` for Python 3.8.
- `synapse/storage/schema/main/delta/84/04_fixup_max_depth_cap.sql`: schedules
  it (ordering 8404). Upstream's is `delta/92/05` (ordering 9205); this tree is
  at `SCHEMA_VERSION = 84`. On a sync keep one of the two, not both.
- Test: `tests/storage/test_events_bg_updates.py`
  (`TestFixupMaxDepthCapBgUpdate`, upstream's; the last assertion builds its
  dict explicitly for this tree's `simple_select_list` typing). Exercised on
  SQLite only.

## 2026-10-25 Python 3.11 floor, dependency relock, pyo3 0.29

Edits outside `blackout_runtime/` for the dependency advisories recorded in
`docs/security/synapse-dependencies-triage-2026-10-25.md` (repository root).
Re-check each during any reconciliation with upstream. Upstream made the same
moves in its own history (Python 3.10+ in 1.142.0, `importlib.resources`, the
Twisted 24.7+ header and test-harness changes, pyo3 0.29 on develop), so most
of these converge with upstream rather than diverge from it.

### Python floor and lock

- `pyproject.toml`: `python = "^3.11"` (was `^3.8.0`); `Pillow = ">=13.0.0"`
  replaces the per-Python split of 2026-10-24. Floors raised to the first
  release that clears each package's High/Critical advisories: Twisted 26.4.0,
  pyOpenSSL 26.0.0, cryptography 49.0.0, pyasn1 0.6.4, msgpack 1.2.1, lxml
  6.1.0, authlib 1.6.12 (also clears its Moderate ones), GitPython 3.2.1 (dev).
  New explicit floors on transitive packages for the same reason: certifi,
  urllib3, setuptools, thrift and tornado (jaeger-client's, so they join the
  `opentracing` and `all` extras), pyjwt (dev), soupsieve (docs).
  `service-identity` goes to 24.2.0, the first release that does not call
  pyOpenSSL's `X509.get_extension`, which pyOpenSSL 26 removed.
- Two bounds: `authlib <1.7`, because 1.7.0 validates id_token claims with
  joserfc, which rejects the integer `sub` that `oidc.py` accepts and
  `test_oidc.test_map_userinfo_to_user` covers (upstream's lock is also on
  1.6.12); `Pympler <1.1`, because 1.1 pulls in `pywin32`, which ships no
  sdist, and `scripts-dev/check_locked_deps_have_sdists.py` requires one.
- `poetry.lock`: regenerated from the previous lock with poetry 1.3.2 (the
  Dockerfile's version) `lock --no-update`, plus `update --lock` for bleach,
  idna, jinja2, pynacl, requests and zipp (Moderate advisories). 27 packages
  change version and three drop out; the dev tools keep their versions. black stays on 23.10.1: 26.10.1
  clears its advisories but reformats 207 fork files. Twisted 26.4.0 still has
  three High advisories that only the 26.10.0rc1 pre-release fixes, in
  `twisted.words` and `twisted.conch.telnet`, which Synapse never loads.
  Superseded by the 2026-11-02 entry below, which locks Twisted 26.10.0
  (final), the release that fixes those three and the HTTP/2 one
  (GHSA-vpp8-g58w-m8mp) that the 2026-10-30 record added.
- `tox.ini` (`py311`), `mypy.ini` (`python_version = 3.11`),
  `synapse/__init__.py` (refuses to start below 3.11), `[tool.black]` and
  `[tool.cibuildwheel]` targets, `docker/Dockerfile` (build-arg example),
  `docs/setup/installation.md`, `scripts-dev/build_debian_packages.py`
  (drops bullseye, focal and jammy, whose Python is below 3.11), and the
  fork's never-run `.github/workflows/{tests,twisted_trunk,release-artifacts}.yml`.
- `synapse/util/check_dependencies.py`: `dict`/`set` builtins instead of the
  `typing.Dict`/`typing.Set` spellings the 2026-10-24 port used for 3.8.

### Library compatibility (production code)

- `synapse/config/_base.py`, `synapse/config/oembed.py`: `pkg_resources` to
  `importlib.resources`, as upstream has it. setuptools 82 removed
  `pkg_resources` and the lock takes setuptools to 84.2.1, so Synapse failed
  at import. `synapse/handlers/send_email.py` drops `parse_version` and the
  pre-Twisted-21.2 `_NoTLSESMTPSender` branch it selected.
- `synapse/http/proxy.py`: hop-by-hop headers are compared lowercased
  (`HOP_BY_HOP_HEADERS_LOWERCASE`, upstream's code). Twisted 26's `Headers`
  no longer has the private `_canonicalNameCaps()`, so
  `parse_connection_header_value()` raised for every proxied federation
  response that carried a `Connection` header.
- `synapse/handlers/auth.py` (`hash`, `validate_hash`): password + pepper is
  truncated to 72 bytes before bcrypt, as upstream does. bcrypt 5 raises
  `ValueError` where 4.x silently truncated. This lock keeps bcrypt 4.0.1, so
  nothing changes today; the first, full relock took bcrypt to 5.0.0, and
  existing hashes keep verifying either way.

### Tests

- `pkg_resources` to `importlib.resources` in `tests/rest/client/test_register.py`,
  `test_account.py` and `tests/push/test_email.py`;
  `tests/metrics/test_metrics.py` compares versions with `packaging`.
- Twisted 26 harness changes, ported from upstream: `tests/server.py`
  (`FakeChannel.writeHeaders` accepts a `Headers` object; `FakeSite` has
  `_parsePOSTFormSubmission`; the fake resolver is installed after
  `MemoryReactorClock.__init__()`, which now installs its own; `FakeTransport`
  has no-op `get/setTcpNoDelay` and `get/setTcpKeepAlive`),
  `tests/http/server/_base.py` (patches `Deferred.__await__`; Twisted 26 has
  no `Deferred.__next__`), `tests/http/test_proxyagent.py` (`_hostText`),
  `tests/logging/test_terse_json.py`, `tests/util/test_async_helpers.py`, and
  `tests/test_server.py` and `tests/rest/client/test_login.py` read headers
  through the `Headers` API.
- `tests/http/test_proxy.py` expects lowercased header names.
- `tests/rest/client/test_login.py`: the JWT claim assertions accept either
  quote style, as upstream's do.
- `tests/media/test_html_preview.py` (`test_no_tree`): lxml 6 (libxml2 2.14)
  recovers a lone NUL byte into a document instead of returning None; the
  test now checks that it does not raise and yields no title.
- `tests/handlers/test_auth.py`: `test_hash_long_password`.

### Rust extension (`synapse_rust`)

- `rust/Cargo.toml`: pyo3 0.20.0 to 0.29.3 (GHSA-36hh-v3qg-5jq4, High),
  pyo3-log 0.9.0 to 0.13.4, pythonize 0.20.0 to 0.29.0, `abi3-py38` to
  `abi3-py311`, `rust-version` 1.61.0 to 1.83.0 (pyo3 0.29's MSRV, the highest
  in the graph). `Cargo.lock`: updated with `cargo update` for pyo3,
  pyo3-log, pythonize and anyhow (anyhow 1.0.75 had RUSTSEC-2026-0190); cargo
  1.97 rewrote it in lockfile format 4, which cargo 1.78 and later read. The
  Dockerfile installs Rust `stable` through rustup.
- `rust/src/lib.rs`, `rust/src/acl/mod.rs`, `rust/src/push/mod.rs`,
  `rust/src/push/evaluator.rs`: the pyo3 "Bound" API migration, in the shapes
  upstream's develop uses for the same code: `&Bound<'_, PyModule>` module
  arguments, `add_submodule(&child)`, `Vec<PyBackedStr>` constructor
  arguments, `IntoPyObject` in place of `IntoPy<PyObject>` (pythonize errors
  propagate instead of `expect`), `FromPyObject<'_, 'py>` with `Borrowed`
  input and `.cast::<PyString>()` in place of `PyTryFrom`, `PyInt` for
  `PyLong`, `#[pyclass(from_py_object)]` on `PushRule`/`PushRules` (passed by
  value from Python) and `skip_from_py_object` on the others, and explicit
  `#[pyo3(signature = (..., user_id=None, display_name=None))]` on
  `PushRuleEvaluator.run`/`matches` to keep the implicit `None` defaults pyo3
  0.20 gave trailing `Option` arguments. No Python-visible behaviour change.
- Note: `synapse/synapse_rust/__init__.py`, `acl.py` and `push.py` are
  pure-Python fallbacks that this fork ships _as a package_, and a package
  directory shadows the compiled `synapse_rust.abi3.so` module beside it, so
  the extension is built but never imported (`tests/test_rust.py` fails on the
  unchanged tree for this reason). The pyo3 advisory was therefore in the
  built artifact, not on any executed path.

## 2026-10-26 legacy FastAPI service pins (`services/blackout-api`)

- `services/blackout-api/requirements.txt`: PyJWT 2.10.1 → 2.15.1, FastAPI
  0.116.1 → 0.162.0, Starlette pinned at 1.10.0 (it was unpinned, held below
  0.48 by FastAPI), pytest 8.4.2 → 9.1.1, each past its advisories. This is
  Blackout's own service with no counterpart upstream, so an upstream sync does
  not touch it; it is recorded here because it sits outside
  `blackout_runtime/`. Record:
  `docs/security/synapse-dependencies-triage-2026-10-25.md` (last section).

## 2026-10-30 authlib 1.9.1 (JWS and HMAC key advisories)

Edits outside `blackout_runtime/` for the authlib advisories recorded in
`docs/security/dependency-advisories-server-desktop-2026-10-30.md` (repository
root). Ported from upstream `b20ae98` (#20415, "Bump authlib from 1.6.12 to
1.9.1", element-hq/synapse develop, 2026-10-27), which changed only
`poetry.lock` and `tests/handlers/test_oidc.py`. Re-check both files during any
reconciliation with upstream; after this they match upstream's for authlib.

- `pyproject.toml`: `authlib = ">=1.9.1,<1.10"` (was `>=1.6.12,<1.7`). 1.9.1
  fixes GHSA-6v38-4h7w-rj9h (Critical), GHSA-7vr2-2fgp-9w7p and
  GHSA-8m4g-j4wp-wgcg (High), and five Moderate/Low advisories. It also fixes
  GHSA-c73q-w75p-j82v (High, published 2026-10-30 23:09 UTC, after the rest;
  added after the fourth review): the documented RFC 7592
  `ClientConfigurationEndpoint` examples do not bind the registration access
  token to the client. That is authorization-server code. Synapse is an OAuth
  client here, and nothing in `synapse/` or `blackout_runtime/` uses an
  RFC 7591 or 7592 endpoint, so it was not reachable. Upstream has no
  upper bound (`authlib>=0.15.1`); this tree caps below the next minor, which
  has not been released or checked. The cap also covers
  `synapse/config/jwt.py`'s use of `authlib.jose.rfc7519.jwt.prepare_raw_key`,
  a module-level helper outside authlib's documented API.
- `poetry.lock`: `poetry lock --no-update` under poetry 1.3.2. authlib 1.6.12 to
  1.9.1, and `joserfc` 1.7.7 is added (authlib 1.7+ requires `joserfc>=1.6.8`
  and `cryptography>=45.0.1`; the lock already has cryptography 50.0.2). The
  file hashes are the ones upstream's lock carries. Nothing else moved apart
  from `content-hash`.
- `tests/handlers/test_oidc.py` (`test_map_userinfo_to_user`): the integer
  `sub` case now arrives from the userinfo endpoint
  (`_user_profile_method = "userinfo_endpoint"`, `scope=""`, so the fake
  provider issues no id_token), as in upstream. An integer id from the
  userinfo endpoint (GitHub-style OAuth2) still maps when the provider sends
  no id_token: scopes without `openid`, or a plain OAuth2 provider. With the
  `openid` scope the provider's id_token carries the same `sub`, and
  `oidc.py` validates any id_token it is sent, even with
  `user_profile_method: userinfo_endpoint`, so that login is refused with
  `invalid_token` (qualified after the third review; this bullet said the
  integer id "still maps" without the condition).
- Behaviour change (corrected 2026-10-30; the first version of this entry
  named the integer `sub` alone). Since 1.7.0 authlib validates an id_token's
  registered claims with joserfc, which type-checks each one present (RFC
  7519). An id_token is now refused with `invalid_token` when its `sub` or
  `jti` is not a string, or when its `aud` is neither a string nor a list of
  strings (`["<client_id>", 5]` is refused even with a matching `azp`). A
  non-string `iss` is refused too, as it was before, because `oidc.py` always
  checks `iss` against the issuer. No probe case that 1.6.12 refused is
  accepted by 1.9.1 (the record lists them).
- Behaviour change in JWT login (`synapse/handlers/jwt.py`) and the
  back-channel logout token (corrected after a second review; this entry used
  to say both were unchanged). They validate with authlib.jose's `JWTClaims`,
  not joserfc, so an integer `jti` is still accepted. But since 1.9.0 a
  boolean `exp`, `nbf` or `iat` is refused in both; 1.6.12 accepted
  `iat: true` and `nbf: true`. And authlib's `OctKey` now refuses an HMAC key
  that contains `-----BEGIN `, `---- BEGIN `, `ssh-rsa `, `ssh-dss `,
  `ssh-ed25519 ` or `ecdsa-sha2-` anywhere (1.9.0; 1.6.12 checked only the
  start), or that is empty (1.9.1). It raises `ValueError`, which `jwt.py`
  does not catch, so with such a `jwt_config.secret` every JWT login
  answered 500. The fork now refuses that secret at startup: see "2026-10-30
  JWT login refuses an HMAC secret authlib cannot use" below.
- Behaviour change in MSC3861's client assertions (recorded after the third
  review). authlib 1.9.1 signs `client_secret_jwt` and `private_key_jwt`
  assertions with joserfc, which refuses a JWK whose `alg` is not the
  assertion's RS256; 1.6.12 ignored `alg`. A homeserver with such a JWK
  started and answered every authenticated request with 503. joserfc also
  refuses to sign with an empty `client_secret`, but that path never ran:
  `MSC3861DelegatedAuth` asserts the secret is truthy, so such a homeserver
  stopped during setup on either version. The fork now refuses both when the
  config loads: see "2026-10-30 MSC3861 refuses a client credential that
  cannot sign" below. A `client_secret` that starts with `-----BEGIN ` and
  does not parse as a key goes the other way: 1.6.12 refused to sign with it,
  and 1.9.1 signs with it and emits joserfc's `SecurityWarning`. It is this
  homeserver's own secret for signing its requests, not a key it verifies
  tokens with, so that was left.
- `synapse/api/auth/msc3861_delegated.py` (`PrivateKeyJWTWithKid.sign`,
  recorded after the fifth review, 2026-10-31): annotated `-> str`, was
  `-> bytes`. From 1.7.0 both MSC3861 signers (`private_key_jwt_sign` here,
  authlib's own `ClientSecretJWT.sign`) return joserfc's `jwt.encode` result,
  a `str`; 1.6.12 returned `bytes`. The one consumer, authlib's
  `ClientSecretJWT.__call__`, adds the value to a `str` request body either
  way, so no behaviour changed. mypy could not see it: `mypy.ini` ignores
  authlib's types (`[mypy-authlib.*]`).
- Behaviour change in provider metadata validation (`_validate_metadata` in
  `synapse/handlers/oidc.py`, recorded after the second review). authlib
  1.8.0 rewrote `is_secure_transport`, which `validate_issuer`,
  `validate_authorization_endpoint`, `validate_token_endpoint` and
  `validate_jwks_uri` use. 1.6.12 accepted `https://` and the prefixes
  `http://localhost:` and `http://127.0.0.1:`. 1.9.1 accepts `https://` with
  a host, and `http://` to any loopback host, with or without a port
  (`http://localhost/`, `http://127.0.0.1/`, `http://[::1]:8080/`). An
  `https://` URL with no host is now refused. Only loopback hosts are
  loosened, so no fork check was added.
- The id_token checks in `synapse/handlers/oidc.py`, which this entry does not
  change: the signature, with whatever algorithms the provider lists in
  `id_token_signing_alg_values_supported`, so an unsigned id_token passes when
  the list has `none` (OIDC allows that for a token fetched from the token
  endpoint); `iss` against the issuer; `exp`, `nbf` and `iat` with 120 s of
  leeway; `nonce`; `at_hash`. `aud` is checked only through authlib's `azp`
  rule: when `aud` is anything but this client id (or a one-element list of
  it), `azp` must equal the client id, and when it does, `aud` is not
  compared at all. OIDC Core 3.1.3.7 step 3 asks for that comparison; neither
  authlib version makes it, and upstream does not ask for it. The record says
  why neither gap was patched here.
- Tests added in the fork's own directory on 2026-10-30, after the bump,
  because the two paths joserfc rewrote had no test. They use helpers from
  `tests/handlers/test_oidc.py`, `tests/handlers/test_oauth_delegation.py`
  and `tests/test_utils/oidc.py`; check them after any sync that touches
  those.
  - `tests/blackout_runtime/test_oidc_claim_types.py`: an id_token with an
    integer `sub`, an integer `jti`, or `aud: ["<client_id>", 5]` with a
    matching `azp`, renders `invalid_token`; a string `jti` still logs in.
    These fail under authlib 1.6.12, which accepted all three.
  - `tests/blackout_runtime/test_msc3861_client_assertion.py`: sends an
    MSC3861 introspection request with `private_key_jwt` and with
    `client_secret_jwt`, and checks the posted assertion without authlib: the
    RS256 or HS256 signature, `kid`, `iss`, `sub`, `aud`, `jti` and the
    3600 s lifetime. They pass under 1.6.12 and 1.9.1 because their JWK has
    no `alg` member; with `"alg": "RS512"` 1.9.1 does not sign at all (see the
    MSC3861 entry below, which adds those cases). Upstream has removed
    experimental MSC3861 (its config now refuses
    `experimental_features.msc3861`), so an upstream sync brings no coverage.

## 2026-10-30 back-channel logout refuses unsigned logout tokens

A fork patch with no upstream counterpart: element-hq/synapse `develop` at
`cc172f7` (2026-10-30) still passes the provider's list unchanged. Record:
`docs/security/dependency-advisories-server-desktop-2026-10-30.md` (repository
root).

- `synapse/handlers/oidc.py` (`OidcProvider.handle_backchannel_logout`): `none`
  is dropped from the provider's `id_token_signing_alg_values_supported`
  before the logout token is verified, as OIDC Back-Channel Logout 1.0 sec.
  2.6 step 2 requires ("an alg with the value none MUST NOT be used for Logout
  Tokens"). Before this, when a provider listed `none` (OIDC Discovery allows
  it for ID tokens in the code flow), anyone could POST an unsigned logout
  token to `/_synapse/client/oidc/backchannel_logout` and end any session
  whose `sid` they knew. When the provider lists only `none`, every logout
  token is now refused. ID token verification is unchanged.
- `tests/blackout_runtime/test_backchannel_logout_alg.py`: an unsigned logout
  token is refused when `none` is listed, and a signed one still ends the
  session; with only `none` listed, both are refused. Both tests fail on the
  code before this patch. The file sits in the fork's own test directory but
  uses helpers from `tests/rest/client/test_auth.py` and
  `tests/test_utils/oidc.py`, so check it after any sync that touches those.

## 2026-10-30 back-channel logout answers 400 for a key authlib cannot use

A fork patch with no upstream counterpart (element-hq/synapse `develop` at
`cc172f7` catches only `JoseError` here). Recorded after the second review of
`docs/security/dependency-advisories-server-desktop-2026-10-30.md` (repository
root).

- `synapse/handlers/oidc.py` (`OidcProvider.handle_backchannel_logout`):
  `except (JoseError, ValueError)` where it was `except JoseError`. authlib
  raises `ValueError`, not a `JoseError`, when it cannot use a key for the
  token: a `kid` the provider's JWKS lacks (`Invalid JSON Web Key Set`), or
  an HS\* header whose `kid` names an RSA or EC key
  (`Missing required field: "k"`). Anyone can POST such a token, and it
  escaped as a 500 with `M_UNKNOWN`. OIDC Back-Channel Logout 1.0 sec. 2.8 asks for 400 when the
  request is invalid or the logout failed. No session was ended before or
  after; the change is the status code.
- Not changed: `_verify_jwt` still reloads the JWKS once after any
  `ValueError` from the first decode, so each such token makes one request to
  the provider's `jwks_uri`, and each invalid token still logs a traceback
  (`logger.exception`). The record says why that was left.
- `tests/blackout_runtime/test_backchannel_logout_alg.py`
  (`test_logout_token_with_unusable_key_is_refused_with_400`): HS256 with the
  provider's EC `kid`, and HS256 and ES256 with an unknown `kid`, each get 400
  and leave the session alone; a signed token still ends it. The test fails
  on the code before this patch (500).

## 2026-10-30 JWT login refuses an HMAC secret authlib cannot use

A fork patch with no upstream counterpart (upstream's `synapse/config/jwt.py`
at `cc172f7` reads the secret and the algorithm verbatim). Recorded after the
second review of
`docs/security/dependency-advisories-server-desktop-2026-10-30.md` (repository
root), and rewritten after the third, which found that the first version
imported a string secret only and so missed a secret given as a JWK. Revised
again after the fourth (2026-10-31): `algorithm: none` is refused, and a key
set is no longer refused for one key HS\* cannot use. Revised after the fifth
(2026-10-31): a key-set member whose `kid` is not a string is refused, because
the fourth review's version tried only the string ones. Corrected after the
sixth (2026-10-31): this entry said no Blackout template enables
`jwt_config`, and one did; and the `kid` refusal is now said to refuse key
sets that `develop` serves.

- `synapse/config/jwt.py` (`JWTConfig._check_algorithm`, fourth review): when
  JWT login is enabled, `jwt_config.algorithm` must be one of the 14 JWS
  algorithms other than `none` that authlib registers
  (`JsonWebSignature.ALGORITHMS_REGISTRY`, the same in 1.6.12 and 1.9.1).
  Otherwise a `ConfigError` at `jwt_config.algorithm`. `JwtHandler` passes the one algorithm to
  `JsonWebToken([algorithm])`, and with `none` authlib accepts an unsigned
  token for any user, whatever the secret: the review logged in as
  `@anyone:test` that way under both versions. Any other name (`NONE`,
  `hs256`, a JWE algorithm such as `dir`, a typo) refused every token,
  because a JWE token would need its `enc` in the same one-entry list. A
  disabled `jwt_config` is not checked.
- `synapse/config/jwt.py` (`JWTConfig._check_hmac_secret`): when JWT login is
  enabled with HS256, HS384 or HS512:
  - a key-set member whose `kid` is present and is not a string (`5`,
    `true`, `null`, a list) is refused before any other key-set check, with
    a `ConfigError` at `jwt_config.secret` that names it by its index
    (`keys[1]`), whatever its key (fifth review). RFC 7517 sec. 4.5 makes
    `kid` a string. authlib picks a member with `k.get("kid") == kid`, the
    token header's value whatever its type, so a member under `kid: 5` is
    chosen by a token whose `kid` is `5`, and one under `kid: true` by `true`
    or `1`. The fourth review's version tried only the string `kid`s, so a
    zero-byte `k` (`AA`, which HMAC pads into the empty key) under `kid: 5`
    beside a usable key started, and a token with header
    `{"alg": "HS256", "kid": 5}` signed with the empty key logged in as any
    user. `develop`, on authlib 1.6.12, has no check and accepts the same
    config and token. Because the refusal goes by the `kid`'s type, it also
    refuses key sets that `develop` starts and serves (said after the sixth
    review): a strong `oct` key under `kid: 5`, a one-key set under
    `kid: null`, and strong keys under `kid: "a"` and `kid: 7` each load on
    `develop` under authlib 1.6.12 and 1.9.1, and `JwtHandler`'s call logs in
    with each `kid`; on this tree each stops at startup. That is kept on
    purpose, to fail closed: RFC 7517 makes `kid` a string, and the operator's
    fix is to quote it (`docs/upgrade.md`, "Upgrading to authlib 1.9.1");
  - an empty or missing secret (`""`, `null`, an empty mapping) is refused
    outright, on any authlib version, and so is a JWK with an empty `k`,
    alone or in a key set (fourth review; 1.9.1 refused it anyway, but
    1.6.12 verifies with it);
  - then the check makes `JwtHandler`'s own call,
    `JsonWebToken([algorithm]).decode(token, key=secret)`, with a token
    signed with the empty HMAC key. authlib prepares the secret as it does
    for each login: a mapping or `{...}` text is read as a JWK, and a key set
    is searched by `kid`. With every `kid` a string, a token reaches a member
    only by naming its `kid`, or, with no `kid`, when the member is the set's
    only key. So the check tries each distinct `kid` the set names, or no
    `kid` when it names none; a member without a `kid` beside named ones is
    never chosen, and is not tried. A key
    passes only when authlib reports a bad signature. A key that verifies
    the token works as the empty key, and refuses the whole secret. Any
    other exception (the `ValueError` authlib raises from 1.9.0 for a key
    holding PEM or SSH key text anywhere, an RSA or EC JWK, `use: enc`, an
    empty key set, JSON text that does not parse) becomes a `ConfigError` at
    `jwt_config.secret`, for a secret that is not a key set and for a key
    set none of whose keys can be used.
  - In a key set where some key can be used, a key that cannot is logged as
    a warning that names its `kid`, and the homeserver starts (fourth
    review). The handler serves the usable keys, and answers a token naming
    the other one with 500, as it did before the check. The third review's
    version refused such a set (`Missing required field: "k"` for an RSA or
    EC JWK beside an `oct` key), which stopped a homeserver that `develop`
    starts and serves.
- Before this, under authlib 1.9.1, such a homeserver started and answered
  every JWT login with 500; under 1.6.12 an empty secret, or a JWK with an
  empty `k`, accepted tokens anyone could sign (GHSA-8m4g-j4wp-wgcg). Under
  1.6.12 the check still refuses every empty-key form. PEM or SSH key text is
  refused wherever it appears only under the locked `>=1.9.1`; 1.6.12 refuses
  only a string secret that starts with it, and uses any other as an HMAC
  key. The secret of an asymmetric algorithm, and a disabled `jwt_config`,
  are not checked. Until the sixth review this bullet ended "No Blackout
  template enables `jwt_config`". One did, without meaning to:
  `services/blackout-server/homeserver.yaml.template` rendered
  `enabled: ${JWT_ENABLED:-false}` as a non-empty string, with the literal
  secret `${JWT_SECRET:-}`, which this check accepts. See "2026-10-31 JWT
  login refuses a non-boolean `enabled`; the Railway template's JWT login is
  off" below. (2026-11-02: that template was removed in `42f68f2`; see "2026-11-02
  the Railway template is removed".)
- `tests/blackout_runtime/test_jwt_secret_config.py`: eighteen refused
  secrets for each of HS256, HS384 and HS512, among them a JWK mapping and
  JWK JSON text with an empty `k` or a PEM `k`, and key sets with an empty
  `k` or a zero byte beside a usable key, with no usable key, or of two
  keys without a `kid`; five accepted ones (a plain secret, a JWK mapping,
  JWK JSON text, a two-key set, a one-key set without a `kid`); two mixed
  sets (an `oct` key beside an EC public JWK, or beside an `oct` key whose
  `key_ops` allow only `sign`) accepted with one warning naming the other
  key; eight refused algorithms (`none`, `NONE`, `hs256`, `dir`, `HS1024`,
  `""`, `null`, a list); a PEM for RS256, ES256, PS512 and EdDSA, and an
  empty secret with JWT login disabled (`HS256` or `none`), still parse;
  `/login` with each key of the accepted set returns 200; and with the
  EC-mixed set, the `oct` key logs in and a token naming the EC key does
  not. On the first version of this patch (`5bad47c`) the JWK forms were not
  refused, and the two-key set was (`Missing required field: "k"`), although
  the handler can use it. On the third review's version (`93d3024`) the
  algorithm test fails and the mixed-set tests error.
- Same file, fifth review: eight key sets with a non-string `kid` are refused
  for each algorithm, naming the member's index (`k` "AA" beside a usable
  key, under `kid: 5` or `kid: true` as a mapping, under `kid: 5` as JSON
  text, and under `kid: true` as a list; a usable key under `kid: 5`;
  `kid: null`; `kid: ["a"]`; and `kid: 5` after an empty `k`, which reports
  the `kid`, not the `k`).
  `JwtLoginWithNonStringKidTestCase`: for `kid: 5` (token `kid` 5) and
  `kid: true` (token `kid` true and 1), the config of a homeserver with that
  set does not load, so no homeserver starts with it; and the same `/login`,
  given that set, answers the empty-key token with 200 as `@mallory:test`,
  which is what the refusal stops. Both new tests fail on the fourth
  review's `config/jwt.py` (`d084e96`): no `ConfigError`.

## 2026-10-30 MSC3861 refuses a client credential that cannot sign

A fork patch with no upstream counterpart. Upstream removed experimental
MSC3861 in `v1.157.0` (2026-07-21), replacing it with
`matrix_authentication_service` and a shared secret; `develop` at `cc172f7`
refuses `experimental_features.msc3861`. Every upstream release up to
`v1.164.1` locks authlib 1.6.12 or older, and `develop` moved to 1.9.1 only
with `b20ae98` (2026-10-27), so upstream never ran MSC3861 under joserfc and
there is nothing to port. Recorded after the third review of
`docs/security/dependency-advisories-server-desktop-2026-10-30.md` (repository
root).

- `synapse/config/experimental.py` (`_check_private_key_jwk`, called from
  `MSC3861._check_client_auth_method` for `private_key_jwt`): a JWK whose
  `alg` is set and is not `RS256` is refused with a `ConfigError` at
  `experimental_features.msc3861.jwk`, on any authlib version.
  `PrivateKeyJWTWithKid.sign` (`synapse/api/auth/msc3861_delegated.py`)
  signs RS256, and from 1.7.0 authlib signs through joserfc, whose
  `Key.check_alg` refuses such a key. Then the check signs one assertion
  with `private_key_jwt_sign` and the same arguments `sign` passes, and turns
  any exception into the same `ConfigError`. That also refuses, on both
  versions, a JWK that is public only, is not RSA, or has `use: enc` or
  `key_ops` without `sign`, and one without a `kid` (`KeyError: 'kid'`:
  `sign` sends the `kid` header); none of them could ever sign. Before this, each
  of these let the homeserver start and then answer every authenticated
  request with 503 `Unable to introspect the access token`, the alg case
  under 1.9.1 only. Keep `_check_private_key_jwk` in step with
  `PrivateKeyJWTWithKid.sign`.
- Same validator: an empty `client_secret` is refused like a missing one
  (`not self.client_secret`, was `is None`) for `client_secret_post`,
  `client_secret_basic` and `client_secret_jwt`. `MSC3861DelegatedAuth`
  already asserted it truthy, so such a homeserver stopped during setup with
  `AssertionError: No client_secret provided`, on both authlib versions (run
  for `client_secret_jwt` and `client_secret_post`; `client_secret_basic`
  takes the same branch); it now stops with the config path. Under
  `python -O`, which no Dockerfile or deploy script in the tree sets, the
  assertion would be gone and authlib 1.9.1 would refuse to sign
  `client_secret_jwt` on every request.
- `tests/blackout_runtime/test_msc3861_client_assertion.py`: a JWK naming
  RS384, RS512, PS256 or ES256 is refused at `experimental_features.msc3861.jwk`;
  so are a public JWK, `use: enc`, `key_ops: ["verify"]` and an EC key; an
  RSA JWK with no `alg`, `alg: RS256`, `use: sig` or `key_ops: ["sign"]` is
  accepted; an empty secret is refused for each of the three methods; and
  an `alg: RS256`, `use: sig` JWK still sends a verified RS256 assertion.
  The alg and empty-secret refusals fail on the code before this patch.

## 2026-10-31 pyasn1 0.6.5 (four decoder advisories)

Edits outside `blackout_runtime/` for four High pyasn1 advisories that GitHub
reviewed on 2026-10-30 between 23:03 and 23:07 UTC, after Trivy's database of
19:07 UTC, so the gate did not report them yet. Recorded in
`docs/security/dependency-advisories-server-desktop-2026-10-30.md` (repository
root). Upstream element-hq/synapse `develop` at `cc172f7` still locks 0.6.4,
so there was nothing to port; re-check both lines during any reconciliation.

- `pyproject.toml`: `pyasn1 = ">=0.6.5"` (was `>=0.6.4`). 0.6.5 (PyPI,
  2026-10-27) fixes GHSA-fm9c-5rcf-2q5p, GHSA-9m75-vc3g-4x39,
  GHSA-2qm8-x737-gmw5 and GHSA-mm57-4v3p-rchx: quadratic CPU in decoding
  schemaless containers, constructed strings, constructed BIT STRINGs and
  binary REALs. `service_identity` decodes each peer certificate's SRV-ID
  otherName with pyasn1's DER decoder and no schema, during the hostname
  check that Twisted and `synapse/crypto/context_factory.py` run after the
  certificate chain has validated.
- `poetry.lock`: `poetry lock --no-update` under poetry 1.3.2. pyasn1 0.6.4 to
  0.6.5, with the hashes PyPI lists, and `content-hash`. Nothing else moves;
  the image's `--extras all` export changes by that one package.
  `pyasn1-modules` 0.4.2 requires `pyasn1>=0.6.1,<0.7.0`.

## 2026-10-31 JWT login refuses a non-boolean `enabled`; the Railway template's JWT login is off

A fork patch with no upstream counterpart (upstream's `synapse/config/jwt.py`
at `cc172f7` reads `enabled` as given), and edits to Blackout's own Railway
service files, which upstream does not have. Found by the sixth review of
`docs/security/dependency-advisories-server-desktop-2026-10-30.md`
(repository root), which records the render.

2026-11-02: the template, its `.env.example` and the template test
(`test_railway_template_leaves_jwt_login_off`) described below were removed in
`42f68f2`, with the rest of the Railway service; the operator chose removal over
fixing the template. `JWTConfig._check_enabled` and
`test_non_boolean_enabled_is_refused` stay. See "2026-11-02 the Railway
template is removed" below.

- `services/blackout-server/homeserver.yaml.template`: `jwt_config` read
  `enabled: ${JWT_ENABLED:-false}` and `secret: "${JWT_SECRET:-}"`. The
  image `railway.toml` deploys renders this file at every start of the
  `managed` profile with `entrypoint.sh`'s plain `envsubst`, and gettext's
  `envsubst` expands only `$NAME` and `${NAME}`. Both stayed as text,
  whatever the environment held. YAML then gave `enabled` the string
  `${JWT_ENABLED:-false}`, which Synapse treats as on, and `secret` the
  string `${JWT_SECRET:-}`, which anyone can read in this file. The secret
  check this tree added on 2026-10-30 accepts it (it is not empty), and a
  token signed with it verifies, as any user.
  Two unrelated faults kept that from running. The same render leaves the
  listener's `port: ${PORT:-8008}` as text, and Synapse refuses the listener
  before it reads `jwt_config`:
  `Listener configuration is lacking a valid 'port' option`. And the
  service's `Dockerfile` exports the lock without extras, so authlib is
  not installed, and `check_requirements("jwt")` stops startup for any
  non-empty `jwt_config`, `enabled: false` included
  (`DependencyException ['authlib']`). Each fault alone stops startup, so
  JWT login opened to anyone who signs with the literal only once both were
  fixed, which making this service work needs. The template is the same on
  `develop`. It now writes `enabled: false` and
  `secret: "${SYNAPSE_JWT_LOGIN_SECRET}"`, under a comment, so no environment
  variable turns JWT login on; an operator who writes `enabled: true` gets
  `SYNAPSE_JWT_LOGIN_SECRET`'s
  value, or, when it is unset, an empty secret that the startup check
  refuses. Neither of the two faults is fixed here; the record lists every
  `${VAR:-default}` in the template, what it renders to, and what Synapse
  does with it. Only `jwt_config` was a security defect.
- `services/blackout-server/.env.example`: `JWT_ENABLED=false` is gone (no
  longer read), and `JWT_SECRET` is renamed `SYNAPSE_JWT_LOGIN_SECRET` and left
  empty, where it was `change-me`, with a
  comment saying when it is used.
- `synapse/config/jwt.py` (`JWTConfig._check_enabled`): `jwt_config.enabled`
  must be a YAML boolean, or absent (off). Anything else (a string such as
  `"false"` or `${JWT_ENABLED:-false}`, `null`, an empty value, a number) is
  a `ConfigError` at `jwt_config.enabled`, before the algorithm and secret
  checks, with the text
  `jwt_config.enabled must be true or false (a YAML boolean), not '${JWT_ENABLED:-false}'`.
  So a template that renders badly stops at startup instead of turning JWT
  login on. This refuses configs that `develop` starts: any non-empty
  string, `"false"` included, and `1` turned JWT login on there, and `null`,
  `""` and `0` left it off.
- `tests/blackout_runtime/test_jwt_secret_config.py`: seven `enabled`
  values are refused at that path (the `envsubst` text, `"false"`,
  `"true"`, `""`, `null`, `0`, `1`); `true`, `false` and a missing `enabled`
  load; and the template, rendered as `envsubst` renders it, has
  `enabled: false` with or without `JWT_ENABLED=true` in the environment.
  The test's `_envsubst` gave output byte-identical to gettext-base 0.21's
  `envsubst` for the old and the new template, each under two environments.
  On `05dfc10`'s `config/jwt.py` the refusal test fails (no `ConfigError`),
  and with `05dfc10`'s template the template test fails
  (`'${JWT_ENABLED:-false}' is not False`).

## 2026-10-31 operator notes for authlib 1.9.1

- `docs/upgrade.md`: a Blackout section, "Upgrading to authlib 1.9.1
  (2026-10-30)", above the other Blackout sections. It lists each
  configuration that now stops at startup (`jwt_config`, experimental
  MSC3861) or is refused at sign-in, with the error text and the fix, and
  the Railway template change, and points at the record. Upstream's
  `docs/upgrade.md` has no such section; keep it through a reconciliation.
  (2026-11-02: that Railway template section, and the managed-preflight and
  `BLACKOUT_PROFILE` sections, carry a dated note that the template and its
  entrypoint were removed in `42f68f2`.)

## 2026-11-02 the Railway template is removed

The operator chose on 2026-11-02 to remove the Railway service template
rather than fix it. In its `managed` profile, the one that renders the
template, its image could not start: `entrypoint.sh` rendered
`homeserver.yaml.template` with plain `envsubst`, which leaves every
`${VAR:-default}` as text, so the listener port rendered as `${PORT:-8008}`
and Synapse refused the config; and the image exported the lock without
extras, so with no authlib `check_requirements("jwt")` stopped it too. Its
JWT login, which the same render had turned on, was turned off in `48ab32d`
(the 2026-10-31 entry above). The removed files are Blackout's own and have
no upstream counterpart; `docs/upgrade.md` is an upstream file with Blackout
lines. `.dockerignore` and `README.rst`, also upstream files with Blackout
lines, were changed in `42f68f2` and are back as on `develop` (the restored
Nixpacks path below). (2026-11-02: `d88e884` takes the six lines and the
link out again; the next entry.) Record:
`docs/security/dependency-advisories-server-desktop-2026-10-30.md`
(repository root), "Found outside scope", item 5, and the section
"2026-11-02: the Railway template is removed". Outside this directory,
where an upstream sync does not reach, the branch also changes that record
and adds dated notes to `docs/audits/2026-08-10-encryption-audit.md` and
`docs/operations/evidence/2026-05-10-secrets-manager-inventory.md` (where
`lint-staged`'s Prettier also re-padded every list marker and table row:
the file was not Prettier-clean on `develop`, and only the note changes its
content); the record's section names both.

- Removed:
  - `railway.toml`: the Railway service (Dockerfile builder,
    `startCommand = "/entrypoint.sh"`).
  - `services/blackout-server/`: `Dockerfile`, `entrypoint.sh` (the
    `BLACKOUT_PROFILE` selection and the `managed` profile's `envsubst`
    render), `homeserver.yaml.template` and `.env.example`.
    `services/blackout-api/` stays.
  - `.github/workflows/blackout-image-lifecycle.yml`: its one job was
    written to build `services/blackout-server/Dockerfile` into
    `ghcr.io/<owner>/blackout-server`. GitHub registers workflows only from
    the repository root's `.github/workflows/`, and the repository's list
    (read on 2026-11-02, before and after a new workflow was registered
    that day) has none under `apps/`, so it never
    ran in this repository. Nor could this version have run anywhere: it
    does not parse as YAML (`ScannerError` at line 23, where a heredoc's body
    starts at column 1 inside a `run: |` block), and it was byte-identical
    from the fork's arrival in `e0f3065e31` (2026-04-10) to its removal.
    Whether an earlier version ran in the fork's former repository was not
    checked.
- Removed in `42f68f2` and restored in `d1936c9`, because they are not the
  template and do not exist only to build, deploy, document or test it:
  `scripts-dev/railway/start.sh`, `nixpacks.toml`, `docs/railway_deploy.md`,
  `README.rst`'s "Railway deployment" link to that how-to, and six
  `.dockerignore` lines (`!.nixpacks`, `!nixpacks.toml`, `!railway.json`,
  `!scripts-dev`, `!.nixpacks/**`, `!scripts-dev/**`). All five files are as
  on `develop` again, and they are left in place for the operator.
  (2026-11-02: the operator chose removal ("remove both"), and `d88e884`
  removed the three files again and took the six lines and the link out of
  the other two, `.dockerignore` and `README.rst`; the next entry.)
  - They are a separate Synapse-on-Railway path. `nixpacks.toml` sets
    Nixpacks' setup and install phases, and `start.sh` generates a config
    with `--generate-config` and patches its listener; neither reads the
    template or `railway.toml`. `docs/railway_deploy.md` gives `railway.json`,
    `nixpacks.toml` and `start.sh` as that path's configuration. No
    `railway.json` under this directory is in this repository's history, and
    `nixpacks.toml` has no start command, so nothing in the tree runs
    `start.sh`.
  - `DEPLOYMENT_CHECKLIST_REVIEW.md` says a "Railway config conflict" was
    "resolved (consolidated to `railway.toml`)", without naming the other
    file. Every one of these files, the template's included, arrived in
    `e0f3065e31`, so the tree does not say which path came first.
  - The six `.dockerignore` lines are one whitelist for a Nixpacks build.
    Nixpacks' source (`main` at `144b4f9ab1`,
    `src/nixpacks/builder/docker/docker_image_builder.rs` and
    `src/nixpacks/files.rs`) copies the app directory with no ignore filters
    and runs `docker build` on the copy, so Docker applies this
    `.dockerignore`, whose first rule is `*`. Without `!scripts-dev`, a
    Nixpacks build here would leave `start.sh` out of the image, so the
    restore brings back all six. Of the Dockerfiles built with this directory
    as the context, only the removed one copied `scripts-dev`. Four built
    with the repository root as the context copy all of `apps/`, and this
    file does not govern them: this directory's `Dockerfile` and, from the
    repository root, `Dockerfile.blackout`, `deploy/docker/Dockerfile` and
    `infra/single-server-baseline/Dockerfile.blackout-api-hono`. Whether
    Railway builds with that version of Nixpacks was not checked.
- `tests/blackout_runtime/test_jwt_secret_config.py`:
  `test_railway_template_leaves_jwt_login_off`, whose only subject was the
  template, is removed with it, and so are `RAILWAY_TEMPLATE`, `_envsubst`
  and the imports only they used (`re`, `Path`, `Mapping`, `yaml`): 15 tests
  become 14. `test_non_boolean_enabled_is_refused` stays, with its
  `${JWT_ENABLED:-false}` case: it pins `JWTConfig._check_enabled`
  (`synapse/config/jwt.py`), which stays and refuses that text from any
  template.
- `.dockerignore` and `README.rst`: as on `develop`, after the restore above.
  (2026-11-02: `d88e884` takes the six lines and the link out again.)
  `!services` and `!services/**` were not touched at any point:
  `infra/single-server-baseline/deploy.sh` builds
  `services/blackout-api/Dockerfile` with this directory as the context.
- Dated notes, not rewrites, where a document described the template or what
  it ran: `docs/upgrade.md` ("The Railway service template", and the
  managed-preflight and `BLACKOUT_PROFILE` sections),
  `docs/ops/blackout_profile_startup.md`,
  `docs/ops/managed_hosting_readiness.md`,
  `docs/ops/blackout_image_lifecycle.md`, `DEPLOYMENT_CHECKLIST_REVIEW.md` and
  its copy `docs/DEPLOYMENT_CHECKLIST_REVIEW.md`,
  `docs/development/phase0_railway_standalone_tracker.md`,
  `docs/development/blackout_feature_registry_update_tracker.md` (FR-002),
  `docs/railway_deployment_hardening.md`, `docs/bmc_server_execution_plan.md`,
  `docs/ops/release_candidate_rc1_2026-03-19.md` (an RC1 rollout of the
  removed image), `docs/reports/week3_packaging_image_lifecycle_completion_report_2026-03-19.md`,
  `docs/development/product_fork_execution_plan.md` (Week 3),
  `docs/development/product_fork_ai_prompts.md` (Phase 1),
  `release/train/changelog.md` (under "Runtime Defaults") and
  `release/train/checklist.md` (under "Upstream Diff Review"), and three
  entries above in this file (the 2026-10-30 JWT secret entry, and the two
  2026-10-31 entries on the template and the operator notes). The two
  release-train notes name `42f68f2` without backticks: the release gate
  (`synapse/util/release_train.py`) passes the changelog if any backticked
  commit hash is in it, and a backticked hash in the note would satisfy that
  check on its own. The only one in the changelog now is a 40-digit hash
  that the changelog itself calls a "placeholder tracking record", so that
  placeholder is what meets the check.
- Left in place for the operator to decide: `synapse/util/blackout_profiles.py`,
  `synapse/util/managed_hosting.py` and `synapse/util/hosting_smoke.py`, their
  tests under `tests/util/`, and `scripts-dev/blackout/managed_hosting_smoke.sh`,
  `ci_hosting_smoke.py` and `managed_readiness_integration_smoke.py`.
  `entrypoint.sh` was the only runtime caller of the first two; the tests,
  `synapse/util/hosting_smoke.py` and the smoke scripts call them
  (`ci_hosting_smoke.py` through `hosting_smoke.py`). (2026-11-02: the
  operator chose removal ("remove both"), and `9493f41` removed all of them,
  with their 13 tests and the two `release-train-gate.yml` steps written to
  run two of the scripts; the next entry.)
- Kept as written, as records: `release/train/image_provenance.json`, which
  names the `blackout-image-lifecycle` workflow as the builder of the RC1
  image (the RC1 record's statement, not evidence of a run; it is JSON, and
  the release gate reads its fields); and the next-step prompt in
  `docs/reports/phase6_ci_release_hardening_completion_report_2026-03-19.md`
  that asked for that workflow.
- The other Railway paths are not this template and stay: the Nixpacks path
  above, `services/blackout-api/railway.toml` (the legacy FastAPI service)
  and, outside this directory, the client's `railway.json`, `README.md`'s
  "Deploy to Railway", the "Deploy to Railway" step in
  `.github/workflows/deploy-web.yml`, `infra/railway/`, and the Railway
  section of `docs/deployment/production.md`. None of them names a removed
  file. `infra/railway/README.md` and `docs/deployment/production.md` put a
  Railway service at `apps/blackout-server`, where `railway.toml` was and
  `nixpacks.toml` and this directory's `Dockerfile` still are. Railway's
  documentation (read on 2026-11-02) says the config file "does not follow
  the Root Directory path", so a service rooted here read `railway.toml`
  only if its settings gave that path; that Railway looks for a `Dockerfile`
  at the root of the source directory; and that it "will always build with
  a Dockerfile if it finds one". By those pages, a service rooted here with
  no `railway.toml` builds this directory's `Dockerfile` unless its settings
  name another (`RAILWAY_DOCKERFILE_PATH`), as it already did before the
  removal if it never read `railway.toml`. The pages do not say where the
  default config-file lookup happens; if it is the repository root, such a
  service may read the root `railway.json` (the client's) instead. Not
  checked. That `Dockerfile` is the
  `@blackout/api` Node image, written for the repository root as its
  context: its first `COPY` names `pnpm-lock.yaml`, `pnpm-workspace.yaml`
  and `turbo.json`, and none of them is in this directory. `nixpacks.toml`
  is read only by a Nixpacks build, and has no start command. Whether a
  service set to Nixpacks would still take the `Dockerfile` was not checked,
  and the live service's settings are not in the tree and were not checked.
  (2026-11-02: the Nixpacks path, `nixpacks.toml` with it, was removed in
  `d88e884`; the operator chose removal. The other paths in this bullet are
  unchanged and still the operator's, and of the two files said to be here,
  only this directory's `Dockerfile` is.)
- Corrections to commit messages on this branch, which are not amended:
  - `42f68f2` removes `start.sh` and `nixpacks.toml`, "the earlier
    Synapse-on-Railway path", with `docs/railway_deploy.md`, its how-to;
    `d1936c9` restores all three, and "earlier" is not known. It drops
    `!scripts-dev` because only the removed `Dockerfile` copied
    `scripts-dev`, which holds only for Dockerfiles built with this
    directory as the context, and the six lines are one Nixpacks whitelist
    (above). Its "so it never ran", of the lifecycle workflow, holds for
    this repository, as `bacd26c` says, and its "whose one job built that
    Dockerfile" means the job was written to build it.
  - `b39883a` says all four of FR-002's evidence targets are gone and that
    no Railway path for the Synapse homeserver remains. Two of the four
    (`railway.toml`, `services/blackout-server/Dockerfile`) are gone; the
    other two are the restored Nixpacks path, and `d1936c9` corrects the
    four notes that said so. (2026-11-02: since `d88e884` none of the four
    is in the tree, and no file in it configures Railway to build or start
    the Synapse homeserver.)
  - `bacd26c` and `c83dc9b` also call the Nixpacks files "the earlier" and
    "an earlier" Synapse-on-Railway path. `bacd26c` says the entry "now
    says only what docs/railway_deploy.md and the checklist review say"; the
    entry it left read the review's "consolidated to `railway.toml`" as a
    `railway.json` consolidated away, which the review does not say, and it
    quotes the review now.
  - The RC1 rollout page's `scripts-dev/` smoke commands, said to run in
    the removed image only because its `Dockerfile` copied `scripts-dev`,
    were in `bacd26c`'s note on that page, not in its message. `d1f1589`
    corrected the note, which now says why they could not run there. So
    `d1f1589`'s "bacd26c's message makes the same claim" and "corrects
    bacd26c's two claims: the RC1 smoke commands", and `4d60ec0`'s
    "bacd26c: the RC1 smoke commands", are wrong.
  - `c83dc9b`'s subject says every passage of the record on the template
    has its dated note. One, the full-suite bullet's sentence on the sixth
    round under Validation, had none until the commit after `4d60ec0`.
  - `d1936c9`'s "That holds for the Dockerfiles in the tree" holds only for
    those built with this directory as the context, and this
    `.dockerignore` does not start with `*`: its first line is a comment,
    and `*` is its first rule.
  - `d1f1589` says the release gate "checks only for files, headings and
    provenance fields", then two sentences later that it also checks for a
    backticked commit hash. It also says the image lifecycle note said
    "never ran" two sentences after "built"; it was the next sentence.
  - `4d60ec0` says the record now says what a Railway service at
    `apps/blackout-server` would read. That account left out this
    directory's `Dockerfile` (above).

## 2026-11-02 the Nixpacks path and the hosting helpers are removed

The operator decided on 2026-11-02 ("remove both") to remove the two things
the entry above left for them: the fork's separate Nixpacks path for
Railway, and the profile and managed-hosting helpers that the removed
`entrypoint.sh` called at startup. The removed files are Blackout's own and
have no upstream counterpart. `README.rst` and `.dockerignore` are upstream
files with Blackout lines, and only Blackout lines leave them. Record:
`docs/security/dependency-advisories-server-desktop-2026-10-30.md`
(repository root), section "2026-11-02: the Nixpacks path and the hosting
helpers are removed".

- Removed in `d88e884`, the Nixpacks path: `nixpacks.toml`,
  `scripts-dev/railway/start.sh` (`scripts-dev/railway/` goes with it),
  `docs/railway_deploy.md`, `README.rst`'s "Railway deployment" link to that
  how-to, and the six `.dockerignore` lines the entry above restored
  (`!.nixpacks`, `!nixpacks.toml`, `!railway.json`, `!scripts-dev`,
  `!.nixpacks/**`, `!scripts-dev/**`). `.dockerignore` and `README.rst` are
  now as `42f68f2` left them. `!services` and `!services/**` stay:
  `infra/single-server-baseline/deploy.sh` builds
  `services/blackout-api/Dockerfile` with this directory as the context.
  The tree builds four Dockerfiles with this directory as the context,
  and none of them copies `scripts-dev`, `.nixpacks`,
  `nixpacks.toml` or `railway.json`: `services/blackout-api/Dockerfile`
  (`deploy.sh`), `docker/Dockerfile` (`deploy.sh`,
  `scripts-dev/complement.sh` and upstream's
  `contrib/docker/docker-compose.yml`), and `docker/Dockerfile-workers` and
  `docker/editable.Dockerfile` (`scripts-dev/complement.sh`). Their `COPY`
  lines name only `services/blackout-api/`, files under `docker/`,
  `synapse`, `rust` and the root build files (`pyproject.toml`,
  `poetry.lock`, `README.rst`, `build_rust.py`, `Cargo.toml`, `Cargo.lock`).
  No other build in the tree uses this file:
  `scripts-dev/build_debian_packages.py` builds
  `docker/Dockerfile-dhvirtualenv` with `docker/` as the context,
  `complement.sh` builds `docker/complement/Dockerfile` with
  `docker/complement/`, and builds with the repository root as the context
  use the root's `.dockerignore`. A Railway service rooted here (the
  dashboard was not read) would build with it too. By the entry above's
  reading of Railway's documentation, such a service builds this
  directory's `Dockerfile` unless its settings name another. That
  `Dockerfile`'s `COPY` lines name `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `turbo.json`, `apps`, `packages` and
  `deploy/docker/backend/bin`, and neither it nor the four above copies a
  file the six lines let in. A Nixpacks build here is the build those lines
  were for, and it does change (below).
- Removed in `9493f41`, the helpers: `synapse/util/blackout_profiles.py`
  (`determine_profile`, `get_missing_managed_env_vars`,
  `apply_profile_overrides` and its `python -m` command),
  `synapse/util/managed_hosting.py` (`run_readiness_checks`,
  `run_verification_hooks`, `check_health_endpoint` and the `python -m`
  commands `readiness`, `run-hooks` and `health`) and
  `synapse/util/hosting_smoke.py` (`run_hosting_smoke_checks`), and the three
  scripts that call them: `scripts-dev/blackout/managed_hosting_smoke.sh`,
  `scripts-dev/blackout/ci_hosting_smoke.py` and
  `scripts-dev/blackout/managed_readiness_integration_smoke.py`.
  `scripts-dev/blackout/` keeps its other five scripts. Before the removal
  nothing outside these files and the tests below imported a helper or ran
  one of these files, except the two `release-train-gate.yml` steps below:
  not `synapse/` outside them, `blackout_runtime/`, `docker/`, `services/`,
  the repository root's `deploy/`, `infra/`, TypeScript packages or root CI
  (`git grep` by path, module name, every exported name, the `python -m`
  form, the environment variables they read and the `[managed-hosting]` log
  prefix). `managed_hosting.py`'s `nosemgrep` for
  `dynamic-urllib-use-detected` (the 2026-10-11 entry) goes with the file.
- Tests removed in `9493f41`, 13, each in a module whose only subject is a
  removed helper:
  - `tests/util/test_blackout_profiles.py`, 7:
    `BlackoutProfileSelectionTestCase`'s
    `test_explicit_profile_is_deterministic`,
    `test_auto_falls_back_to_standalone_when_managed_deps_missing` and
    `test_auto_selects_managed_when_dependencies_present`, and
    `BlackoutProfileConfigMutationTestCase`'s
    `test_profile_overrides_keep_client_and_federation_resources`,
    `test_standalone_overrides_for_sqlite_and_health_listener`,
    `test_constrained_adds_conservative_defaults` and `test_cli_smoke`.
  - `tests/util/test_managed_hosting.py`, 5, all
    `ManagedHostingReadinessTestCase`:
    `test_readiness_passes_when_dependencies_are_reachable`,
    `test_readiness_returns_fail_fast_diagnostics`,
    `test_optional_hook_failure_warns_but_does_not_error`,
    `test_required_hook_failure_errors` and
    `test_health_endpoint_failure_returns_message`.
  - `tests/util/test_hosting_smoke.py`, 1:
    `HostingSmokeTestCase.test_hosting_smoke_checks_pass`.
- `.github/workflows/release-train-gate.yml` (job
  `verify-release-train-artifacts`), in `9493f41`: the steps "Run hosting
  profile smoke checks" (`ci_hosting_smoke.py`) and "Run managed readiness
  integration smoke" (`managed_readiness_integration_smoke.py`, with its
  `DATABASE_*`, `REDIS_*` and `BLACKOUT_READINESS_*` variables) are removed,
  and so is the job's `services` block (`postgres:16`, `redis:7`), which
  only the second step used. GitHub registers workflows only from the
  repository root's `.github/workflows/`, and the repository's list (34
  workflows, read on 2026-11-02 and again on 2026-11-08) has none under
  `apps/`, so this job has never run in this repository: the edit keeps
  the file from naming removed scripts and changes no CI run. That none of
  its steps runs in CI is older than this change.
- Of the four steps left after `pip install .`, two check something: the
  release-train gate (`scripts-dev/check_release_train_gate.py`, which
  reads `release/train/`) and the tracker evidence validator
  (`scripts-dev/blackout/validate_tracker_evidence.sh`, which reads the
  documents it lists). The other two check nothing, as written. Found on
  2026-11-02; both are older than this change and are not fixed here:

  - The divergence-marker gate (`scripts-dev/check_divergence_markers.py`)
    takes its paths from `git diff --name-only`, which prints them from the
    repository root (`apps/blackout-server/synapse/...`).
    `synapse/util/divergence_guardrails.py` matches them with `startswith`
    against prefixes that begin at `synapse/`, so no path in this
    repository is ever risky, and the gate passes on any change, a change
    to `synapse/federation/` included.
    `validate_risky_changes_have_markers` returns no error for
    `apps/blackout-server/synapse/federation/federation_server.py` and an
    empty checklist, and the missing-heading error for the same path
    without `apps/blackout-server/`. On a checkout of depth 1,
    `actions/checkout@v4`'s default, the script's two diffs both fail and
    it checks an empty list: in a `git clone --depth 1` of this branch,
    `git diff --name-only origin/develop...HEAD` and `HEAD~1..HEAD` each
    exit 128, and the gate prints its pass (checked on 2026-11-08). So the
    job as written would pass even if the paths matched.
  - The protocol smoke (`test_versions_smoke_compatibility`) runs
    `python -m pytest` after only `pip install .`. pytest is not a
    dependency in `pyproject.toml` and has no package entry in
    `poetry.lock` (the name appears there only inside other packages'
    optional extras, which `pip install .` does not install), so the job
    never installs the pytest the step needs.

  Fixing either changes files outside `blackout_runtime/` (the divergence
  gate's script, for example with `git diff --relative`, and the job's
  checkout depth; the workflow, to install pytest) and needs its own
  entry. Both are left for the operator.

- Not changed, because none of them reads a removed file:
  `scripts-dev/check_release_train_gate.py` and
  `synapse/util/release_train.py` (they read `release/train/`),
  `scripts-dev/check_divergence_markers.py`,
  `scripts-dev/blackout/validate_tracker_evidence.sh` and the root workflow
  that runs it, `mypy.ini` and `pyproject.toml` (they name `scripts-dev/`
  and `tests/` as directories), and the root feature registry and its guard.
- Dated notes, not rewrites, where a document said these files stay or
  remain, or describes what they did: `docs/upgrade.md` (the managed-preflight
  and `BLACKOUT_PROFILE` sections), `docs/ops/managed_hosting_readiness.md`,
  `docs/ops/blackout_profile_startup.md`,
  `docs/ops/release_candidate_rc1_2026-03-19.md`,
  `docs/development/product_fork_ai_prompts.md` (Phases 1 and 4),
  `docs/development/product_fork_execution_plan.md` (Weeks 2 and 6, and the
  backlog),
  `docs/reports/phase6_ci_release_hardening_completion_report_2026-03-19.md`,
  `docs/reports/week3_packaging_image_lifecycle_completion_report_2026-03-19.md`,
  `docs/railway_deployment_hardening.md`, `docs/bmc_server_execution_plan.md`,
  `docs/development/phase0_railway_standalone_tracker.md`,
  `docs/development/blackout_feature_registry_update_tracker.md` (FR-002),
  `release/train/checklist.md` and `release/train/changelog.md`, and seven
  passages in this file: the 2026-10-11 Semgrep entry's comment-only list,
  and six in the entry above (its opening paragraph, what it restored,
  `.dockerignore` and `README.rst`, what it left in place, the other Railway
  paths, and its correction of `b39883a`). The two release-train
  notes name `9493f41` without backticks, for the reason the entry above
  gives: the release gate passes the changelog on any backticked commit
  hash, so a backticked hash in a note would meet that check on its own.
  Outside this directory, where an upstream sync does not reach, the record
  named above and `docs/security/semgrep-triage-2026-10-11.md` get dated
  notes.
- Out of scope, unchanged, and still the operator's: the client's root
  `railway.json` and `index.js`, `README.md`'s "Deploy to Railway", the
  Railway step in `.github/workflows/deploy-web.yml`, `infra/railway/`, the
  Railway section of `docs/deployment/production.md`,
  `services/blackout-api/railway.toml` and the live Railway dashboard. None
  of them names a removed file. The dashboard was not read: a Railway service
  rooted here changes with this only if its settings force a Nixpacks build
  or name `start.sh` as its start command. The tree points to neither
  (`infra/railway/README.md` gives `pnpm --filter @blackout/server start`),
  unless such a service reads the repository root's `railway.json`, the
  client's, whose builder is `NIXPACKS`. Whether it does is the question the
  entry above leaves open, and it was not checked; so is whether a service
  set to Nixpacks still takes this directory's `Dockerfile`. If such a
  service builds with Nixpacks, that build loses this directory's
  `nixpacks.toml` and the six `.dockerignore` lines with `d88e884`, and
  what it does now was not checked.
- Corrections to commit messages on this branch, which are not amended:
  `d88e884` calls `docker/Dockerfile` "the other one with this directory as
  the context", as if there were two such Dockerfiles. There are four, the
  two `scripts-dev/complement.sh` builds included (above), and none of them
  copies the files the six lines let in, so its conclusion holds.
  `d88e884` also says a Railway service rooted here changes only if its
  settings force Nixpacks or name `start.sh`, pointing to
  `infra/railway/README.md`, and leaves out the root `railway.json`, whose
  builder is `NIXPACKS` (above). `9493f41`'s subject calls all three helpers
  the ones the removed entrypoint called. It called `blackout_profiles.py`
  and `managed_hosting.py`, as the body says, and `hosting_smoke.py` checks
  those two. Its body also says the steps left in `release-train-gate.yml`
  still check something, naming the divergence markers and the protocol
  smoke; only the release-train gate and the tracker evidence validator do
  (above). And it says the removed tests ran "in the fork's unregistered
  tests.yml". They were written to run there, in its
  `poetry run trial --jobs=6 tests` step, but GitHub has never registered
  that workflow in this repository, so here nothing but a hand run ran
  them. Whether it ran them in the fork's former repository was not
  checked.

## 2026-11-02 Twisted 26.10.0 (seven advisories; zope-interface 8.7)

Edits outside `blackout_runtime/` that lock the Twisted release which fixes
the four High advisories `.trivyignore` carried against 26.4.0 until this
change (GHSA-3476-c5c2-fr73, GHSA-53xc-49m8-p798, GHSA-cwm5-jh59-mwxr,
GHSA-vpp8-g58w-m8mp) and the Moderate and Low ones GHSA-q7qq-6mhp-9rc4,
GHSA-2qrf-pqgx-qh9v and GHSA-jj36-9pvh-vj5r. Recorded in
`docs/security/dependency-advisories-twisted-2026-11-02.md` (repository root).
Upstream element-hq/synapse `develop` at `cc172f7` still locks Twisted 26.4.0
and zope-interface 8.2, so there was nothing to port; during a reconciliation
keep whichever Twisted is newer, and keep zope-interface at 8 or above (26.10.0
requires `zope-interface>=8`).

- `pyproject.toml`: `Twisted = {extras = ["tls"], version = ">=26.10.0"}` (was
  `>=26.4.0`), and its comment names the seven advisories.
- `poetry.lock`: `poetry lock --no-update` under poetry 1.3.2. Two packages
  move and nothing else changes: twisted 26.4.0 to 26.10.0 (its wheel and
  sdist hashes match PyPI's) and zope-interface 6.0 to 8.7, which 26.10.0's
  `zope-interface>=8` forces (all 50 file hashes match PyPI's; the
  `setuptools = "*"` dependency of the 6.0 entry goes, since 8.0.1 removed
  it; setuptools 84.2.1 stays in the lock for setuptools-rust, zope-event and
  zope-schema). 151 packages before and after. The hashless export,
  `poetry export --extras all --without-hashes`, differs in three
  requirement entries, `twisted`, `twisted[tls]` and `zope-interface` (two
  packages); the image's export, which carries hashes, also changes those
  entries' `--hash` lines (94 changed lines in all). The fork uses
  `zope.interface`'s `implementer`, `provider` and `Interface` only.
- No fork code changed for the bump itself; one fork comment did (the next
  bullet). 26.10.0's removals and behaviour changes were read against the
  fork: `tcp.Connection` now ignores
  a non-None return from `dataReceived` (`synapse/http/connectproxyclient.py`
  returns the wrapped protocol's own return, which is None, as upstream's
  file does); `LoggingFile.fileno()` raises `io.UnsupportedOperation` instead
  of returning -1 (`synapse/app/_base.py` installs `LoggingFile` on stdout
  and stderr; nothing in the fork calls `fileno()` on them); `SSHSession`
  accepts one shell, exec or subsystem request per channel (the manhole's
  `TerminalRealm` uses it; probed on a running homeserver from this branch, a
  second shell request on one channel is refused and logged under 26.10.0
  and accepted under 26.4.0; ordinary SSH clients send one); the manhole's
  SSH server now offers the hybrid post-quantum key exchange
  `mlkem768x25519-sha256` first (#12520), which OpenSSH clients from 9.9 on
  negotiate with it by default (9.9 lists it after two sntrup761x25519 names
  that Twisted does not implement, 10.0 lists it first; worked out from their
  `myproposal.h` and Twisted's selection rule, not run with an OpenSSH
  client). Twisted's own client, used by the tests, does not offer it;
  asyncssh offering only that algorithm got a manhole shell under 26.10.0,
  and 26.4.0 does not offer it. The removed
  `PotentialZombieWarning`, `_makeGetterFactory`, `ThreadedResolver`,
  `dns.Message` class attributes and `IProcessProtocol` without
  `processExited` are not used.
- `synapse/handlers/send_email.py`: the comment over the `ESMTPSenderFactory`
  call said "the minimum Twisted is 26.4.0", fork text from the 2026-10-25
  relock (upstream's file has no such comment), untrue once the floor is
  26.10.0. It now says the fork's Twisted floor (`pyproject.toml`) is far
  above 21.2, without naming a version, so a later bump cannot make it stale.
  Comment only.
- `synapse/util/manhole.py` (`_ephemeral_rsa_key`), found by the review of
  this change's first round and fixed in commit `20362e4`, separate from the
  lock and ignore commits (it also carries the record's second-round
  corrections):
  `Key(keyObject)` in
  place of `Key.fromCryptographyKey(...)`, a method
  `twisted.conch.ssh.keys.Key` has never had (26.4.0 and 26.10.0 both offer
  `fromFile`, `fromString` and the constructor, which takes a cryptography
  key). Since the 2026-09-13 SAST triage replaced upstream's hardcoded
  manhole host key with a generated one, a homeserver with a `type: manhole`
  listener without a configured key pair (either path unset) raised
  AttributeError in
  `start_listening` and never came up (`synapse.app._base - 267 - CRITICAL -
Error during startup`), under either Twisted; a configured key pair never
  reached the helper. That file's divergence from upstream (the removed key,
  the generated one, the startup warning;
  `docs/security/semgrep-triage-2026-09-13.md`) had no entry here until now.
  Keep both the generated key and this constructor through a reconciliation:
  upstream still ships the hardcoded key. Tests:
  `tests/blackout_runtime/test_manhole.py` (the helper's key, the factory's
  matching pair, a configured pair passed through unchanged, and a real SSH
  session over loopback TCP: password authentication, pty, shell, an
  expression evaluated in the manhole namespace), passing under 26.4.0 and
  26.10.0 and erroring with the AttributeError against the file before the
  fix.
- `synapse/util/manhole.py` (`manhole`), found by the review of the fourth
  round: the generated pair replaced both halves whenever either was unset,
  and logged "no ssh_priv_key_path configured" even when it was. Now a
  configured private key with no public key is the host key, with its public
  half derived from it (`priv_key.public()`) and no warning; a configured
  public key with no private key is ignored, since a host key must be able to
  sign, and the warning says so; with neither, the warning is unchanged.
  (That held for an RSA private key only until the next bullet's fix; since
  it, it holds for RSA, Ed25519 and ECDSA keys.)
  Upstream instead fills each unset half from its hardcoded pair, so a
  configured private key is served beside the hardcoded public key, which
  does not match it. Keep it, with the generated key above, through a
  reconciliation. Tests in the same file: the private key alone is served
  unchanged with a matching public half and no warning, the public key alone
  gets the ephemeral pair and its own warning text, and a loopback SSH session
  with only the private key configured is shown that key's public half; the
  three fail against the file before this change, under 26.4.0 and 26.10.0.
- `synapse/util/manhole.py` (`manhole`), found by the review of the fifth
  round: the host key was filed as `factory.privateKeys[b"ssh-rsa"]` and
  `publicKeys[b"ssh-rsa"]` whatever its type. Twisted's server offers the
  signature algorithms of the keys in `privateKeys`
  (`SSHFactory.buildProtocol`) and then looks the negotiated one up by key
  type (`SSHServerTransport._getHostKeys`, `twisted/conch/ssh/transport.py`,
  the same in 26.4.0 and 26.10.0), so with an Ed25519 or ECDSA key the
  manhole started without a warning and every connection failed with a
  `KeyError` (`b'ssh-ed25519'`, `b'ecdsa-sha2-nistp256'`, ...); on `develop` a
  configured Ed25519 or ECDSA pair did the same. Both dicts are now keyed by
  `priv_key.sshType()`, and each factory gets its own dicts instead of
  writing into the two that `ConchFactory` declares on the class, which every
  factory in the process shares. Upstream `develop`'s `manhole.py` (fetched
  raw on 2026-11-02, sha256 `2aec8f2b…`) files every key under `b"ssh-rsa"`
  in the shared dicts, so keep this through a reconciliation. Tests in the
  same file: each of RSA, Ed25519 and ECDSA P-256, P-384 and P-521 is filed
  under its own type and found by Twisted's own lookup for every algorithm
  the server offers; a second factory leaves the first one's key alone; and
  loopback SSH sessions on an Ed25519 key, an ECDSA P-256 pair, P-384 and
  P-521 keys and an RSA key, each read from key files through the homeserver
  config. The Ed25519, ECDSA P-256 and P-384/P-521 sessions (the last stops
  at P-384) and the two factory tests, five tests, fail against the file
  before this change, under 26.4.0 and 26.10.0.
- `synapse/config/server.py` (`_check_manhole_host_key`, called from
  `ServerConfig.read_config` when `_starts_manhole_listener` finds a manhole
  listener for the process, and its helper `_manhole_key_type`), with the
  previous bullet: a `ConfigError` at startup for a public key at
  `ssh_priv_key_path` (at `manhole_settings.ssh_priv_key_path`), for an
  `ssh_pub_key_path` whose key type differs from the private key's or which
  is not the private key's public half (at `manhole_settings.ssh_pub_key_path`),
  and, from the seventh round (found by the review of the sixth), for a key
  on a curve Twisted has no SSH key type for, at `ssh_priv_key_path` or at
  `ssh_pub_key_path` beside a private key (a public key with no private key
  is not checked: `manhole()` ignores it with a warning, as above):
  `Key.fromFile` loads a PEM `EC PRIVATE KEY` on any curve cryptography
  knows, and `Key.sshType()` raises `KeyError` for every curve but P-256,
  P-384 and P-521 (`_secToNist`, `twisted/conch/ssh/keys.py`, 26.4.0 and
  26.10.0). Until then such a key (secp256k1 from `openssl`; `ssh-keygen`
  cannot write one) passed the config and the homeserver stopped in
  `start_listening` with that bare `KeyError`, or, at `ssh_pub_key_path`, in
  this check's own type comparison. From the eighth round (found by the
  review of the seventh), a DSA (`ssh-dss`) key is refused at the same two
  places, because every ssh-dss signature uses SHA-1
  (`Key._getHashAlgorithm`). Twisted's `Key.sign` also packs an ssh-dss
  signature's r and s into 20 bytes each and raises `OverflowError` when
  either is 2^160 or more. Both are reduced modulo the subgroup order, so a
  DSA key whose subgroup order is 224 or 256 bits, as in every standard DSA
  key larger than 1024 bits, which Twisted loads from a PEM
  `DSA PRIVATE KEY` file, passed the config, and the server raised
  `OverflowError` on every key exchange in practice (both halves fit with a
  chance of at most about 2^-126) while the homeserver ran and logged
  nothing about it at startup; a key with a 160-bit subgroup order (a
  1024-bit key, the kind `ssh-keygen` wrote, or a non-standard larger one)
  signs every time and serves a session, and one with a non-standard order
  just over 160 bits signs on some key exchanges and raises on others. Until
  the ninth round (found by the review of the eighth) the message said the
  server cannot sign with any DSA key larger than 1024 bits; a 2048-bit key
  with a 160-bit subgroup order signs, and the message now gives SHA-1 as
  the reason for every DSA key and the subgroup order as the reason the
  server cannot sign. Until the tenth round (found by the review of the
  ninth) it put that limit at a subgroup order "longer than 160 bits", which
  a non-standard order just over 160 bits contradicts; it now names the 224-
  and 256-bit orders of the standard keys, with which the server in practice
  cannot sign. Each message names the file and what it holds, and the curve
  and DSA messages name the types that work. Upstream loads both files
  without comparing them. From the eleventh round (found by the review of
  the tenth), the check runs only when the config declares a manhole
  listener for the process it is loaded as: for the main process a
  `type: manhole` entry of `listeners` or the `manhole` option, for a worker
  an entry of `worker_listeners` or the `worker_manhole` option, the
  listeners `synapse/app/homeserver.py` and `synapse/app/generic_worker.py`
  start. It follows the config, not what the process goes on to start:
  `synapse.app.admin_cmd` starts no listener and loads the homeserver's
  config with no `worker_app`, setting its own afterwards
  (`synapse/app/admin_cmd.py`), so it is checked as the main process, or,
  given a worker config, as that worker. From the thirteenth round an unset
  or empty `worker_app` counts as the main process, as
  `synapse/app/homeserver.py` treats it (before, `worker_app: ""` was read as
  a worker and skipped the check). Until the twelfth round (found by
  the review of the eleventh) this bullet and both documentation pages said
  the check ran only for a process that starts a manhole listener, which
  `admin_cmd` contradicts. Until the eleventh round it ran whatever the
  listeners, so a homeserver with no manhole listener and a stale
  `manhole_settings` block (a DSA key, a mismatched
  `.pub`, a public key as the private one, a curve Twisted has no SSH key
  type for), which `develop` loads and runs, stopped at config load. A key
  file that cannot be read still stops startup with or without a manhole
  listener, as upstream's `Key.fromFile` call always has. For the process
  that would start the manhole the config declares, each refused config but
  a DSA key with a 160-bit subgroup order would start a manhole on which no
  SSH session completes, or not start. That includes a non-standard DSA key
  whose subgroup order is just over 160 bits: the server signs some key
  exchanges with it, and every signature it returned in the twelfth round's
  check is a valid one, but Twisted's client refuses its host key
  (cryptography: "q must be exactly 160, 224, or 256 bits long"), and
  OpenSSL's DSA verification refuses a subgroup order
  that is not 160, 224 or 256 bits before it looks at a signature
  (`dsa_do_verify`, "bad q value", OpenSSL 3.0.13 and 4.0.3), so it rejects
  every signature on such a key. Until the eleventh round this sentence
  said such a key served a session on the key exchanges whose signature
  fits; in the eleventh round it rested on a check that read r and s from
  the wrong bytes, corrected in the twelfth (found by the review of the
  eleventh). Keep it through a reconciliation. Tests in
  `tests/blackout_runtime/test_manhole.py`, through
  `HomeServerConfig`: a public key at `ssh_priv_key_path` and another key of
  the same type at `ssh_pub_key_path`, each for RSA, Ed25519 and ECDSA
  P-256, P-384 and P-521; a public key of another type for three pairs
  (Ed25519 with RSA, RSA with ECDSA P-256, ECDSA P-256 with P-384); a
  secp256k1 PEM key at `ssh_priv_key_path` (the test also pins that the key
  loads and that `manhole()` itself raises `KeyError` on it) and at
  `ssh_pub_key_path` beside a P-256 key; a 2048-bit DSA PEM key at
  `ssh_priv_key_path` (the test also pins that the key loads, that its
  subgroup order is 224 or 256 bits and that signing with it raises
  `OverflowError`, and a loopback session test pins that the manhole, given
  that key directly, drops the connection before authentication with the
  `OverflowError` logged); a 1024-bit DSA key in the OpenSSH format at
  `ssh_priv_key_path` and, as its `.pub`, at `ssh_pub_key_path` beside an RSA
  key; and, from the ninth round, a 2048-bit DSA PEM key with a 160-bit
  subgroup order (fixed FIPS 186-2-style parameters from `openssl`) at
  `ssh_priv_key_path`, refused with SHA-1 named as the reason (the test also
  pins that the key signs and verifies, and a loopback session test that the
  manhole, given that key directly, serves a full session on `ssh-dss`); the
  five tests failing against the
  file before the sixth round's change ("the config loaded"), the two curve
  tests against the sixth round's file too (the private-key one with "the
  config loaded", the public-key one with the bare `KeyError: b'secp256k1'`
  from the type comparison), the three DSA refusal tests against the
  seventh round's file ("the config loaded"), and the ninth round's refusal
  test against the eighth round's file too, on the message's reason (the
  two DSA session tests pass against both, since neither goes through the
  config), and, from the tenth round, the 2048-bit DSA refusal test
  against the ninth round's file, on the limit the message states
  ("'subgroup order is 224 or 256 bits' not in" it); from the eleventh
  round, five refused shapes (a public key as the private one, another RSA
  key's public key, an RSA public key beside an Ed25519 key, a 2048-bit DSA
  key, a secp256k1 key) loading for five processes that start no manhole
  (an http listener only, no listener, a manhole only in the main process's
  `worker_listeners`, a worker with an http listener only, a worker beside
  a manhole only in the shared `listeners`) and refused at their setting for
  five that start one (a `listeners` entry, the same under
  `worker_app: synapse.app.homeserver`, the `manhole` option, a worker's
  `worker_listeners` entry, `worker_manhole`), a matching pair loading for
  all ten and an unreadable key file refused for all ten, the no-manhole
  test failing against the tenth round's file (`ConfigError` on its first
  shape) and the other three passing against it; and
  matching pairs and private keys alone still loading.
- `docs/manhole.md`: its option list and example named `ssh_priv_key` and
  `ssh_pub_key`. `synapse/config/server.py` reads only `ssh_priv_key_path`
  and `ssh_pub_key_path`, and `_MANHOLE_SETTINGS_SCHEMA` accepts unknown
  keys, so a config written from the page ran on an ephemeral host key (and,
  before the `_ephemeral_rsa_key` fix above, did not start). Corrected in the
  list, the example and the fork's host-key paragraph on that page, with a
  note saying the page had the old names. Upstream `develop`'s `docs/manhole.md` carries the same wrong names
  ("defaults to a hardcoded value"; fetched raw on 2026-11-02, sha256
  `2f985e2e…`), so keep the correction through a reconciliation.
  `docs/usage/configuration/config_documentation.md`'s fork paragraph under
  `manhole_settings` now says the private key alone is enough and the public
  key alone is ignored, and no longer says that leaving both unset "is no
  longer a confidentiality problem": a host key that changes on every restart
  gives a client nothing to tell a restart from an impersonator. With the
  fixes for the review of the fifth round (above), both pages also name the
  key types that work (RSA, Ed25519, ECDSA) and the refusals at startup,
  the DSA refusal among them from the eighth round, and `docs/manhole.md`'s
  example and `ssh-keygen` line use an Ed25519 key. From the eleventh round
  `docs/manhole.md` has a fork paragraph after its option list, and the
  `config_documentation.md` paragraph a sentence, saying when the checks run
  and that a key file that cannot be read stops startup either way; from
  the twelfth round both say the checks run when the config declares a
  manhole listener for the process it is loaded as, and that
  `synapse.app.admin_cmd`, which starts no listener, is checked as the main
  process or as the worker its config names (`synapse/config/server.py`
  bullet above).
- `docs/usage/configuration/config_documentation.md`, an upstream line: the
  `ssh_priv_key_path` and `ssh_pub_key_path` bullet opened with upstream's
  "The private and public SSH key pair used to encrypt the manhole traffic".
  A host key authenticates the server; the keys that encrypt a session come
  from the SSH key exchange. The fork's line says that instead. A fork change
  to upstream's text, so keep it through a reconciliation.
