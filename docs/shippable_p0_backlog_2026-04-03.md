# Shippable P0 Backlog (2026-04-03)

## Goal (today)
Convert strategy docs into a **code-first, parallelizable P0 backlog** that preserves Blackout’s thesis:
- **Governance + secure communications stay core**.
- **Exposure and sequencing are simplified** for first-time users.
- **Differentiators remain intact** (stego, governance attestation, federation path), but are progressively disclosed instead of day-0 surfaced.

Source-of-truth alignment:
- IA + onboarding simplification and lifecycle disclosure model.
- Weekly executive synthesis and current cut-line priorities.
- Existing tier packaging direction (Starter / Governance / Sovereignty).

---

## Non-goals
- No mega-refactor across all app surfaces.
- No broad behavior changes to trust/security primitives.
- No new commercial model experiments in this wave.

---

## P0 scope extraction (code changes only)

### P0-1: Feature-flag scaffolding for simple mode (unblocker)
**Why now:** Enables reversible simplification with minimal risk.

**Implementation targets**
- Add app-level flags for:
  - `simple_mode_default`
  - `show_advanced_admin_modules`
  - `onboarding_progressive_disclosure`
- Wire flag reads into navigation and onboarding composition points (visibility/order only).
- Add tenant-level default resolver: new tenants default to simple mode.

**Acceptance checks**
- Flags default to current behavior for existing tenants unless explicitly enabled.
- Simple mode hides advanced modules for non-admins and collapses admin advanced sections.
- One config/toggle can rollback to pre-wave visibility.

---

### P0-2: Onboarding + IA simplification (first-value path)
**Why now:** Highest friction-removal from current ranked backlog.

**Implementation targets**
- Make onboarding path default to 4-step first-run sequence:
  1) create/join workspace
  2) create first room (template-first)
  3) invite members
  4) start thread/call
- Reorder nav defaults to core shell first (Home/Rooms/DMs/Activity/Calls; Admin role-gated).
- Collapse advanced governance/federation/stego/key controls behind Admin expansion.

**Acceptance checks**
- No removal of advanced capabilities; only entrypoint order/visibility changes.
- Legacy deep links still resolve, with context hints when landing in advanced areas.
- First-run path is completable without touching advanced settings.

---

### P0-3: Instrumentation + KPI hooks (evidence discipline)
**Why now:** Required for safe rollout and definition-of-done enforcement.

**Implementation targets**
- Add step-level onboarding telemetry events:
  - onboarding step viewed
  - onboarding step completed
  - onboarding dropped at step N
- Add discovery events for advanced modules:
  - admin viewed advanced panel
  - admin entered governance/federation/stego settings
- Expose KPI dashboard payload hooks/events for:
  - TTFV
  - onboarding completion
  - invite completion
  - advanced-feature discovery (eligible admins)

**Acceptance checks**
- Events include tenant ID, role class, client surface, and flag cohort.
- KPI dashboards can segment by simple mode on/off.
- No personally sensitive payload leakage in event schemas.

---

### P0-4: Tier presets and defaults (packaging execution)
**Why now:** Matches strategy direction and reduces setup entropy.

**Implementation targets**
- Add config presets:
  - `starter`
  - `governance`
  - `sovereignty`
- Set `starter` as default preset for net-new tenants.
- Add admin control surface to switch preset with confirmation + impact summary.

**Acceptance checks**
- Preset changes are auditable and reversible.
- Presets modify exposure/defaults, not underlying trust primitive integrity.
- Migration path exists for existing tenants without forced changes.

---

## Execution lanes (parallel, no mega-PR)

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

## PR Wave 1 (small unblocker)
**Contains**
- Feature-flag scaffolding for simple mode.
- Defaults for visibility/order behavior only.

**Must not contain**
- Deep IA rewrites.
- Preset admin workflows.

**Risk profile**
- Low: reversible via flags.

---

## PR Wave 2
**Contains**
- IA/nav cleanup.
- Onboarding flow changes.
- Basic metrics events (step and discovery).

**Risk profile**
- Medium: user-path changes; mitigated by Wave 1 toggles.

---

## PR Wave 3
**Contains**
- Tier presets (Starter/Governance/Sovereignty).
- Admin controls for preset management.
- Docs/runbook updates for operators.

**Risk profile**
- Medium: config semantics and operator workflows.

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

## Suggested ownership map
- **Lane A (UX Simplification):** Client platform + design systems + onboarding PM.
- **Lane B (Packaging/Config):** Config/platform + governance PM + admin UX.
- **Lane C (Instrumentation):** Data/telemetry + release engineering + product ops.

---

## Immediate sequencing checklist (today)
- [x] Create three lane tickets with explicit file/package boundaries. (see `docs/shippable_p0_execution_board_2026-04-03.md`)
- [x] Open PR Wave 1 first (flag scaffolding only).
- [x] Pre-assign Wave 2 and Wave 3 reviewers.
- [x] Attach KPI query links to each PR template.
- [x] Require DoD checklist completion before merge.
