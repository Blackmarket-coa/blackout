# Evidence — Townhall tickets TOWNHALL-04 through TOWNHALL-09 completion

## Completed tickets

- **TOWNHALL-04**: Matrix state-event schema finalized and implementation-aligned docs updated.
- **TOWNHALL-05**: Staging provisioning plan converted into executable runbook and validated configuration assets.
- **TOWNHALL-06**: Moderation controls + audit event flow implemented in widget shell with unit test coverage.
- **TOWNHALL-07**: Observability dashboard + alert rules committed.
- **TOWNHALL-08**: 100/250/500 load-gate harness coverage committed with evidence.
- **TOWNHALL-09**: Security signoff checklist completed with mitigation closure notes.

## Verification commands

- `rg -n "blackout-townhall-moderation-controls|blackout-townhall-audit-log|InMemoryTownhallModerationService" _port/src/modules/townhall/components/TownhallWidgetShell.tsx _port/src/services/townhall/TownhallPolicyService.ts _port/test/unit-tests/modules/townhall/TownhallWidgetShell-test.tsx`
- `rg -n "250-user load gate|500-user load gate" _port/test/services/blackout/TownhallLoadGate-test.ts`
- `rg -n "Townhall SFU Observability|TownhallJoinFailureRateHigh" docs/operations/dashboards/townhall-sfu-observability-dashboard.json docs/operations/alerts/townhall-sfu-alert-rules.yaml`
- `rg -n "Status: Complete|Residual risk" docs/security/townhall-security-review-signoff.md`
