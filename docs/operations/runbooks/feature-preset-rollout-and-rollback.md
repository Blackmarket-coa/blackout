# Feature preset rollout, telemetry, and rollback playbook

## Cohort release sequence

Use this fixed progression for preset rollouts:

1. **internal** (staff / dogfood)
2. **beta** (selected external tenants)
3. **general** (all eligible tenants)

Set cohort at startup with `VITE_RELEASE_COHORT` (`internal|beta|general`).

## Telemetry instrumentation requirements

Track these event families in all cohorts:

- **Preset adoption**
  - `preset_adoption_seen`
  - `preset_applied`
  - `preset_rollback`
- **Feature open/use success rates**
  - `feature_open_success`
- **Entitlement/policy deny reasons**
  - `feature_open_denied` with `reason=blocked_by_policy_or_entitlement`

Required dimensions:

- `cohort`
- `preset`
- `featureId`
- `entrypointKind`
- `reason` (for denied flows)

## Rollback playbook by preset

### baseline_matrix

- Target state: matrix-core features only.
- Rollback trigger: elevated auth/discovery regression or E2EE policy mismatch.
- Action: apply `baseline_matrix` from Feature Presets panel and confirm.

### community_plus

- Target state: matrix baseline + discord-like composer/widget affordances.
- Rollback trigger: composer UX regressions or elevated typing/composer client errors.
- Action: rollback to deployment preset or explicitly apply `baseline_matrix`.

### blackout_full

- Target state: all novel and advanced features enabled.
- Rollback trigger: any high-risk feature instability or abuse/safety telemetry breach.
- Action: rollback to `community_plus` first, then `baseline_matrix` if incident persists.

## High-risk feature rollback notes

### Stego (`stego_toolkit`, `ephemeral_stego_lifecycle`)

- Immediate action: disable `features.stego.enabled` and revert to `community_plus`.
- Verify deny telemetry trends flatten within one review interval.

### Paid-room keys (`paid encrypted room creator-key lifecycle`)

- Immediate action: remove entitlement grants and pin tenants to `baseline_matrix`.
- Validate no new key grants are emitted before re-enabling.

### Plugin sandbox

- Immediate action: disable plugin execution capability in tenant policy overrides.
- Verify outbound/network capability checks emit no allow decisions after disable.

### Townhall moderation (`townhall_sfu`)

- Immediate action: disable `features.townhall.enabled` and fall back to non-SFU room workflows.
- Confirm moderation-deny and session-failure rates return to baseline.

## Evidence and operational logging

For each rollout/rollback operation, capture:

- timestamp (UTC), cohort, preset before/after,
- operator identity,
- incident or change ticket reference,
- telemetry snapshot before and 30 minutes after change.
