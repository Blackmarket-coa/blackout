# Frontend Consolidation Migration Backlog

Source disposition: `docs/architecture/frontend-consolidation-disposition.md`.
Scope: all `ported` items.
Canonical destination: `apps/blackout-client` feature registry + manifests.

## Prioritization model

- **P0**: Critical-path, high user impact, blocks multiple downstream items.
- **P1**: High impact but parallelizable after P0 foundations.
- **P2**: Important parity hardening and legacy cleanup completion.

## Critical path and dependency ordering

1. **BKL-001 / BKL-002** — registry + shell/nav extension foundation.
2. **BKL-003 / BKL-004 / BKL-005** — governance, auth, notifications capability integrations on top of registry.
3. **BKL-006 / BKL-007 / BKL-008** — media/stego/settings/admin parity once contracts exist.
4. **BKL-009 / BKL-010 / BKL-011 / BKL-012** — deaddrop/community, discover activity, and remaining legacy parity finishing tasks.

---

## Grouped backlog by target module

### Target module: `apps/blackout-client/src/app/pages + sidebar + featureRegistry`

#### BKL-001 (P0) — Unify multi-surface shell navigation model
- **Maps feature_ids:** `web.workspace.tabs`, `web.mobile.tabs`, `web.sidebar.nav`
- **Source behavior:** `apps/blackout-web` exposes workspace panel model (`chat|dms|activity|calls|files|repo-tools|discover`), mobile tab model, and sidebar admin/file/call entry points.
- **Destination module/manifest:**
  - Extend canonical shell route/nav registration via `featureRegistry`-driven nav contributions.
  - Add normalized shell panel definitions in client page/nav layer and route adapters.
- **SDK/protocol needs:**
  - Protocol event schema for shell panel selection and deep-linkable panel state (`@blackout/protocol`).
  - SDK façade for panel metadata and capability availability (`@blackout/sdk`).
- **Acceptance test requirement:**
  - Router/nav integration tests for each new shell panel state.
  - Mobile vs desktop nav parity tests for tab/rail behavior.
  - Regression test: canonical Home/Direct/Explore/Inbox flows unchanged.
- **Dependencies:** none (foundation).
- **Status (2026-04-27): foundation landed; UI rewire pending.**
  - Shell panel types + capability-gated `composeShellPanels` / `selectPanelsByKind` composer added in `apps/blackout-client/src/app/core/features/{types,composition}.ts`.
  - `panels?` manifest slot added to `FeatureCustomizationManifest` and `BlackoutFeature`.
  - Governance feature contributes a working set of panels (`workspace`, `mobile-tab`, `sidebar`) at `apps/blackout-client/src/app/features/governance/panels.ts` to prove the pipeline end-to-end.
  - Protocol event schema for `shell.panel.selected` published from `packages/blackout-protocol/src/shell/events.ts` (with `isShellPanelSelectedEvent` type guard).
  - SDK panel-metadata façade `createShellPanelCatalog` exposed from `packages/blackout-sdk/src/shell/panelMetadata.ts`, including `listPanels`, `findPanel`, `canAccess`, and `buildSelectionEvent`.
  - Tests at `apps/blackout-client/tests/unit/core/features/shellPanels.test.ts` (4 cases) and `apps/blackout-client/tests/unit/sdk/shellPanelCatalog.test.ts` (9 cases) cover composer ordering, capability gating, catalog dedup, capability checks, and selection-event round-trip.
  - Remaining acceptance work: actually rewire the canonical sidebar/tab/mobile-rail UI to consume the composer (deferred as part of BKL-002 delivery), plus router-integration tests once the UI is in place.

---

### Target module: `apps/blackout-client/src/app/core/features`

#### BKL-002 (P0) — Expand feature registry manifests for ops/admin panels
- **Maps feature_ids:** `web.settings.pages`, `web.panel.platform_ops`, `web.cap.admin_entry`, `web.feature.entrypoints`
- **Source behavior:** `apps/blackout-web` has settings IA (`workspace|appearance|monetization|mobile|operations`) and explicit admin entry gating.
- **Destination module/manifest:**
  - Add platform/ops feature manifests (`routes`, `navItems`, `settings`, `capabilities`) under registry plugins.
  - Replace ad-hoc admin visibility with manifest capability declarations.
- **SDK/protocol needs:**
  - `@blackout/sdk` capability fetch/check APIs.
  - `@blackout/protocol` admin capability event contract for runtime updates.
- **Acceptance test requirement:**
  - Manifest snapshot tests proving deterministic route/nav/settings aggregation.
  - Capability-gate tests ensuring admin entries hide/show correctly.
- **Dependencies:** BKL-001.

#### BKL-010 (P2) — Federated ops and townhall/revenue panel migration
- **Maps feature_ids:** `web.panel.federation`, `web.panel.revenue_ops`, `web.panel.townhall`
- **Source behavior:** Federation health, revenue ops, and townhall are panelized in `apps/blackout-web` but not canonicalized.
- **Destination module/manifest:**
  - New registry modules for federation health and townhall/revenue operations.
  - Route/nav/settings contributions bound to canonical panel host.
- **SDK/protocol needs:**
  - SDK clients for federation metrics/ops actions and governance treasury/townhall data.
  - Protocol events for townhall lifecycle + federation alert statuses.
- **Acceptance test requirement:**
  - Contract tests for SDK adapters against mocked responses.
  - End-to-end smoke tests for panel load, state transitions, and permission denied states.
- **Dependencies:** BKL-001, BKL-002, BKL-003.

#### BKL-011 (P2) — Auth and thread-activity parity extensions
- **Maps feature_ids:** `web.feature.auth_oidc`, `legacy.config.threads_activity`
- **Source behavior:** OIDC/delegated-auth and threads activity center capabilities present in migration/legacy configs.
- **Destination module/manifest:**
  - Add auth capability manifests + thread-activity navigation module in canonical registry.
  - Wire settings toggles/visibility to canonical settings and activity inbox flows.
- **SDK/protocol needs:**
  - SDK OIDC bootstrap/session continuation abstractions.
  - Protocol event for activity-center unread and thread transitions.
- **Acceptance test requirement:**
  - Auth integration tests for delegated login fallback.
  - Thread activity inbox tests (unread counts, navigation jumps).
- **Dependencies:** BKL-001, BKL-002.

#### BKL-012 (P2) — Education route parity decision + implementation
- **Maps feature_ids:** `port.blackout.route.education`
- **Source behavior:** `_port` exposes `/blackout/education` module route.
- **Destination module/manifest:**
  - Add explicit `education` feature manifest in canonical registry (or formalize deprecation decision in follow-up disposition update).
- **SDK/protocol needs:**
  - SDK content retrieval abstraction for education modules.
  - Protocol route contract for educational module deep-linking.
- **Acceptance test requirement:**
  - Route reachability test for education entry.
  - Navigation discoverability test from canonical shell.
- **Dependencies:** BKL-001, BKL-002.

---

### Target module: `apps/blackout-client/src/app/features/governance`

#### BKL-003 (P1) — Governance right-panel + scheduling/treasury parity
- **Maps feature_ids:** `web.rightpanel.governance`, `gov.meeting_scheduler`, `gov.treasury_ops`
- **Source behavior:** Governance right-panel tabs and dedicated meeting/treasury widgets exist outside canonical client.
- **Destination module/manifest:**
  - Extend governance feature with right-panel tabs (`active|past|create|my-votes|results`).
  - Add meeting scheduler and treasury ops subroutes/settings entries.
- **SDK/protocol needs:**
  - SDK governance service for proposal, scheduling, treasury snapshot endpoints.
  - Protocol contracts for vote/schedule/treasury update events.
- **Acceptance test requirement:**
  - Governance route integration tests for each tab and new scheduler/treasury surfaces.
  - Contract tests validating event payload compatibility.
- **Dependencies:** BKL-001, BKL-002.

---

### Target module: `apps/blackout-client/src/app/pages/client/inbox + features/settings`

#### BKL-004 (P1) — Presence digest + notification policy parity
- **Maps feature_ids:** `web.feature.notifications_presence`
- **Source behavior:** Presence digest and notification policy controls are in `apps/blackout-web` settings/commands.
- **Destination module/manifest:**
  - Add notification/presence capability entries to canonical inbox + settings modules.
- **SDK/protocol needs:**
  - SDK notification rules and digest retrieval APIs.
  - Protocol events for digest generation/acknowledgement.
- **Acceptance test requirement:**
  - Notification settings integration tests with digest mode toggles.
  - Inbox behavior tests for digest ingestion and read-state updates.
- **Dependencies:** BKL-002.

---

### Target module: `apps/blackout-client/src/app/features/steganography + settings`

#### BKL-005 (P1) — Stego toolkit and ephemeral lifecycle parity
- **Maps feature_ids:** `web.feature.stego_toolkit`
- **Source behavior:** Stego toolkit and ephemeral stego room actions exist as feature entrypoints in migration shell.
- **Destination module/manifest:**
  - Add dedicated steganography feature manifest with route/nav/settings contributions.
  - Expose ephemeral lifecycle controls in canonical room/settings surfaces.
- **SDK/protocol needs:**
  - SDK steganography lifecycle API (create/rotate/expire channels).
  - Protocol message metadata contract for stego lifecycle state.
- **Acceptance test requirement:**
  - Unit tests for stego lifecycle reducers/actions.
  - End-to-end flow: create stego channel, post, rotate, expire.
- **Dependencies:** BKL-002.

---

### Target module: `apps/blackout-client/src/app/features/room + call + settings`

#### BKL-006 (P1) — Media pipeline, dialpad, and Element Call parity
- **Maps feature_ids:** `web.feature.media_pipeline`, `port.nav.leftpanel.dialpad`, `legacy.config.element_call`
- **Source behavior:** Media pipeline widgets, PSTN-like dialpad entry, and Element Call integration endpoint exist in migration/legacy surfaces.
- **Destination module/manifest:**
  - Add media/call feature manifests and explicit room-level actions.
  - Add dialpad launch surface and call integration settings.
- **SDK/protocol needs:**
  - SDK media upload/transcode metadata APIs and call bootstrap adapters.
  - Protocol contracts for call launch intents and media pipeline status.
- **Acceptance test requirement:**
  - Upload/viewer tests (file, image, preview, error path).
  - Call/dialpad smoke tests including unsupported-capability fallback.
- **Dependencies:** BKL-001, BKL-002.

---

### Target module: `apps/blackout-client/src/app/features/settings`

#### BKL-007 (P1) — Legacy settings parity extension (prefs/sidebar/labs)
- **Maps feature_ids:** `port.settings.preferences`, `port.settings.sidebar`, `port.settings.labs`, `legacy.config.labs_gate`
- **Source behavior:** `_port` and `legacy/element` include explicit preferences/sidebar/labs controls and labs gating.
- **Destination module/manifest:**
  - Expand canonical settings IA with mapped sections and labs capability controls.
  - Add settings manifest entries tied to registry capability checks.
- **SDK/protocol needs:**
  - SDK persisted user settings API for labs and sidebar preferences.
  - Protocol event for settings change propagation across runtimes.
- **Acceptance test requirement:**
  - Settings navigation tests for new sections.
  - Capability-gate tests for labs visibility by config/capability.
- **Dependencies:** BKL-002.

#### BKL-008 (P1) — Dedicated steganography settings tab parity
- **Maps feature_ids:** `port.settings.steganography`
- **Source behavior:** `_port` exposes an explicit Steganography settings tab.
- **Destination module/manifest:**
  - Add dedicated stego settings section integrated with BKL-005 feature module.
- **SDK/protocol needs:**
  - Reuse BKL-005 stego SDK/protocol contracts.
- **Acceptance test requirement:**
  - Settings tab render and persistence tests for stego controls.
- **Dependencies:** BKL-005, BKL-007.

---

### Target module: `apps/blackout-client/src/app/features/moderation`

#### BKL-009 (P1) — Mjolnir moderation settings parity
- **Maps feature_ids:** `port.settings.mjolnir`
- **Source behavior:** `_port` has dedicated Mjolnir tab/capability-gated moderation controls.
- **Destination module/manifest:**
  - Add moderation settings submodule for Mjolnir controls and state.
- **SDK/protocol needs:**
  - SDK moderation policy client (banlists/protections/status).
  - Protocol events for moderation protection state updates.
- **Acceptance test requirement:**
  - Permission-gated moderation settings tests.
  - Integration tests for protection status rendering and refresh.
- **Dependencies:** BKL-002.

---

### Target module: `apps/blackout-client/src/app/features/deaddrop`

#### BKL-013 (P2) — Mutual-aid route parity in dead-drop domain
- **Maps feature_ids:** `port.blackout.route.mutual_aid`
- **Source behavior:** `_port` provides `/blackout/mutual-aid` route tied to community support workflows.
- **Destination module/manifest:**
  - Extend deaddrop/domain manifest with mutual-aid route/nav contribution.
- **SDK/protocol needs:**
  - SDK dead-drop/mutual-aid data actions.
  - Protocol contract for mutual-aid thread/events routing.
- **Acceptance test requirement:**
  - Route integration tests and deep-link coverage for mutual-aid.
- **Dependencies:** BKL-001, BKL-002.

## Ported-item traceability (every item mapped)

| feature_id | backlog_id |
|---|---|
| web.workspace.tabs | BKL-001 |
| web.mobile.tabs | BKL-001 |
| web.sidebar.nav | BKL-001 |
| web.settings.pages | BKL-002 |
| web.panel.platform_ops | BKL-002 |
| web.cap.admin_entry | BKL-002 |
| web.feature.entrypoints | BKL-002 |
| web.rightpanel.governance | BKL-003 |
| gov.meeting_scheduler | BKL-003 |
| gov.treasury_ops | BKL-003 |
| web.feature.notifications_presence | BKL-004 |
| web.feature.stego_toolkit | BKL-005 |
| web.feature.media_pipeline | BKL-006 |
| port.nav.leftpanel.dialpad | BKL-006 |
| legacy.config.element_call | BKL-006 |
| port.settings.preferences | BKL-007 |
| port.settings.sidebar | BKL-007 |
| port.settings.labs | BKL-007 |
| legacy.config.labs_gate | BKL-007 |
| port.settings.steganography | BKL-008 |
| port.settings.mjolnir | BKL-009 |
| web.panel.federation | BKL-010 |
| web.panel.revenue_ops | BKL-010 |
| web.panel.townhall | BKL-010 |
| web.feature.auth_oidc | BKL-011 |
| legacy.config.threads_activity | BKL-011 |
| port.blackout.route.education | BKL-012 |
| port.blackout.route.mutual_aid | BKL-013 |
