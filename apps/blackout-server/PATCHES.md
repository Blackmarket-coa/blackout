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
were *not* ported (and why) are in
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
  *and* not limited), `synapse/handlers/admin.py` and
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
  *server-default* rule are not size-checked (see the triage doc).
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
