# Blackout Rollout Hardening Runbook

This runbook closes the remaining rollout-hardening stream for Blackout modules.

## Scope

- Governance deliberation scale/performance safeguards
- IPFS room event/state UX wiring
- Cross-module E2E confidence (education + mutual-aid + IPFS)
- Localization and policy tuning readiness

## Pre-rollout checks

1. **Feature flags**
    - Confirm `feature_blackout_education`, `feature_blackout_mutual_aid`, `feature_blackout_deliberation_clustering`, and `feature_blackout_ipfs_storage` are enabled for the pilot cohort.
2. **Governance policy defaults**
    - Validate room voting defaults:
        - quorum >= 1 for decisions requiring explicit participation
        - supermajority ratio set per room charter for sensitive actions
3. **IPFS backend health**
    - Verify API health endpoint response before enabling upload UX.
    - Verify gateway read path and client timeout behavior.
4. **Localization readiness**
    - Ensure newly surfaced Blackout labels use translation keys before rollout.
    - Confirm fallback behavior for missing translations in pilot locales.

## Rollout checklist

- [x] Run deliberation clustering and governance service tests. ([evidence](operations/evidence/2026-02-20-blackout-rollout-runbook-checklist.md#1-deliberation-clustering--governance-service-tests))
- [x] Run storage/IPFS tests including room-event/state payload parsing. ([evidence](operations/evidence/2026-02-20-blackout-rollout-runbook-checklist.md#2-storageipfs-tests-including-room-eventstate-payload-parsing))
- [x] Run cross-module E2E suite covering education + mutual-aid + IPFS references. ([evidence](operations/evidence/2026-02-20-blackout-rollout-runbook-checklist.md#3-cross-module-e2e-suite-education--mutual-aid--ipfs-references))
- [x] Verify telemetry dashboards include governance, education, and mutual-aid adoption signals. ([dashboard](operations/dashboards/blackout_module_adoption_dashboard.json), [evidence](operations/evidence/2026-02-20-blackout-rollout-runbook-checklist.md#4-dashboard-telemetry-verification))
- [x] Publish an internal support note with known degraded-state behavior (IPFS unavailable, feature flag off, or stale room-state references). ([support note](operations/blackout_degraded_state_support_note.md), [evidence](operations/evidence/2026-02-20-blackout-rollout-runbook-checklist.md#5-internal-support-note-for-degraded-states))

## Incident handling

### IPFS degraded backend

- Disable `feature_blackout_ipfs_storage` while leaving governance/education/mutual-aid active.
- Confirm clients continue to render existing CID metadata without upload actions.
- Re-enable only after health probes return consistently successful responses.

### Policy misconfiguration

- Roll back room-level voting policy (quorum/threshold) to last-known-good configuration.
- Recompute tallies for in-flight proposals where needed and communicate outcome changes.

### Localization gap

- Use English fallback copy for blocked rollout strings.
- Add missing keys to translation backlog before broadening locale exposure.

## Post-rollout monitoring

- Watch e2e/regression failures on governance + cross-module suites.
- Track adoption telemetry by module and rollback triggers.
- Keep this runbook aligned with release process and on-call ownership.
