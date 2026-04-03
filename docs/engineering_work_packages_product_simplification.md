# Engineering Work Packages: Product Simplification Execution

## Scope
Translate Blackout product simplification (simple-by-default, powerful-by-option) into concrete engineering work orders with owners, effort, contracts, compatibility, telemetry, and reliability guardrails.

---

## 1) Feature flag matrix

| Work Order ID | Flag name | Starter default | Governance default | Sovereignty default | Dependent modules | Owner discipline | Est. effort | Test plan |
|---|---|---:|---:|---:|---|---|---|---|
| WO-FLAG-01 | `ff_onboarding_wizard_v2` | ON | ON | OFF | onboarding-orchestrator, workspace-service, room-template-service, invite-service, call-init UI | frontend + backend | M | Contract tests for wizard step APIs; e2e first-run happy/skip paths; rollback smoke test |
| WO-FLAG-02 | `ff_nav_simplification_v1` | ON | ON | ON | nav-shell, role-aware router, settings-index | frontend | M | Snapshot/nav route tests by role; accessibility checks for collapsed sections |
| WO-FLAG-03 | `ff_admin_advanced_expansion_v1` | ON | ON | ON | admin-settings-shell, RBAC policy engine, deep-link resolver | frontend + backend | M | RBAC unit tests; admin/non-admin visibility e2e; deep-link fallback test |
| WO-FLAG-04 | `ff_lifecycle_disclosure_v1` | OFF | ON | ON | lifecycle-trigger-service, nudges-service, analytics-pipeline | product + backend | M | Trigger eligibility tests (Day 0/7/30 + usage signals); nudge delivery reliability checks |
| WO-FLAG-05 | `ff_onboarding_telemetry_v1` | ON | ON | ON | event-sdk, ingestion pipeline, KPI dashboards | backend + ops | S/M | Event schema validation; data freshness SLA monitors; dashboard parity checks |
| WO-FLAG-06 | `ff_advanced_settings_entry_banner_v1` | ON | ON | OFF | settings-page, discoverability banners, help center links | frontend + product | S | Experiment A/B tests; click-through + confusion metric deltas |

**Flag policy:** all flags must support runtime disable and sub-30-minute rollback in release tooling.

---

## 2) API/UI contract changes to hide advanced modules by default

### WO-API-01 — Settings surface contract (role + maturity aware)
- **Owner discipline:** backend
- **Estimated effort:** M
- **Change:** Add `settings_surface` response object from Settings Index API:
  - `visible_sections[]` (role-allowed, default-visible)
  - `advanced_sections[]` (role-allowed, collapsed by default)
  - `discoverability_hints[]` (microcopy keys)
- **Rationale:** Prevent client hardcoding; allow server-governed visibility by tier/role/maturity.
- **Test plan:** API schema tests, RBAC matrix tests, version negotiation tests.

### WO-API-02 — Deep-link mediation contract
- **Owner discipline:** backend + frontend
- **Estimated effort:** S/M
- **Change:** Introduce `settings/deeplink/resolve` endpoint returning:
  - `resolution_state` = `direct | advanced_collapsed | denied`
  - `redirect_path`
  - `context_banner_key`
- **Rationale:** Maintain expert deep links while preserving simplified default navigation.
- **Test plan:** Deep-link route tests for admin/member/guest, denied-state security checks.

### WO-UI-01 — Admin advanced expansion component
- **Owner discipline:** frontend
- **Estimated effort:** M
- **Change:** New reusable `<AdvancedAdminSection />`:
  - collapsed by default
  - sticky context copy (“Advanced controls for admins”)
  - keyboard + screen-reader compliant expand/collapse behavior
- **Rationale:** Centralized component avoids fragmented advanced exposure patterns.
- **Test plan:** Component unit tests, a11y audits, visual regression tests.

### WO-UI-02 — Role-conditioned navigation shell
- **Owner discipline:** frontend
- **Estimated effort:** M
- **Change:** Route manifest supports `required_role`, `default_visibility`, `surface_group`.
- **Rationale:** Keeps global nav simple while preserving full admin path coverage.
- **Test plan:** Route gating tests, nav ordering tests, legacy link migration tests.

### WO-API-03 — Lifecycle disclosure eligibility API
- **Owner discipline:** backend + product
- **Estimated effort:** M
- **Change:** `lifecycle/disclosure/eligibility` endpoint:
  - returns `day_bucket` (`day_0`, `day_7`, `day_30`)
  - includes usage-trigger booleans for nudges
- **Rationale:** Coordinated server-side rules across web/desktop/mobile.
- **Test plan:** Deterministic time-window tests, usage-threshold edge-case tests.

---

## 3) Backward compatibility plan for existing users

### WO-COMPAT-01 — Legacy settings URL continuity
- **Owner discipline:** frontend + backend
- **Estimated effort:** S
- **Plan:** Maintain all existing settings URLs; map to new shell with context banners and preserved final destination for authorized admins.
- **Test plan:** Legacy URL replay suite; compare old/new resolved routes.

### WO-COMPAT-02 — Workspace cohort migration policy
- **Owner discipline:** ops + product
- **Estimated effort:** S/M
- **Plan:**
  1. New workspaces default to simplified IA.
  2. Existing workspaces opt-in by cohort wave.
  3. Governance-heavy tenants get guided migration prompts and temporary “classic entry” toggle.
- **Test plan:** Cohort roll-forward/roll-back drills; tenant-level override tests.

### WO-COMPAT-03 — Permission semantics freeze
- **Owner discipline:** backend
- **Estimated effort:** S
- **Plan:** Do not change permission model semantics; only change default visibility and entrypoints.
- **Test plan:** RBAC regression suite comparing pre/post release authorization decisions.

### WO-COMPAT-04 — Mobile/web parity contract
- **Owner discipline:** frontend
- **Estimated effort:** M
- **Plan:** Shared onboarding + settings visibility contract consumed by all clients.
- **Test plan:** Cross-surface conformance test pack; parity checklist in CI gates.

---

## 4) Telemetry spec

### 4.1 Onboarding funnel events (WO-TEL-01)
- **Owner discipline:** backend + ops
- **Estimated effort:** M
- **Events:**
  - `onboarding_started`
  - `workspace_created` / `workspace_joined`
  - `room_created`
  - `invite_sent`
  - `first_thread_started`
  - `first_call_started`
  - `onboarding_completed`
- **Required properties:** `workspace_tier`, `client_surface`, `role`, `duration_ms`, `step_index`, `path_variant`.
- **Test plan:** Event contract unit tests + pipeline integrity checks.

### 4.2 Feature discovery events (WO-TEL-02)
- **Owner discipline:** product + backend
- **Estimated effort:** S/M
- **Events:**
  - `advanced_settings_opened`
  - `governance_module_opened`
  - `federation_settings_opened`
  - `lifecycle_nudge_seen`
  - `lifecycle_nudge_clicked`
- **Required properties:** `day_bucket`, `entrypoint`, `resolution_state`, `workspace_age_days`.
- **Test plan:** Visibility-to-event correlation checks; admin/member segmentation validation.

### 4.3 Confusion/drop-off indicators (WO-TEL-03)
- **Owner discipline:** ops + product
- **Estimated effort:** S
- **Derived signals:**
  - repeated backtracking count per onboarding step
  - time-in-step p95 outliers
  - help-center open from onboarding
  - settings search with zero-result terms
  - invite cancel loops
- **Alerting thresholds:**
  - >15% week-over-week rise in step-2 abandonment
  - >20% rise in “where do I start” ticket tag
  - p95 onboarding step latency > budget for 2 consecutive days
- **Test plan:** Alert simulator tests; dashboard threshold integration tests.

---

## 5) Reliability SLO impact

### WO-SLO-01 — Latency budget by core flow
- **Owner discipline:** ops + backend + frontend
- **Estimated effort:** M
- **Budgets (p95):**
  1. Create/join workspace: **<= 1200 ms** server roundtrip / **<= 2500 ms** end-user perceived completion
  2. Create first room: **<= 900 ms** server / **<= 1800 ms** perceived
  3. Invite members: **<= 1000 ms** server / **<= 2200 ms** perceived
  4. Start first thread/call: thread **<= 800 ms** / call setup readiness **<= 3000 ms**
- **Test plan:** Synthetic checks per step; real-user monitoring split by tier/surface.

### WO-SLO-02 — Regression guardrails
- **Owner discipline:** ops + product
- **Estimated effort:** S/M
- **Guardrails:**
  - Block rollout if median TTFV worsens >10% against 14-day baseline.
  - Block rollout if onboarding completion drops below 55% in pilot cohort.
  - Block rollout if RBAC authorization regression >0 in pre-release suite.
  - Auto-disable `ff_onboarding_wizard_v2` if two consecutive daily SLO breaches occur.
- **Test plan:** Pre-deploy quality gate checks; rollback game-day exercises.

---

## Consolidated execution queue (ordered)

1. **WO-FLAG-05** telemetry baseline
2. **WO-API-01 / WO-UI-02** visibility contract + nav shell
3. **WO-UI-01 / WO-API-02** advanced admin expansion + deep-link mediation
4. **WO-FLAG-01** onboarding wizard v2
5. **WO-SLO-01 / WO-SLO-02** SLO budgets + regression guardrails
6. **WO-COMPAT-01..04** compatibility migration waves
7. **WO-FLAG-04** lifecycle disclosure rollout

This sequencing minimizes user-facing risk while preserving governance/security integrity and keeping rollout reversible.
