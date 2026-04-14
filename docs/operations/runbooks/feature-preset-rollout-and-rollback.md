# Feature preset rollout, telemetry, and rollback playbook

## Cohort release sequence

Use this fixed progression for preset rollouts:

1. **internal** (staff / dogfood)
2. **pilot tenants** (selected external tenants, mapped to `beta`)
3. **general availability** (all eligible tenants, mapped to `general`)

Set cohort at startup with `VITE_RELEASE_COHORT` (`internal|beta|general`).

### Phase gates (must pass before advancing)

1. **internal → pilot tenants**
   - No regression in core compose/send success for 7 consecutive days.
   - No regression in governance participation flows (proposal create + vote cast + results render).
   - Kill-switch drill validated for each advanced capability (preset and tier paths).
2. **pilot tenants → general availability**
   - Pilot tenants remain non-red for 14 consecutive days.
   - Entitlement transition checks pass (`free → paid → free`) with fallback UI verified.
   - Rollback criteria and runbook triggers are signed off by Release Manager + On-call.

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

### tier_free

- Target state: matrix-core features only.
- Rollback trigger: elevated auth/discovery regression or E2EE policy mismatch.
- Action: apply `tier_free` from Feature Presets panel and confirm.

### tier_pro

- Target state: matrix baseline + discord-like composer/widget affordances.
- Rollback trigger: composer UX regressions or elevated typing/composer client errors.
- Action: rollback to deployment preset or explicitly apply `tier_free`.

### tier_enterprise

- Target state: all novel and advanced features enabled.
- Rollback trigger: any high-risk feature instability or abuse/safety telemetry breach.
- Action: rollback to `tier_pro` first, then `tier_free` if incident persists.

## High-risk feature rollback notes

## Kill-switch policy (preset + tier)

Each advanced capability must support **both**:

- **Preset kill switch** (deployment-level disable for all tenants on that preset).
- **Tier kill switch** (tenant/workspace-level disable while leaving baseline features active).

Advanced capability families:

- advanced stego
- advanced governance
- federation boost
- townhall SFU
- advanced engagement experiments

If either switch is active, feature UI must render fallback/unavailable copy and preserve core chat/governance baseline actions.

## Rollback criteria and runbook triggers

Trigger broad rollback (pause or reverse rollout) when any criterion is hit:

1. **Core chat regression:** compose/send error rate rises above agreed SLO threshold for two consecutive 15-minute windows.
2. **Governance regression:** proposal or vote actions fail above threshold, or results rendering is incorrect/incomplete.
3. **Entitlement integrity regression:** free-tier users can access advanced paid capabilities without authorization, or paid users lose entitled baseline capabilities.
4. **Operational risk:** incident commander declares Sev-1/Sev-2 tied to rollout changes.

Required runbook actions:

1. Freeze cohort expansion.
2. Apply preset kill switch for impacted capability family.
3. Apply tier kill switch for affected tenant(s) if blast radius is scoped.
4. Roll back preset one level (`general`/`beta` tenants to safer baseline), then verify telemetry stabilization before re-enable.
5. Record incident evidence and owner signoff before resuming rollout.

### Stego (`stego_toolkit`, `ephemeral_stego_lifecycle`)

- Immediate action: disable `features.stego.enabled` and revert to `tier_pro`.
- Verify deny telemetry trends flatten within one review interval.

### Paid-room keys (`paid encrypted room creator-key lifecycle`)

- Immediate action: remove entitlement grants and pin tenants to `tier_free`.
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
