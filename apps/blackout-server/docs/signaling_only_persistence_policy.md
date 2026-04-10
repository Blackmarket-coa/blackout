# Signaling-Only Persistence Policy

Status: Approved (BLK-101)
Owner: Backend Lead
Last updated: 2026-03-14

## Purpose

Define the canonical persistence boundaries for Blackout Server when operating in signaling-only mode.

## Scope

This policy applies when `blackout_signaling_only_mode: true`.

## Persisted data (allowed)

The server MAY persist only the minimum data required for identity, security, and room authorization:

1. **Accounts and profile metadata**
   - User IDs, account lifecycle metadata, and credentials necessary for authentication.
2. **Device identity and key material**
   - Device keys, cross-signing state, one-time/pre-key metadata required by Matrix identity/security flows.
3. **Room membership and auth-critical state**
   - State events required to evaluate authorization and maintain room membership semantics.
4. **Signaling artifacts with bounded TTL**
   - `m.blackout.signal` events and related signaling metadata required for P2P setup.

## Non-persisted data (blocked)

The server MUST NOT retain:

1. `m.room.message` payload bodies.
2. `m.room.encrypted` payload bodies.
3. Media binaries and long-lived media derivatives.
4. Search indexes over message payload content.

## Enforcement requirements

1. Write-path policy gate MUST classify incoming events as allowed or blocked.
2. Blocked content MUST return explicit typed errors.
3. Allowed signaling artifacts MUST be retained only within configured TTL windows.
4. Purged signaling artifacts MUST be irretrievable via API.

## `m.blackout.signal` schema baseline (BLK-105)

Server-side validation MUST enforce the following baseline:

- Required root field: `message_metadata`
- Required `message_metadata` fields:
  - `message_id` (non-empty string)
  - `sender_key_id` (non-empty string)
- Optional payload sections:
  - `ice_candidates`
  - `sdp_offer`
  - `sdp_answer`
  - `chunk_announcements`
  - `offline_retrieval`
  - `self_destruct_after`
- Unknown root fields are rejected.
- Invalid section shapes are rejected.

Validation is performed server-side with a JSON schema plus additional semantic checks
for chunk hash shape and redundancy metadata consistency.

## Configuration contract

- `blackout_signaling_only_mode: true|false`
- `blackout_signal_ttl_hours: <24-72>`
- `blackout_purge_interval_minutes: <positive int>`

## Migration and compatibility

1. `blackout_signaling_only_mode` MUST be feature-flag controlled for staged rollout.
2. Existing deployments MUST receive explicit migration guidance before hard enforcement.
3. Compatibility behavior for legacy Matrix clients must follow ADR outcomes from blocker decisions.

## Operational controls

- Add audit metrics for blocked event types and purge activity.
- Alert on unexpected growth in retained signaling artifacts.
- Publish weekly marker and risk status in tracker updates.

## Acceptance checklist (BLK-101)

- [x] Canonical allow/deny persistence policy documented.
- [x] Required config keys listed.
- [x] Enforcement expectations documented.
- [x] Sign-off by Backend Lead + Architecture Council.

## Sign-off record (BLK-101)

- **Decision:** Approved
- **Approver roles:** Backend Lead, Architecture Council
- **Approval date:** 2026-03-14
- **Evidence:**
  - `docs/blackout_governance_signoff_log.md` (Phase 0/Phase 1 governance approvals)
  - `docs/project_completion_tracker.md` (canonical completion and evidence linkage)


## Canonical persisted/non-persisted matrix (Wave-1 locked)

| Surface | Persisted? | Enforcement expectation |
|---|---|---|
| Accounts/profile metadata | Yes | Must remain queryable for authentication and account lifecycle checks. |
| Device keys/cross-signing | Yes | Must remain queryable for device trust and key revocation checks. |
| Membership/auth-critical state | Yes | Must remain available for auth/state resolution. |
| `m.blackout.signal` metadata | Yes (TTL-bounded) | Retained only during configured retention window; purge must remove retrievability. |
| `m.room.message` | No | Reject/disable in blackout mode with typed blocked-event response. |
| `m.room.encrypted` | No | Reject/disable in blackout mode with typed blocked-event response. |
| Media binaries/derivatives | No | Media repository and background media paths disabled in blackout mode. |
| Search index payload content | No | Search indexing and retrieval paths disabled in blackout mode. |

## Acceptance-test lock for storage/persistence policy tasks

The following suites are frozen as the acceptance gate for BLK-101 / Wave-1 storage policy work:

- `blackout_runtime_tests/test_policy_engine.py`
- `tests/handlers/test_message.py`
- `tests/handlers/test_federation_event.py`
- `tests/storage/databases/main/test_end_to_end_keys.py`

Any policy change MUST include updates to these suites and pass them before ticket closure.

## Migration-safe rollout note (policy toggles)

1. Enable `blackout_signaling_only_mode` in staging first and keep search/media disabled under blackout policy.
2. Verify blocked payload error contract (`403 M_FORBIDDEN`) and invalid signal payload contract (`400 M_BAD_JSON`) before canary promotion.
3. Roll out in canary cohorts; require stable rejection-rate and purge-lag metrics before wider enablement.
4. Attach per-stage evidence links in deployment go/no-go documents before production cutover.
