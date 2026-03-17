# Townhall threat-model refresh cadence

## Scope

Operational cadence for keeping Townhall SFU security mitigations current after phase completion.

## Cadence

- **Quarterly** threat-model refresh for SFU edge/network exposure.
- **Per release** regression validation for token-role policy contracts.
- **Monthly** audit-log retention review against governance retention requirements.

## Required checks

1. Re-run role-policy contract tests:
   - `_port/test/services/townhall/TownhallPolicyService-test.ts`
   - `_port/test/unit-tests/modules/townhall/TownhallWidgetShell-test.tsx`
2. Validate token endpoint TTL/rate-limit controls against current defaults.
3. Confirm audit log retention policy remains aligned with governance requirements.

## Evidence linkage

- `docs/security/townhall-security-review-signoff.md`
- `docs/operations/evidence/2026-03-16-sprint-d-top10-selfhealing-townhall-closure.md`
