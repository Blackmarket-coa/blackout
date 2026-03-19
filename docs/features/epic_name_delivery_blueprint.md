# EPIC Delivery Blueprint: `<epic_name>`

> This blueprint is a production-ready implementation scaffold for Blackout (matrix-js-sdk + Synapse).

## 1) Technical design note

### Goal
- **Product goal:** `<goal>`.
- **User value:** `<why_it_matters>`.
- **Dependencies:** `<deps>`.

### Architecture and boundaries
- Implement all new client behaviors in `apps/blackout-web` behind a dedicated feature flag.
- Keep Matrix compatibility by using additive event content and account data only.
- Do **not** fork protocol semantics for room state, timeline events, device keys, or to-device E2EE flows.
- Treat Synapse as the source of truth for authz and membership checks.

### E2EE guardrails (non-negotiable)
- Never send plaintext payloads for encrypted rooms.
- Preserve Olm/Megolm key lifecycle behavior from matrix-js-sdk.
- Reject UI actions that would require unsupported cryptographic downgrade.
- Verify that fallback/error paths do not leak sensitive metadata in telemetry.

### Permission model
- Validate both allow and deny paths:
  - room membership and power-level checks,
  - moderation/admin actions,
  - cross-tenant or restricted feature entry points.
- Keep unavailable-state UX deterministic (`*-unavailable` test id pattern) when policy/entitlement denies access.

## 2) Data/event schema updates

### Event shape policy
- Prefer additive `content` fields on custom app events with stable namespace.
- Introduce a version field for forward migration:

```json
{
  "type": "io.blackout.epic.<epic_name>",
  "content": {
    "schema_version": 1,
    "feature_flag": "features.<epic_name>.enabled",
    "payload": {},
    "origin": {
      "client": "blackout-web",
      "ts": "2026-03-19T00:00:00.000Z"
    }
  }
}
```

### Migration policy
- Support dual-read during rollout (`schema_version` N and N-1) when feasible.
- Block write-path once rollback is triggered.
- Keep migration notes with:
  - data backfill requirements,
  - idempotency strategy,
  - rollback impact.

## 3) UI/UX implementation

### UX requirements
- Feature hidden by default for non-enabled presets.
- If disabled, render an explicit unavailable state with policy reason.
- If enabled, surface one primary entrypoint in the appropriate UX area:
  - settings toggle,
  - composer action,
  - room action,
  - widget panel,
  - admin console.

### Accessibility and resilience
- Keyboard accessible controls.
- Confirm destructive operations.
- Preserve optimistic UI only for reversible operations.

## 4) Tests (unit + integration)

### Unit tests
- Serializer/parser for any new event shape.
- Permission evaluator for allow/deny behavior.
- Feature-flag resolver (preset + overrides).
- E2EE safety checks for encrypted-room send path.

### Integration tests
- Happy path for enabled feature with server/channel context.
- Denied path (permission or feature flag off).
- Rollback path: feature disabled after being enabled.
- Regression check: baseline encrypted messaging still works.

## 5) Telemetry and rollout plan

### Telemetry events
- `epic_entrypoint_seen`
- `epic_action_attempted`
- `epic_action_succeeded`
- `epic_action_denied`
- `epic_rollout_state_changed`

Each event should include cohort, preset, feature flag state, and non-sensitive reason codes.

### Rollout strategy
1. Internal cohort only (canary).
2. Beta cohort with SLO and regression watch.
3. General availability after acceptance criteria and E2EE gates pass.

### Rollback strategy
- Instant flag disable.
- Stop write-path for new schema version.
- Keep read compatibility for prior events.

## Definition of done checklist
- [ ] Acceptance criteria are met.
- [ ] No E2EE regressions.
- [ ] Permission model is validated.
- [ ] Feature flag and migration notes are documented.
