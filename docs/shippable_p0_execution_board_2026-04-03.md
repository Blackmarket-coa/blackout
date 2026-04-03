# Shippable P0 Execution Board (2026-04-03)

## Lane tickets (explicit boundaries)

### Lane A — UX Simplification
- **Ticket:** `P0-LANE-A-001` Feature-flag scaffold + simple-mode visibility defaults.
- **Packages/files in scope:**
  - `apps/blackout-web/src/config.ts`
  - `apps/blackout-web/src/app.ts`
  - `apps/blackout-web/src/components/ChannelSidebar.ts`
  - `apps/blackout-web/tests/unit/config.test.ts`
  - `apps/blackout-web/tests/unit/channel-sidebar.test.ts`
- **Out of scope:** onboarding flow redesign, tier preset admin workflows.

### Lane B — Packaging/Config
- **Ticket:** `P0-LANE-B-001` Starter/Governance/Sovereignty preset controls.
- **Packages/files in scope:**
  - `apps/blackout-web/src/settings/feature-presets.ts`
  - `apps/blackout-web/src/config.ts`
  - admin settings surface components
- **Out of scope:** telemetry schema expansion.

### Lane C — Instrumentation
- **Ticket:** `P0-LANE-C-001` onboarding drop-off + discovery telemetry.
- **Packages/files in scope:**
  - `apps/blackout-web/src/services/telemetry.ts`
  - onboarding/nav callsites in `apps/blackout-web/src/app.ts`
  - dashboard adapters/contracts
- **Out of scope:** navigation IA and preset packaging logic.

---

## Wave sequencing and reviewer pre-assignment

### Wave 1 (open first) — flag scaffolding only
- **Status:** OPEN in current branch.
- **Scope:** Lane A only (`P0-LANE-A-001`).
- **Reviewers:** Client Platform Lead, Release Engineering, QA owner.

### Wave 2 — IA/nav + onboarding + basic metrics
- **Status:** queued.
- **Reviewers pre-assigned:** Design Systems Lead, Growth PM, Telemetry owner.

### Wave 3 — presets + admin controls + docs/runbooks
- **Status:** queued.
- **Reviewers pre-assigned:** Config Platform Lead, Governance PM, Support Ops.

---

## PR discipline checklist
- [x] Create three lane tickets with explicit file/package boundaries.
- [x] Open PR Wave 1 first (flag scaffolding only).
- [x] Pre-assign Wave 2 and Wave 3 reviewers.
- [x] Attach KPI query links to each PR template.
- [x] Require DoD checklist completion before merge.

Implementation note: DoD and KPI links are enforced via `.github/pull_request_template.md`.
