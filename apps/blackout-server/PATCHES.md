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
  GHSA-8m4g-j4wp-wgcg (High), and five Moderate/Low advisories. Upstream has no
  upper bound (`authlib>=0.15.1`); this tree caps below the next minor, which
  has not been released or checked.
- `poetry.lock`: `poetry lock --no-update` under poetry 1.3.2. authlib 1.6.12 to
  1.9.1, and `joserfc` 1.7.7 is added (authlib 1.7+ requires `joserfc>=1.6.8`
  and `cryptography>=45.0.1`; the lock already has cryptography 50.0.2). The
  file hashes are the ones upstream's lock carries. Nothing else moved apart
  from `content-hash`.
- `tests/handlers/test_oidc.py` (`test_map_userinfo_to_user`): the integer
  `sub` case now arrives from the userinfo endpoint
  (`_user_profile_method = "userinfo_endpoint"`, `scope=""`, so the fake
  provider issues no id_token), as in upstream. A provider that returns an
  integer id from its userinfo endpoint (GitHub-style OAuth2) still maps.
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
at `cc172f7` reads the secret verbatim). Recorded after the second review of
`docs/security/dependency-advisories-server-desktop-2026-10-30.md` (repository
root), and rewritten after the third, which found that the first version
imported a string secret only and so missed a secret given as a JWK.

- `synapse/config/jwt.py` (`JWTConfig._check_hmac_secret`): when JWT login is
  enabled with HS256, HS384 or HS512:
  - an empty or missing secret (`""`, `null`, an empty mapping) is refused
    outright, on any authlib version;
  - then the check makes `JwtHandler`'s own call,
    `JsonWebToken([algorithm]).decode(token, key=secret)`, once, with a token
    signed with the empty HMAC key. authlib prepares the secret as it does
    for each login: a mapping or `{...}` text is read as a JWK, and a key set
    is searched by `kid`, so the check tries each `kid` the set names. The
    secret passes only when authlib reports a bad signature. Any other
    exception (authlib 1.9.x's `ValueError` for an empty key or one holding
    PEM or SSH key text anywhere, an empty key set, JSON text that does not
    parse) becomes a `ConfigError` at `jwt_config.secret`, and so does a
    token that verifies, because then the secret works as the empty key.
- Before this, under authlib 1.9.1, such a homeserver started and answered
  every JWT login with 500; under 1.6.12 an empty secret, or a JWK with an
  empty `k`, accepted tokens anyone could sign (GHSA-8m4g-j4wp-wgcg). Under
  1.6.12 the check still refuses every empty-key form. PEM or SSH key text is
  refused wherever it appears only under the locked `>=1.9.1`; 1.6.12 refuses
  only a string secret that starts with it, and uses any other as an HMAC
  key. Asymmetric algorithms and disabled JWT login are not checked. No
  Blackout template enables `jwt_config`.
- `tests/blackout_runtime/test_jwt_secret_config.py`: fourteen refused
  secrets for each of HS256, HS384 and HS512, among them a JWK mapping and
  JWK JSON text with an empty `k` or a PEM `k`; four accepted ones (a plain
  secret, a JWK mapping, JWK JSON text, a two-key set); a PEM for RS256 and
  an empty secret with JWT login disabled still parse; and `/login` with
  each key of the accepted set returns 200. On the first version of this
  patch (`5bad47c`) the JWK forms were not refused, and the two-key set was
  (`Missing required field: "k"`), although the handler can use it.

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
  `key_ops` without `sign`; none of them could ever sign. Before this, each
  of these let the homeserver start and then answer every authenticated
  request with 503 `Unable to introspect the access token`, the alg case
  under 1.9.1 only. Keep `_check_private_key_jwk` in step with
  `PrivateKeyJWTWithKid.sign`.
- Same validator: an empty `client_secret` is refused like a missing one
  (`not self.client_secret`, was `is None`) for `client_secret_post`,
  `client_secret_basic` and `client_secret_jwt`. `MSC3861DelegatedAuth`
  already asserted it truthy, so such a homeserver stopped during setup with
  `AssertionError: No client_secret provided`, on both authlib versions; it
  now stops with the config path. Under `python -O`, which no Blackout image
  uses, the assertion would be gone and authlib 1.9.1 would refuse to sign
  `client_secret_jwt` on every request.
- `tests/blackout_runtime/test_msc3861_client_assertion.py`: a JWK naming
  RS384, RS512, PS256 or ES256 is refused at `experimental_features.msc3861.jwk`;
  so are a public JWK, `use: enc`, `key_ops: ["verify"]` and an EC key; an
  RSA JWK with no `alg`, `alg: RS256`, `use: sig` or `key_ops: ["sign"]` is
  accepted; an empty secret is refused for each of the three methods; and
  an `alg: RS256`, `use: sig` JWK still sends a verified RS256 assertion.
  The alg and empty-secret refusals fail on the code before this patch.
