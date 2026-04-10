# Wave 2 kickoff plan (U3 / U7 / U9)

_Date: 2026-03-27_

Status: **completed** (Wave 2 scope U3/U7/U9).

This document operationalizes Wave 2 implementation kickoff for:

- U3 — Paid rooms / boosts integration
- U7 — Deliberation + task workflows
- U9 — Townhall/community modules

It complements:

- `docs/upstream_blackout_feature_build_plan.md` (wave sequencing)
- `docs/development/blackout_upstream_feature_matrix.md` (support-status source of truth)

Implemented evidence:

- `blackout_runtime/server_semantics.py`
- `blackout_runtime/module.py`
- `blackout_runtime_tests/test_server_semantics.py`
- `blackout_runtime_tests/test_module_integration.py`

## U3 — Paid rooms / boosts integration

### Scope (kickoff tranche)
- Add room-state contract for:
  - `paid_room: bool`
  - `boost_tier: int` (bounded)
  - `boost_expiry_ts: int` (unix seconds)
- Enforce server-side validation behind feature flag:
  - `blackout_enable_paid_rooms`

### Abuse controls
- Reject unsigned/unauthorized boost state transitions.
- Rate-limit boost updates per room/user.
- Add anomaly telemetry for out-of-policy boost attempts.

### Test minimums
- Accept valid paid-room state transitions.
- Reject invalid tier bounds/signatures.
- Verify rate-limit and anomaly emission behavior.

### Delivery checkpoints
- Contract + validation scaffold: **2026-04-10**
- Integration tests + staging gate: **2026-04-20**

---

## U7 — Deliberation + task workflows

### Scope (kickoff tranche)
- Define event lifecycle contract:
  - `proposal -> vote -> execution`
- Add transition guard validation and explicit rejection reasons.
- Implement behind feature flag:
  - `blackout_enable_deliberation_workflows`

### Abuse controls
- One-vote-per-user semantics for deliberation votes.
- Proposal window enforcement for voting/execution.
- Audit event emission for invalid transition attempts.

### Test minimums
- Happy-path lifecycle progression.
- Invalid transition rejection matrix.
- Duplicate-vote and out-of-window rejection checks.

### Delivery checkpoints
- State-machine contract finalized: **2026-04-15**
- Integration and replay-safety tests: **2026-04-25**

---

## U9 — Townhall/community modules

### Scope (kickoff tranche)
- Define townhall primitives:
  - session metadata
  - agenda items
  - summary artifacts
- Add minimal API endpoints behind feature flag:
  - `blackout_enable_townhall_modules`

### Moderation/safety controls
- Moderator override and emergency lock controls.
- Session write permission boundaries.
- Rate controls for agenda/summary mutation events.

### Test minimums
- Endpoint authz coverage for moderator/member roles.
- Session lifecycle validation (open/close/summary publish).
- Emergency lock behavior under concurrent updates.

### Delivery checkpoints
- Endpoint contract + schema draft: **2026-04-20**
- Staging validation + moderation drill: **2026-04-30**

---

## Rollout guardrails (Wave 2 global)

- All features remain config-gated until release-candidate signoff.
- Release gate requires:
  1. schema/contract docs,
  2. integration tests,
  3. abuse-control telemetry verification evidence.
- Support status can move from `partial` to `complete` only after end-to-end validation artifacts are linked in the upstream support matrix.
