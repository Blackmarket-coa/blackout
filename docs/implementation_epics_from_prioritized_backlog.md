# Implementation Epics from Prioritized Backlog

## Source
Derived from the ranked backlog and 2-week cut line; converts highest-priority items into implementation-ready epics.

---

## Epic E1 — First-Run Wizard Hardening (TTFV Path)

### Scope
Consolidate create/join → first room → invite → first thread/call into a resilient, low-friction 4-step flow.

### API tasks
- Add/extend onboarding session API with deterministic `step_state` and resumability.
- Add `wizard_completion` endpoint returning completion reason (`thread`, `call`, `skip_reminder`).

### UI tasks
- Implement strict one-primary-CTA step layouts.
- Add progress indicator + completion checklist.
- Add skip-with-reminder UX for invite step.

### Telemetry hooks
- `onboarding_step_viewed`
- `onboarding_step_completed`
- `onboarding_step_skipped`
- `onboarding_completed`

### Feature-flag controls
- `ff_onboarding_wizard_v2` (cohort-gated)
- dependency: `ff_onboarding_telemetry_v1`

### Test matrix
- Unit: step state transitions + validation rules.
- Integration: onboarding session resume across refresh/login.
- E2E: happy path + skip path + error recovery path.
- Perf: p95 per step latency against budget.

### Rollback plan
- Disable `ff_onboarding_wizard_v2` to restore legacy onboarding.
- Preserve event emission under telemetry flag for comparative diagnostics.

---

## Epic E2 — Template-First Room Creation + Deferred Advanced Metadata

### Scope
Make room presets the default path and collapse advanced metadata under optional customization.

### API tasks
- Add `room_template_id` + `customized_fields` to room-create contract.
- Maintain backward compatibility for legacy room-create payloads.

### UI tasks
- Render preset cards first (Team Chat / Project / Announcements).
- Move advanced options into “Customize (optional)” accordion.

### Telemetry hooks
- `room_template_selected`
- `room_create_customization_opened`
- `room_created`

### Feature-flag controls
- `ff_room_template_first_v1`
- dependency: `ff_nav_simplification_v1`

### Test matrix
- Contract tests for old/new payload compatibility.
- UI tests for preset-first ordering and accordion behavior.
- E2E tests for create-room from onboarding and from workspace shell.

### Rollback plan
- Turn off `ff_room_template_first_v1`; keep legacy room create form as primary.

---

## Epic E3 — Invite Flow Optimization + Assisted Prompts

### Scope
Improve invite conversion by reordering methods and adding guided prompts.

### API tasks
- Normalize invite API response with method-specific errors and retry hints.
- Add reminder scheduling endpoint for “skip for now.”

### UI tasks
- Prioritize “Copy link” then email then directory.
- Add inline helper text and error recovery prompts.
- Add reminder confirmation state when skipped.

### Telemetry hooks
- `invite_started`
- `invite_sent`
- `invite_failed`
- `invite_skip_reminder_set`

### Feature-flag controls
- `ff_invite_flow_v2`
- dependency: `ff_onboarding_wizard_v2`

### Test matrix
- Unit: invite-method selection and validation.
- Integration: reminder scheduling and delivery.
- E2E: invite success/failure/retry and skip flows.

### Rollback plan
- Disable `ff_invite_flow_v2`; fallback to legacy invite modal while retaining reminder endpoint.

---

## Epic E4 — Admin Advanced Modules Collapsed by Default (RBAC)

### Scope
Hide advanced governance/federation/privacy modules by default for non-admin users; preserve admin discoverability.

### API tasks
- Add `settings_surface` contract (`visible_sections`, `advanced_sections`, `discoverability_hints`).
- Add deep-link resolver (`direct`, `advanced_collapsed`, `denied`).

### UI tasks
- Build reusable `AdvancedAdminSection` component.
- Add admin-only expansion with context banner.
- Add denied-state UX for unauthorized deep links.

### Telemetry hooks
- `advanced_panel_opened`
- `advanced_deeplink_resolved`
- `advanced_access_denied`

### Feature-flag controls
- `ff_admin_advanced_expansion_v1`
- dependency: `rbac_admin_visibility_v1`

### Test matrix
- RBAC authorization regression suite.
- Route/deeplink tests by role and client surface.
- Accessibility tests for collapsed/expanded patterns.

### Rollback plan
- Disable `ff_admin_advanced_expansion_v1`; restore direct admin navigation entries.
- Keep RBAC policy checks enforced regardless of UI state.

---

## Epic E5 — Role-Conditioned Navigation Simplification

### Scope
Simplify top-level navigation while preserving complete admin route coverage.

### API tasks
- Provide route manifest with role metadata from config service.
- Version route schema for backward client compatibility.

### UI tasks
- Ship simplified nav shell (Home, Rooms, DMs, Activity, Calls, Admin).
- Role-aware rendering + ordering.

### Telemetry hooks
- `nav_item_clicked`
- `settings_entry_opened`
- `nav_backtrack_detected`

### Feature-flag controls
- `ff_nav_simplification_v1`
- dependency: `ff_admin_advanced_expansion_v1`

### Test matrix
- Snapshot tests for role-specific nav variants.
- E2E route traversal by role.
- Legacy link continuity checks.

### Rollback plan
- Disable `ff_nav_simplification_v1`; return to prior nav composition.
- Preserve route manifest support for phased client migrations.

---

## Epic E6 — Day-7 Lifecycle Discovery Nudges (Governance Lite)

### Scope
Surface governance-lite discovery only after usage maturity signals.

### API tasks
- Add `lifecycle/disclosure/eligibility` service with day bucket + usage triggers.
- Add nudge state endpoint (seen/dismissed/clicked).

### UI tasks
- Render Day-7 admin nudge cards in Admin Home/Activity.
- Add dismissal, snooze, and contextual routing.

### Telemetry hooks
- `nudge_seen_day_7`
- `nudge_clicked_day_7`
- `nudge_dismissed_day_7`

### Feature-flag controls
- `ff_lifecycle_disclosure_v1`
- dependencies: `eligibility_signals_v1`, `ff_onboarding_telemetry_v1`

### Test matrix
- Eligibility rule unit tests.
- Integration tests for nudge state persistence.
- E2E tests for seen→click→destination journey.

### Rollback plan
- Disable `ff_lifecycle_disclosure_v1`; revert to static admin checklist entry.

---

## Epic E7 — Onboarding Telemetry Completeness + KPI Pipeline

### Scope
Guarantee end-to-end event completeness and KPI freshness for rollout decisions.

### API tasks
- Enforce event schema contract validation at ingestion.
- Add dead-letter queue handling and replay tooling.

### UI tasks
- Ensure event SDK dispatch on every onboarding/advanced discovery transition.
- Add client-side retry policy and fail-safe buffering.

### Telemetry hooks
- Core funnel: `onboarding_started` ... `onboarding_completed`
- Discovery: `governance_module_opened`, `federation_settings_opened`
- Confusion: `confusion_signal_backtrack`, `confusion_signal_idle_timeout`

### Feature-flag controls
- `ff_onboarding_telemetry_v1`
- dependency: none (foundation flag)

### Test matrix
- Schema contract tests.
- Pipeline completeness and freshness SLA checks.
- Dashboard parity checks vs raw event counts.

### Rollback plan
- Keep telemetry flag ON by default; if needed, disable only non-critical enrichment events (not compliance/audit critical events).

---

## Epic E8 — Legacy Compatibility + Migration Guardrails

### Scope
Protect existing users during IA/nav changes through controlled migration and continuity.

### API tasks
- Implement compatibility adapters for legacy endpoints/contracts.
- Tenant-level cohort override APIs.

### UI tasks
- Show context banner for migrated routes.
- Offer temporary “classic entry” for governance-heavy admins during wave rollout.

### Telemetry hooks
- `legacy_route_redirected`
- `classic_entry_used`
- `migration_banner_dismissed`

### Feature-flag controls
- `ff_workspace_migration_wave_v1`
- dependency: `ff_nav_simplification_v1`

### Test matrix
- Migration replay tests on sampled production-like tenants.
- Cohort opt-in/out behavior tests.
- Regression tests for permission semantics parity.

### Rollback plan
- Pause migration waves and revert affected tenants to classic navigation/profile via cohort override.

---

## Cross-epic release controls

- **Global release gate:** no rollout expansion if Day-1 activation or support tickets per 100 workspaces are red.
- **Operational control:** each epic must ship with explicit owner, canary cohort, and rollback command in release runbook.
- **Auditability:** every rollback decision must attach KPI snapshot + incident/risk note.
