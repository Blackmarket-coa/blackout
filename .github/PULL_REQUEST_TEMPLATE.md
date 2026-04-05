## Scope
- [ ] Lane: A (UX) / B (Packaging) / C (Instrumentation)
- [ ] PR wave: Wave 1 / Wave 2 / Wave 3

## User-facing before/after
- [ ] Before and after behavior clearly stated for users/admins.

## Risk and rollback
- [ ] Rollback toggle(s) documented (exact feature flag/config key).
- [ ] Blast radius + rollback steps documented.
## Summary
- [ ] User-facing before/after statement included.
- [ ] Scope is mapped to a single wave (Wave 1 / Wave 2 / Wave 3).

## Risk and rollback
- [ ] Rollback toggle(s) documented (feature flag/config key).
- [ ] Blast radius and rollback steps documented.

## Tests
- [ ] Unit tests for touched packages.
- [ ] Integration/e2e checks (if applicable).
- [ ] If `apps/blackout-client/src/main.tsx` routes changed: update `apps/blackout-web/config/react-client-paths.json` and include a changelog note for route-parity contract updates.

## KPI impact hypothesis
- [ ] KPI target statement included (expected directional improvement and band).
- [ ] Query links attached:
  - Onboarding drop-off: https://analytics.blackout.local/dashboards/onboarding-dropoff
  - Feature discovery: https://analytics.blackout.local/dashboards/feature-discovery
  - TTFV: https://analytics.blackout.local/dashboards/ttfv
  - Invite completion: https://analytics.blackout.local/dashboards/invite-completion
