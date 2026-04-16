# Feature preset rollout, telemetry, and rollback playbook

## Cohort release sequence

Use this fixed progression for preset rollouts:

1. **internal** (staff / dogfood)
2. **pilot tenants** (selected external tenants, mapped to `beta`)
3. **general availability** (all eligible tenants, mapped to `general`)

Set cohort at startup with `VITE_RELEASE_COHORT` (`internal|beta|general`).

## Monetization rollout policy (controlled cohorts + reversibility)

Monetization launches must follow the same cohort sequence, with **runtime-flag control per monetization slice** and a reversible default.

### Required monetization cohort phases

1. **internal** (employee and release engineering validation)
2. **limited beta** (explicit allow-list of pilot tenants)
3. **production tenants** (general rollout after signoff)

Do not skip phases. Promotion requires phase gate evidence and owner signoff (see [Ownership and signoff matrix](#ownership-and-signoff-matrix)).

### Runtime-flag model (slice-by-slice enablement)

Enable monetization as independent slices so each can be advanced or rolled back without taking down baseline client experiences:

- `features.monetization.catalog`
- `features.monetization.checkout`
- `features.monetization.entitlements`
- `features.monetization.billingHistory`

Implementation requirements:

1. Each slice flag must be evaluated at runtime (no build-time only gating).
2. Each slice must support per-cohort and per-tenant targeting.
3. Disabled slices must keep route and settings declarations intact (no declaration removal), so re-enable is a flag flip rather than a code redeploy.
4. When disabled, monetization entry points must degrade to deterministic unavailable states without breaking navigation shell, route registration, or settings render paths.

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

## Monetization rollback runbook (reversible by default)

When a monetization regression is detected:

1. **Disable monetization flag(s)** for the impacted slice(s) first.
   - Apply per-tenant disable if localized; apply per-cohort disable if systemic.
2. **Verify baseline client health** immediately after disable:
   - global navigation and shell boot,
   - route transitions for non-monetization surfaces,
   - settings pages load and persist baseline preferences.
3. **Preserve declarations for quick re-enable**:
   - keep route registration, settings metadata, and feature declarations committed,
   - do not delete monetization declarations during rollback unless directed by incident command for a security reason.
4. **Stabilize and reassess**:
   - confirm regression metrics return under threshold for two review windows before considering re-enable.

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
5. **Monetization regression threshold breach:** checkout failures, entitlement drift, or billing sync lag exceeds documented threshold for the active phase.

Required runbook actions:

1. Freeze cohort expansion.
2. Apply preset kill switch for impacted capability family.
3. Apply tier kill switch for affected tenant(s) if blast radius is scoped.
4. Roll back preset one level (`general`/`beta` tenants to safer baseline), then verify telemetry stabilization before re-enable.
5. Record incident evidence and owner signoff before resuming rollout.

## Ownership and signoff matrix

All monetization rollout gates require explicit owner acknowledgment:

- **Client Platform (registry/shell)**: owns client registry integrity, navigation shell, route stability, and settings scaffolding under flag on/off states.
- **Product Monetization (IA/content)**: owns monetization information architecture, copy/content correctness, and conversion UX guardrails.
- **Payments Backend (entitlements/billing authority)**: owns entitlement truth, billing event processing, and reconciliation authority.
- **QA/Release (gates/signoff)**: owns gate checklist execution, cohort promotion approval, and rollback decision coordination.

No cohort promotion is permitted without all four owner groups signing off in the release record.

## Rollout metrics and stop policy

Track monetization rollout metrics per cohort and tenant segment:

- checkout start → success conversion,
- entitlement issuance latency and mismatch rate,
- billing webhook/process lag,
- monetization route/settings error rate,
- support/contact rate attributable to monetization surfaces.

**Stop rollout immediately** (freeze expansion and execute rollback runbook) when any metric crosses the pre-declared regression threshold for the active phase.

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
