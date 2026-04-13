# Frontend Consolidation — Session Follow-up Work

Date: 2026-04-13 (UTC)
Scope: Follow-up actions from consolidation artifacts and boundary/CI work completed in this session.

## Session outputs referenced

- `docs/architecture/frontend-consolidation-parity-matrix.md`
- `docs/architecture/frontend-consolidation-disposition.md`
- `docs/architecture/frontend-consolidation-migration-backlog.md`
- `docs/architecture/frontend-consolidation-boundary-audit.md`
- `docs/architecture/frontend-wrapper-parity-report.md`
- `docs/architecture/frontend-consolidation-ci-gates.md`
- `docs/architecture/frontend-consolidation-archive-signoff.md`
- `tools/ci/check-frontend-consolidation-gates.mjs`

---

## Priority follow-up plan

## P0 — Required before archive eligibility

1. **Canonical wrapper bridge parity (WRAP-001, WRAP-002)**
   - Implement native bridge compatibility layer in `apps/blackout-client` for:
     - deep link opened events,
     - notification token registration,
     - notification interaction routing,
     - unread count synchronization hooks.
   - Owner: Frontend Platform + Notifications teams.
   - Target: 2026-05-03.

2. **Close CI anti-drift operationalization**
   - Keep `frontend-consolidation-safety-gates` required in CI for consolidation PRs.
   - Add branch protection requirement for the new gate job.
   - Owner: Platform/DevEx.
   - Target: 2026-04-18.

3. **Port remaining governance canonical gaps**
   - Deliver scheduler/treasury/right-panel parity from backlog BKL-003.
   - Owner: Governance frontend.
   - Target: 2026-04-30.

## P1 — Migration-path stabilization

4. **Boundary exception closure (EXC-001, EXC-002, EXC-003)**
   - Forum: replace remaining direct Matrix writes with SDK adapters.
   - Moderation: migrate AutoMod/Timeout/Draupnir write paths to SDK adapters.
   - blackout-web: continue extraction from monolith bridge/runtime wiring.
   - Owners: Core + Moderation + Platform teams.
   - Target: 2026-05-08.

5. **Settings parity completion**
   - Land settings parity items from BKL-007/BKL-008 (labs/sidebar/preferences/steganography tab).
   - Owner: Frontend Platform + Privacy.
   - Target: 2026-05-06.

6. **Media/share/camera parity closure (WRAP-004 + BKL-006)**
   - Add canonical runtime bridge adapters and wrapper verification for native share/camera/media flows.
   - Owner: Frontend Media team.
   - Target: 2026-05-10.

## P2 — Archive readiness packaging

7. **Archive signoff rerun**
   - Re-run archive signoff doc once P0/P1 blockers are closed.
   - Upgrade recommendation from NO-GO to GO only with evidence updates.
   - Owner: Consolidation DRI.
   - Target: 2026-05-12.

8. **Legacy shell deprecation communications**
   - Prepare release notes + migration messaging for archived surfaces.
   - Include rollback criteria and support runbook links.
   - Owner: Product + Release engineering.
   - Target: 2026-05-12.

---

## Concrete engineering tickets to open

- [ ] FE-CON-101: Add canonical deep-link bridge handlers in `apps/blackout-client`.
- [ ] FE-CON-102: Add canonical notification bridge handlers in `apps/blackout-client`.
- [ ] FE-CON-103: Implement wrapper unread-sync parity contract in canonical runtime.
- [ ] FE-CON-104: Governance scheduler + treasury + right-panel parity implementation.
- [ ] FE-CON-105: Forum SDK adapter migration (`sendStateEvent` removal from UI hook path).
- [ ] FE-CON-106: Moderation SDK adapter migration (AutoMod/Timeout/Draupnir).
- [ ] FE-CON-107: Settings parity completion (labs/sidebar/preferences/steganography).
- [ ] FE-CON-108: Media/share/camera bridge parity in canonical runtime.
- [ ] FE-CON-109: Enable required CI status check for `frontend-consolidation-safety-gates`.
- [ ] FE-CON-110: Archive signoff rerun + GO/NO-GO review package refresh.

---

## Follow-up validation checklist

Run after each PR in the migration sequence:

```bash
pnpm guard:frontend-consolidation
node _port/scripts/operations/docs_integrity_check.cjs
pnpm lint
pnpm test
```

For wrapper milestones, also run:

- desktop deep-link + notification smoke checks
- mobile deep-link + push + lifecycle + share/camera smoke checks
- canonical runtime parity verification against `apps/blackout-client`

---

## Exit criteria for this follow-up plan

This plan is complete when all are true:
- No open WRAP blockers.
- No open EXC boundary exceptions.
- All `ported` backlog items approved for migration are implemented or intentionally deprecated with updated rationale.
- Archive signoff recommendation can be changed to **GO** with evidence.
