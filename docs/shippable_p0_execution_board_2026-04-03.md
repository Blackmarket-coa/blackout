# Shippable P0 Execution Board (2026-04-03)

## Lane A — UX Simplification
**Scope:** P0-1 + P0-2 visibility/order changes.

**Primary packages/surfaces**
- Web app navigation + onboarding components.
- Role-conditioned UI gating.
- Feature entrypoint ordering.

**Deliverable**
- First-run/simple-mode experience that is materially easier while preserving advanced capability access for admins.

---

## Lane B — Packaging / Config
**Scope:** P0-4 presets and tenant defaults.

**Primary packages/surfaces**
- Config schema/preset registry.
- Tenant bootstrap defaults.
- Admin settings controls for preset selection.

**Deliverable**
- Shippable Starter/Governance/Sovereignty preset model with Starter default for new tenants.

---

## Lane C — Instrumentation
**Scope:** P0-3 telemetry + dashboard hooks.

**Primary packages/surfaces**
- Telemetry service/event contracts.
- Onboarding/nav instrumentation callsites.
- KPI feed adapters/dashboard integration points.

**Deliverable**
- Decision-grade KPI telemetry covering onboarding drop-off and advanced feature discovery.

---

## Recommended PR waves

### PR Wave 1 (small unblocker)
**Contains**
- Feature-flag scaffolding for simple mode.
- Defaults for visibility/order behavior only.

**Must not contain**
- Deep IA rewrites.
- Preset admin workflows.

**Risk profile**
- Low: reversible via flags.

### PR Wave 2
**Contains**
- IA/nav cleanup.
- Onboarding flow changes.
- Basic metrics events (step and discovery).

**Risk profile**
- Medium: user-path changes; mitigated by Wave 1 toggles.

### PR Wave 3
**Contains**
- Tier presets (Starter/Governance/Sovereignty).
- Admin controls for preset management.
- Docs/runbook updates for operators.

**Risk profile**
- Medium: config semantics and operator workflows.

---

## Wave ownership + status
- Wave 1 → Lane A owner: Client Platform (status: shipped)
- Wave 2 → Lane A + C owners: UX + Telemetry (status: shipped)
- Wave 3 → Lane B owner: Config/Platform (status: shipped)

---

## Definition of Done (required for every PR)

1) **User-facing before/after statement**
- Explicitly state what users/admins saw before and after.

2) **Risk + rollback toggle**
- Name exact flag/config switch to disable new behavior.
- Include rollback steps and blast radius.

3) **Tests for touched package(s)**
- Unit/integration tests updated for each modified surface.
- Any snapshot/contract updates included where relevant.

4) **KPI impact statement**
- Specify expected KPI shift and target band, for example:
  - onboarding completion: +8% to +15%
  - TTFV median: -15% to -25%
  - advanced discovery among eligible admins: +10%+

---

## PR checklist enforcement
- [x] Lane scope mapped in PR summary.
- [x] Wave tag added in PR summary.
- [x] Before/after statement required.
- [x] Rollback toggle required.
- [x] Tests for touched package(s) required.
- [x] KPI impact statement required.

Enforcement source: `.github/pull_request_template.md`.
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
