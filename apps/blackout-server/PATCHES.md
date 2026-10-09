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
