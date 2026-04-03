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
