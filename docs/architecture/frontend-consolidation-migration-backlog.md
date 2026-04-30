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
- **Status (2026-04-30): foundation landed + composable rewire layer landed; legacy `ClientLayout` adoption still pending.**
  - **2026-04-30 finished UI:** the rewire layer's modern-shell adoption + first real renderer landed.
    - **Capability hydration:** `apps/blackout-client/src/app/core/features/capabilityHydration.ts` ships `resolveDevCapabilitySeed` (parses `VITE_BLACKOUT_DEV_CAPABILITIES` / `BLACKOUT_DEV_CAPABILITIES` env tokens), `buildCapabilityContextValue` (dedupes fetched + dev seed preserving order), `hydrateCapabilityContext` (writes the merged set into the atom; falls back to dev seed alone on fetch failure so dev environments keep their previewable surfaces), and `applyCapabilityEventToStore` (handles `capability.granted` / `capability.revoked` envelopes against the atom). A small `<DevCapabilitySeeder />` component in `main.tsx` reads `import.meta.env` once on mount and seeds the atom — production deployments override via the SDK's `fetchCapabilities`.
    - **Modern shell adoption:** `RegistrySidebarList` is now mounted inside `apps/blackout-client/src/app/pages/client/ClientLayout.tsx` as a desktop-only section in the spaces rail (below quick actions, above the rail close); `RegistrySettingsList` is now mounted inside `apps/blackout-client/src/app/features/settings/Settings.tsx` as a new "Feature settings" page (`SettingsPages.FeatureSettingsPage`, icon `Icons.Category`). Registry-declared sidebar entries and settings sections from every BKL foundation now appear in the running modern shell once the user has the matching capabilities + flag.
    - **First real renderer:** the `/stego/channels` placeholder is replaced with `apps/blackout-client/src/app/features/stego-toolkit/StegoToolkitPage.tsx` — a working channel manager that lists snapshots (with `computeStegoExpiryAt`-derived expiry summaries), shows live `normalizeStegoChannelId` previews as the user types, and posts `CreateStegoChannelInput` payloads through an injectable `StegoToolkitFetcher` (production callers wire `createStegoActions(client)`; tests inject mocks). Other BKL placeholder routes (`/stego/channels/lifecycle`, `/settings/{preferences,sidebar,labs}`, `/settings/moderation/mjolnir`) follow the same pattern when they're built out.
    - **Tests:** `apps/blackout-client/tests/unit/core/features/capabilityHydration.test.ts` (10 cases) covers env tokenization, VITE precedence, merge dedupe, store writes (success + reject fallback), and grant/revoke event application. `apps/blackout-client/tests/unit/features/stego-toolkit/StegoToolkitPage.test.tsx` (7 cases) covers empty-state, snapshot rendering with three different ephemeral modes, id preview, submission guard, full create flow with refresh, conditional `ttlHours` forwarding, and load-error rendering. Total stego + rewire suite: 58 cases green.
    - **2026-04-30 rewire layer:** New `apps/blackout-client/src/app/core/features/{capabilityContext,RegistryRouteList,RegistrySidebarList,RegistrySettingsList}.tsx` ship a single composable layer that consumes the registry. Routes, sidebar/right-panel/workspace entries, and settings sections from every BKL foundation (001–009) now render through 3 small components driven by a `capabilityContextAtom` (jotai, default `[]` capabilities + `runtimeFeatureFlags`). Each component rebuilds the registry from the context's `flags` so env-driven flag toggles take effect without app restart. `main.tsx` now passes the registry-derived `RouteObject[]` (via `buildRegistryRouteObjects`) into `createBrowserRouter`'s children, and rebuilds the router via `useMemo` keyed on capabilities + flags so capability fetches at login surface their granted routes. Tests in `apps/blackout-client/tests/unit/core/features/registryRewireComponents.test.tsx` (9 cases) cover empty-render gating, sidebar `kind` filtering, settings filter prop, route resolution end-to-end via `MemoryRouter`, and `buildRegistryRouteObjects`'s capability filtering.
  - **2026-04-27 foundation:** Shell panel types + capability-gated `composeShellPanels` / `selectPanelsByKind` composer added in `apps/blackout-client/src/app/core/features/{types,composition}.ts`.
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
- **Status (2026-04-27): foundation landed; UI rewire pending.**
  - `adminEntry?: boolean` slot added to `FeatureCustomizationManifest` plus `composeAdminEntries` / `hasAdminEntries` composers in `apps/blackout-client/src/app/core/features/composition.ts`. Replaces the ad-hoc `showAdminEntry` boolean used by `apps/blackout-web/src/components/ServerSidebar.ts`.
  - New `platform-ops` core feature module at `apps/blackout-client/src/app/features/platform-ops/` contributing routes (`/ops/platform`, `/ops/platform/admin`), nav items, shell panels (workspace/sidebar/right-panel + admin sidebar), and Operations / Mobile / Admin settings sections. Two customizations gated by `platform-ops.read` and `platform-ops.admin` capabilities respectively, with the admin one annotated `adminEntry: true`.
  - `platformOps` flag added to `FeatureFlags` (default `false`) with `BLACKOUT_PLATFORM_OPS=true|false` env override on top of every feature mode.
  - `featureModuleManifest` allowlist extended with `platform-ops`.
  - Protocol contract: `packages/blackout-protocol/src/capabilities/events.ts` publishes `capability.granted` / `capability.revoked` envelopes plus `isCapabilityGrantedEvent` / `isCapabilityRevokedEvent` type guards.
  - SDK: `packages/blackout-sdk/src/capabilities/actions.ts` exposes `createCapabilityActions(client).fetchCapabilities()` (`GET /v1/capabilities`) and pure helpers `hasCapability`, `hasAllCapabilities`, `hasAnyCapability`, `applyCapabilityEvent`.
  - Tests at `apps/blackout-client/tests/unit/core/features/adminEntries.test.ts` (5 cases) and `apps/blackout-client/tests/unit/sdk/capabilities.test.ts` (6 cases) cover platform-ops contributions, admin entry hide/show on capability changes, off-flag pruning, capability helpers, event narrowing, and the SDK fetch contract.
  - **2026-04-30 rewire layer:** the `capabilityContextAtom` introduced for the BKL-001 rewire is the runtime sink for `applyCapabilityEvent` / `fetchCapabilities` results — components consuming `RegistrySidebarList` / `RegistrySettingsList` automatically reflect capability grants and revocations. The `composeAdminEntries` composer is still consumed only by the platform-ops module's own tests; the canonical sidebar adopts it once `RegistrySidebarList` (or a future `RegistryAdminEntryList` sibling) is mounted in `Sidebar.tsx`.
  - Remaining acceptance work: actually mount `RegistrySidebarList` / `RegistrySettingsList` in the legacy `ClientLayout` / `Settings.tsx` shells (rewire layer is in place; legacy adoption is incremental).

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
- **Status (2026-04-27): foundation landed; UI rewire pending.**
  - Protocol: `packages/blackout-protocol/src/governance/contracts.ts` adds `GovernanceMeetingPayload` (with `GovernanceMeetingStatus` and attendee refs) and `GovernanceTreasurySnapshotPayload` (precision-safe string balances). `events.ts` adds `GovernanceMeetingScheduled` / `GovernanceTreasurySnapshotPublished` envelopes plus `isGovernanceMeetingScheduled`, `isGovernanceTreasurySnapshotPublished`, and `isGovernanceVoteCast` type guards. `BlackoutEventName` is extended with the two new event names, and `GOVERNANCE_EVENT_NAMES` covers the new `co.bmc.governance.meeting` / `co.bmc.governance.treasury.snapshot` Matrix event types.
  - SDK: `packages/blackout-sdk/src/governance/actions.ts` extends `createGovernanceActions(client)` with `scheduleMeeting` (PUT keyed by `meetingId`), `listMeetings` (optional `proposalId` filter), `cancelMeeting`, `getTreasurySnapshot`, and `listTreasurySnapshots` (cursor + limit pagination, with non-positive limits dropped).
  - Canonical client: `apps/blackout-client/src/app/features/governance/` adds `/governance/meetings` and `/governance/treasury` route placeholders (settled by the canonical scheduler + snapshot ports), `governanceRightPanelTabs` (active|past|create|my-votes|results), `governanceMeetingPanels` and `governanceTreasuryPanels` workspace+sidebar entries, plus `governanceMeetingsSettings` / `governanceTreasurySettings`. Manifest splits into three customizations gated by `governance.read`, `governance.meetings.schedule`, and `governance.treasury.read` respectively, all behind the `governance` flag.
  - Tests at `apps/blackout-client/tests/unit/sdk/governanceActions.test.ts` (9 cases) and `apps/blackout-client/tests/unit/core/features/governanceTabsAndOps.test.ts` (4 cases) cover the new event-type strings, type-guard narrowing, every new SDK action's request shape, and capability-gated visibility of the right-panel tabs / meetings / treasury surfaces.
  - Remaining acceptance work: actually render the scheduler form and treasury snapshot UI (canonical components are placeholders) and wire the right-panel tab strip in the canonical Cinny shell. Both are deferred alongside the BKL-001/BKL-002 UI rewire.

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
- **Status (2026-04-27): foundation landed; UI rewire pending.**
  - Protocol: `packages/blackout-protocol/src/notifications/{contracts,events}.ts` publishes `NotificationRulePayload` (parity with `apps/blackout-web/src/types.ts:NotificationRule`), `PresenceDigestPayload` + `PresenceDigestActivity`, and the `PresenceDigestGenerated` / `PresenceDigestAcknowledged` envelopes plus `isPresenceDigestGenerated` / `isPresenceDigestAcknowledged` type guards. `BlackoutEventName` is extended with both new event names; `NOTIFICATIONS_EVENT_NAMES` covers the `co.bmc.notifications.digest.{generated,acknowledged}` Matrix event types.
  - SDK: `packages/blackout-sdk/src/notifications/actions.ts` ships `createNotificationActions(client)` with `fetchNotificationRules`, `upsertNotificationRule` (PUT keyed by `<feature>/<category>` with URL-encoding), `deleteNotificationRule`, `fetchPresenceDigest` (optional positive `windowMinutes`), and `acknowledgePresenceDigest`. Adds the pure `buildPresenceDigest(activities, nowIso, { windowMinutes })` helper that mirrors `apps/blackout-web/src/services/presence-digest.ts` and clamps malformed timestamps + negative windows.
  - Canonical client: new `apps/blackout-client/src/app/features/notifications-presence/` module with two capability-gated customizations — `notifications-rules` (settings only, gated by `notifications.rules.manage`) and `notifications-presence` (route + right-panel/sidebar panels + settings, gated by `notifications.presence.read`). Both ride behind a new `notificationsPresence` flag (default off) with `BLACKOUT_NOTIFICATIONS_PRESENCE` env override on every feature mode. Module registered in `featureModuleManifest`, `coreModules.ts`, and `allowlistManifest.test.ts`.
  - Tests: `apps/blackout-client/tests/unit/sdk/notificationsActions.test.ts` (12 cases) covers event-type strings, type-guard narrowing for both digest events, every SDK action's request shape (URL encoding, optional params, pagination), and `buildPresenceDigest` window math + malformed-input tolerance. `apps/blackout-client/tests/unit/core/features/notificationsPresenceModule.test.ts` (3 cases) covers presence digest route/panel exposure on capability change, settings hide/show on `notifications.rules.manage`, and total off-flag pruning.
  - Remaining acceptance work: actually render the notification-rule editor and presence digest inbox (canonical components are placeholders) and wire them into the canonical Cinny shell once BKL-001/002's UI rewire lands.

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
- **Status (2026-04-30): foundation landed; UI rewire pending.**
  - Protocol: `packages/blackout-protocol/src/stego/{contracts,events}.ts` publishes `StegoChannelCreatedPayload` (with `StegoCarrier` = `text|image|audio` and `StegoEphemeralMode` = `persistent|expire_after_hours|delete_on_read`), `StegoChannelRotatedPayload` (rotation index + opaque `materialFingerprint`; never plaintext key material), `StegoChannelExpiredPayload` (with `StegoChannelExpiryReason` = `ttl_elapsed|read_consumed|operator_revoked|policy_archived`), the matching envelope types, and `isStegoChannelCreated` / `isStegoChannelRotated` / `isStegoChannelExpired` type guards. `BlackoutEventName` is extended with all three new event names; `STEGO_EVENT_NAMES` covers the `co.bmc.stego.channel.{created,rotated,expired}` Matrix event types. Mirrors the legacy `StegoChannel` shape from `apps/blackout-web/src/app.ts` and the `StegoEnterprisePolicyState` lifecycle managed by `apps/blackout-client/src/app/features/steganography/stegoPolicyLifecycle.ts`.
  - SDK: `packages/blackout-sdk/src/stego/actions.ts` ships `createStegoActions(client)` with `listChannels`, `createChannel`, `rotateChannel` (URL-encoded id + opaque body), `expireChannel` (defaults `reason` to `operator_revoked`), and `fetchChannel`. Adds two pure helpers: `computeStegoExpiryAt` (returns the next expiry instant from `ephemeralMode` + `ttlHours` anchored on `lastRotatedAt ?? createdAt`, returning `null` for `persistent` / `delete_on_read` / non-positive TTL / unparseable anchors) and `normalizeStegoChannelId` (mirrors `apps/blackout-web/src/app.ts:normalizeStegoChannelId` so canonical and legacy hosts produce identical ids).
  - Canonical client: new `apps/blackout-client/src/app/features/stego-toolkit/` module with two capability-gated customizations — `stego-toolkit` (route + workspace+sidebar+right-panel + settings, gated by `stego.toolkit.use`) mirroring `composer_action:feature-composer-bmc-steganography`, and `ephemeral-stego-lifecycle` (route + right-panel+sidebar + settings, gated by `stego.lifecycle.manage`) mirroring `room_action:feature-room-ephemeral-stego`. Both ride behind a new `stegoToolkit` flag (default off) with `BLACKOUT_STEGO_TOOLKIT` env override on every feature mode. Module registered in `featureModuleManifest`, `coreModules.ts`, and `allowlistManifest.test.ts`. Lives alongside (and does not collide with) the existing `apps/blackout-client/src/app/features/steganography/` Hide/Reveal component folder, which BKL-008 will fold under the same flag.
  - Tests: `apps/blackout-client/tests/unit/sdk/stegoActions.test.ts` (18 cases) covers event-type strings, type-guard narrowing for all three envelopes (carrier/ephemeral-mode/reason union enforcement), every SDK action's request shape (URL encoding, default reason, body forwarding), the `computeStegoExpiryAt` math across all ephemeral modes + edge cases (rotation anchor, missing/non-positive TTL, unparseable anchors), and the `normalizeStegoChannelId` regex parity. `apps/blackout-client/tests/unit/core/features/stegoToolkitModule.test.ts` (3 cases) covers route/panel/settings exposure on each capability, capability isolation between toolkit and lifecycle, and total off-flag pruning.
  - **2026-04-30 finished UI:** the placeholder routes are replaced with working renderers. `apps/blackout-client/src/app/features/stego-toolkit/StegoToolkitPage.tsx` lists channel snapshots (with `computeStegoExpiryAt` summaries — Persistent / Auto-expires `<iso>` / Delete on read), shows live `normalizeStegoChannelId` previews as the user types, and posts `CreateStegoChannelInput` payloads through an injectable `StegoToolkitFetcher` (strips `ttlHours` unless mode is `expire_after_hours`). `apps/blackout-client/src/app/features/stego-toolkit/StegoLifecyclePage.tsx` lists active channels (filtering out expired ones), drives `rotateChannel(channelId, {passphrase})` with a per-row passphrase guard, and `expireChannel(channelId, {reason})` against the canonical `StegoChannelExpiryReason` union, refreshing the list after each action. Both routes accept an injectable fetcher (production wires `createStegoActions(client)`; tests inject mocks). 13 new page tests green; full sweep 208/208 in-scope.

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
- **Status (2026-04-27): foundation landed; UI rewire pending. Closes the WRAP-004 camera/media-pick deferral.**
  - Protocol: `packages/blackout-protocol/src/media/{contracts,events}.ts` publishes `MediaUploadCompletedPayload` (with `MediaUploadStatus` union and pipeline-final fields), `CallLaunchIntentPayload` (with `CallLaunchKind` = `element-call|pstn-dialpad|matrix-rtc`), corresponding envelope types, and `isMediaUploadCompleted` / `isCallLaunchIntent` type guards. `BlackoutEventName` is extended with both new event names; `MEDIA_EVENT_NAMES` covers the `co.bmc.media.upload.completed` / `co.bmc.call.launch.intent` Matrix types.
  - SDK: `packages/blackout-sdk/src/media/actions.ts` ships `createMediaActions(client)` (`fetchUploadProgress`, `cancelUpload`, `fetchCompletedUpload`) and `createCallActions(client)` (`launchCall`, `dialpadCall` injecting `kind=pstn-dialpad`, `getCallBootstrap`). Adds the pure `buildDialpadIntent(target, options)` helper that strips formatting characters from E.164 input and synthesizes intent ids when omitted.
  - Native bridge: `apps/blackout-client/src/platform/nativeMediaBridge.ts` adds `nativePickPhoto({ source })` which delegates to `@capacitor/camera` (camera/gallery native sheet) → `<input type="file" accept="image/*" capture>` fallback. This closes the WRAP-004 camera/media-pick deferral; the wrapper-parity report and archive signoff are flipped accordingly.
  - Canonical client: new `apps/blackout-client/src/app/features/media-call/` module with three capability-gated customizations — `media-pipeline` (route + right-panel + sidebar + settings, gated by `media.pipeline.read`), `call-dialpad` (route + workspace+sidebar panels + settings, gated by `call.dialpad.launch`), and `call-element` (route + sidebar + settings, gated by `call.element.launch`). All ride behind a new `mediaCall` flag (default off) with `BLACKOUT_MEDIA_CALL` env override on every feature mode. Module registered in `featureModuleManifest`, `coreModules.ts`, and `allowlistManifest.test.ts`.
  - Tests: `apps/blackout-client/tests/unit/sdk/mediaActions.test.ts` (12 cases) covers event-type strings, type-guard narrowing (including the kind union), all media + call SDK request shapes, and `buildDialpadIntent` formatting. `apps/blackout-client/tests/unit/native-pick-photo.test.tsx` (3 cases) covers the file-input fallback's cancel path, the `capture="environment"` hint for camera mode and its omission for gallery mode, and the picked-file payload shape. `apps/blackout-client/tests/unit/core/features/mediaCallModule.test.ts` (4 cases) covers route/panel/settings exposure on each capability, capability isolation between dialpad and Element Call, and total off-flag pruning.
  - Remaining acceptance work: render the actual upload progress widget, dialpad entry form, and Element Call launcher UI (canonical components are placeholders) and wire them into the canonical Cinny shell once BKL-001/002's UI rewire lands.

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
- **Status (2026-04-30): foundation landed; settings IA rewire pending.**
  - Protocol: `packages/blackout-protocol/src/settings/{contracts,events}.ts` publishes `SettingChangedPayload` (with `SettingsCategory` = `preferences|sidebar|labs`, `SettingsScope` = `device|account`, JSON `SettingsValue` recursive type), `LabsGateChangedPayload` (with `LabsGateReason` = `config_flag|developer_mode`), the matching envelope types, and `isSettingChanged` / `isLabsGateChanged` type guards. `BlackoutEventName` is extended with both new event names; `SETTINGS_EVENT_NAMES` covers the `co.bmc.settings.changed` / `co.bmc.settings.labs.gate.changed` Matrix event types.
  - SDK: `packages/blackout-sdk/src/settings/actions.ts` ships `createSettingsActions(client)` with `fetchBucket(scope, category)`, `setSetting(scope, category, key, value)` (PUT keyed by `<scope>/<category>/<key>` with URL-encoding; `value: null` clears the override), `fetchLabsFeatures`, `setLabsFeatureEnabled`, `fetchLabsGate`, and `setDeveloperMode`. Adds two pure helpers: `resolveLabsGate({configFlag, developerMode})` (matches `_port`'s `LabsUserSettingsTab.showLabsFlags()` — visible iff config OR developerMode, with `config_flag` taking precedence as the reason since it's the admin-driven `legacy.config.labs_gate`) and `applySettingChange` (merges a change envelope into a local bucket, returning the same reference on scope/category mismatch and clearing the key on `value: null`).
  - Canonical client: new `apps/blackout-client/src/app/features/settings-parity/` module with three capability-gated customizations — `settings-preferences` (route + sidebar + settings, gated by `settings.preferences.read`) mirroring `_port`'s `PreferencesUserSettingsTab`, `settings-sidebar` (gated by `settings.sidebar.read`) mirroring `SidebarUserSettingsTab`, and `settings-labs` (gated by `settings.labs.show`) mirroring `LabsUserSettingsTab` plus the `show_labs_settings` SdkConfig gate. All three ride behind a new `settingsParity` flag (default off) with `BLACKOUT_SETTINGS_PARITY` env override on every feature mode. Module registered in `featureModuleManifest`, `coreModules.ts`, and `allowlistManifest.test.ts`. Lives alongside (and does not collide with) the existing `apps/blackout-client/src/app/features/settings/` shell components.
  - Tests: `apps/blackout-client/tests/unit/sdk/settingsActions.test.ts` (13 cases) covers event-type strings, type-guard narrowing for both envelopes (category/scope/reason union enforcement), every SDK action's request shape (URL encoding, null-value clear, body forwarding), `resolveLabsGate`'s precedence rules, and `applySettingChange`'s merge / clear / mismatch semantics. `apps/blackout-client/tests/unit/core/features/settingsParityModule.test.ts` (4 cases) covers route/panel/settings exposure on each capability, capability isolation between prefs/sidebar/labs, the labs gate (no labs without `settings.labs.show`, even with prefs+sidebar), and total off-flag pruning.
  - **2026-04-30 finished UI:** the placeholder routes are replaced with working renderers. `apps/blackout-client/src/app/features/settings-parity/PreferencesPage.tsx` switches scope (device/account), lists current bucket values with optimistic clear-to-null, and lets the user set arbitrary keys via a draft form (uses `applySettingChange` for local merges). `apps/blackout-client/src/app/features/settings-parity/SidebarPage.tsx` mirrors `_port`'s `SidebarUserSettingsTab` meta-space toggles (Home/Favourites/People/Orphans/VideoRooms) keyed on `Spaces.enabledMetaSpaces.<MetaSpace>` with `_port`-matched defaults. `apps/blackout-client/src/app/features/settings-parity/LabsPage.tsx` renders the gate-state breakdown (`config flag` + `developer mode` + resolved `reason`) using `resolveLabsGate`, and only shows the feature toggle list when the gate resolves visible — flipping developer mode optimistically updates the gate without refetching. All three accept injectable fetchers; 11 new page tests green.

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
- **Status (2026-04-30): foundation landed; settings IA rewire pending.**
  - Canonical client: new `apps/blackout-client/src/app/features/stego-toolkit/StegoSettingsTab.tsx` mirrors `_port/src/components/views/settings/tabs/user/SteganographyUserSettingsTab.tsx` — a heading + device-level opt-in section, then folds in the existing `StegoSettings` panel from `apps/blackout-client/src/app/features/steganography/` so passphrases, advanced controls, and enterprise policy lifecycle live under the same tab. Persistence is delegated to the existing `blackout.settings.steganography.v1` `atomWithStorage` (parity with `_port`'s `LEVELS_DEVICE_ONLY_SETTINGS`).
  - Manifest: third customization `stego-settings-tab` added to `stegoToolkitFeature` (gated by new capability `stego.settings.read`, settings-only — no routes/panels). Rides behind the same `stegoToolkit` flag as the BKL-005 customizations so admins can enable the tab independently of the toolkit/lifecycle controls.
  - Tests: `apps/blackout-client/tests/unit/features/stego-toolkit/StegoSettingsTab.test.tsx` (3 cases) covers tab heading + opt-in section render, the round-trip toggle through `atomWithStorage` (writes to `localStorage` and toggles back), and hydration from a pre-seeded `localStorage` payload. `apps/blackout-client/tests/unit/core/features/stegoToolkitModule.test.ts` extended (+1 case = 4 total) to cover capability isolation for the dedicated tab and confirm full pruning when the flag is off.
  - Remaining acceptance work: surface the tab inside the canonical settings IA (settings shell rewire is shared with BKL-007) so users can navigate to it instead of importing the section programmatically.

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
- **Status (2026-04-30): foundation landed; settings IA rewire pending.**
  - Protocol: `packages/blackout-protocol/src/mjolnir/{contracts,events}.ts` publishes `BanListRulePayload` (with `BanListRuleKind` = `user|room|server` mirroring `_port`'s `EventType.PolicyRule{User,Room,Server}` and `BanListRuleRecommendation` = `ban|unban`), `BanListChangedPayload` (with op-specific shape — `created`/`updated` carry the rule, `removed` carries `removedRuleId`), `ProtectionDescriptor` + `ProtectionChangedPayload`, the matching envelope types, and `isBanListChanged` / `isProtectionChanged` type guards. `BlackoutEventName` is extended with both new event names; `MJOLNIR_EVENT_NAMES` covers the `co.bmc.moderation.mjolnir.{protection,banlist}.changed` Matrix event types.
  - SDK: `packages/blackout-sdk/src/mjolnir/actions.ts` ships `createMjolnirActions(client)` with banlist directory (`listBanLists`, `subscribeBanList`, `unsubscribeBanList`), banlist-rule CRUD (`addBanListRule`, `removeBanListRule`), and protection management (`listProtections`, `setProtectionEnabled` — body collapses to `{enabled}` when no per-protection settings supplied). Adds two pure helpers: `classifyBanListEntity` (mirrors the heuristic in `_port/src/components/views/settings/tabs/user/MjolnirUserSettingsTab.tsx` — `@…` → user, `!…` → room, otherwise server) and `applyBanListChange` (merges a banlist-changed envelope into a local snapshot, returning the same reference on listId mismatch or malformed op-payload, sorts rules newest-first by `updatedAt`).
  - Canonical client: extends the existing `apps/blackout-client/src/app/features/moderation/` module with a third capability-gated customization `mjolnir-settings` (route + sidebar + settings, gated by new capability `moderation.mjolnir.manage`) sitting alongside the existing `draupnir-console` customization. Rides behind the existing `moderation` flag so admins enabling moderation get the option to grant the mjolnir capability independently of `moderation.read`/`moderation.write`.
  - Tests: `apps/blackout-client/tests/unit/sdk/mjolnirActions.test.ts` (14 cases) covers event-type strings, type-guard narrowing for both envelopes (op-specific payload checks + recommendation/kind unions), every SDK action's request shape (URL encoding, settings-collapse), `classifyBanListEntity`'s heuristics + empty-input handling, and `applyBanListChange`'s create / update / remove / mismatch / malformed paths with newest-first re-sort. `apps/blackout-client/tests/unit/core/features/mjolnirSettingsModule.test.ts` (3 cases) covers route/panel/settings exposure on `moderation.mjolnir.manage`, capability isolation between draupnir-console and mjolnir-settings, and total off-flag pruning.
  - **2026-04-30 finished UI:** the placeholder route is replaced with `apps/blackout-client/src/app/features/moderation/MjolnirSettingsPage.tsx` — a working banlist editor (auto-classifies `@user` / `!room` / server entities via `classifyBanListEntity`, lists subscribed lists with active-list switcher, supports add/remove rule against the canonical `addBanListRule` / `removeBanListRule` SDK actions) plus a protection toggle list (driven by `setProtectionEnabled` against `ProtectionDescriptor` snapshots). Accepts an injectable `MjolnirFetcher`; 7 new page tests green.
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
