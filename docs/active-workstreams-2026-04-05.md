# Active Workstreams Plan (Web/Gov + Usability + P0 Waves)

Date: 2026-04-05
Owner: Release Engineering + Web Client + Governance UI + UX

> **Status update (2026-05-01):** Workstream 1's blackout-web half is
> superseded — `apps/blackout-web/` was archived to `legacy/blackout-web/`
> on 2026-05-01 and the canonical frontend is now `@blackout/client`
> (`apps/blackout-client/`). Re-read the rows below substituting
> "blackout-web" with "blackout-client" only where the underlying capability
> is also part of the frontend-consolidation migration backlog
> (`docs/architecture/frontend-consolidation-migration-backlog.md`). The
> blackout-gov half, the usability slice, and the shippable P0 waves remain
> live workstreams.

This plan converts currently open tracker items into an executable sequence with clear dependencies and exit criteria.

## Scope sources

- `docs/blackout-web-gov-delivery-tracker.md`
- `docs/usability-improvements.md`
- `docs/shippable_p0_execution_board_2026-04-03.md`

---

## Workstream 1 — Web + Gov delivery tracker execution

### P0 (do first)

1. Import missing app sources for:
   - `apps/blackout-web/` baseline UI
   - `apps/blackout-gov/` governance UI baseline
2. Complete production Vite build + static deployment pipeline for both apps.
3. Validate config wiring:
   - `VITE_MATRIX_HOMESERVER_URL`
   - `BLACKOUT_SERVER_URL`
   - release environment parity checks

**Exit criteria**

- `pnpm lint`, `pnpm test`, `pnpm build` pass for both app packages.
- CI artifact for static deployment produced.
- Snapshot tracker rows moved from `In progress`/`Not started` -> `Complete` where done.

### P1/P2 (after P0 unlock)

- P1: swipe-to-join verification, theme, badges, proposal creation UI, voting interface, meeting scheduler UI.
- P2: delivery status inline, optional AI features, delegation/treasury/analytics.

**Dependency rule**: no P1/P2 UI polish until P0 source import + deployment path is stable.

---

## Workstream 2 — Usability improvement tracker execution

### Slice A (P0 usability defects)

1. Android keyboard persistence hardening.
2. Click/tap-outside and escape-to-close composer panels.

**Exit criteria**

- Acceptance criteria from items #1 and #2 are fully checked.
- Mobile regression test coverage added for focus retention and panel dismissal.

### Slice B (P1 onboarding + stego clarity)

1. Tooltip/glossary system for jargon.
2. Guided tours for stego + governance first-use.
3. Stego panel explanatory copy + before/after preview + progressive disclosure.

**Exit criteria**

- Acceptance criteria for items #3, #4, #5 checked.
- Telemetry events emitted for walkthrough completion and discovery flow.

### Slice C (P2/P3 quality and mobile layout)

1. Bug report FAB + submission flow.
2. Mobile composer/sidebar layout overhaul.

**Exit criteria**

- Acceptance criteria for items #6 and #7 checked.
- No desktop layout regressions.

---

## Workstream 3 — Shippable P0 wave sequencing

### Wave 1 (currently open)

- Keep scope restricted to Lane A flag scaffolding only.
- Require merge only with DoD + KPI links satisfied.

### Wave 2 (queued)

- IA/nav + onboarding + base telemetry instrumentation.
- Opens only after Wave 1 lands cleanly.

### Wave 3 (queued)

- Packaging presets + admin controls + docs/runbook updates.
- Opens only after Wave 2 baseline metrics are green.

**Cross-wave release gate**

- No wave promotion unless previous wave has:
  - green CI,
  - reviewer sign-off,
  - explicit rollback path.

---

## Suggested 2-week execution order

Week 1:

- Workstream 1 P0 source import + deployment pipeline.
- Workstream 2 Slice A defects.
- Wave 1 completion.

Week 2:

- Workstream 2 Slice B.
- Wave 2 launch (if Wave 1 passes).
- Begin Wave 3 prep checklist and docs updates.

---

## Verification commands

```bash
pnpm lint
pnpm test
pnpm build
pnpm smoke:aligned
```

For each completed slice/wave, update source tracker rows and attach command output artifact references.
