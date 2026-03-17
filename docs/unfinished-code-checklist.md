# Unfinished Code Checklist

Auto-generated from TODO/FIXME/TBD/not-implemented markers across `src/`, `scripts/`, `docs/`, and `test/.`

- Excludes generated/vendor-heavy paths (`src/i18n/**`, `docs/lib/**`, `*.snap`), changelog, and this checklist file itself.
- Open items: **28**
- Resolved items tracked in this checklist: **43**
- Total files with tracked markers: **16**

## Checklist

## Recently resolved high-priority markers

- [x] MessageEvent location-routing cleanup: moved stable location body mapping into event-type registry and retained legacy `m.room.message` fallback for compatibility (evidence: `docs/operations/evidence/2026-03-17-messageevent-location-eventtype-closure.md`).
- [x] Sprint D P2 marker batch: closed next ranked top-10 queue (LegacyCallEventGrouper, LoggedInView, RoomSearchView, InteractiveAuthEntryComponents, RoomCallBanner, ModalWidgetDialog, SpotlightDialog, AppTile, RoomAliasField, MFileBody) and advanced self-healing + townhall mitigation validation (evidence: `docs/operations/evidence/2026-03-16-sprint-d-top10-selfhealing-townhall-closure.md`).
- [x] Sprint C risk-queue closure: completed ranked risk items #1-#10 (MImageBody, AliasSettings, EventIndex, SpaceStore, VerificationPanel, LinkPreviewWidget, Stickerpicker, Notifications, WidgetStore, UserProvider) with code + tests + tracker synchronization (evidence: `docs/operations/evidence/2026-03-16-sprint-c-risk-queue-1-10-closure.md`).
- [x] Sprint B P2 marker batch: closed 15 long-tail markers across utils/notifications/widgets/test scaffolding while preserving existing runtime behavior and compatibility constraints (evidence: `docs/operations/evidence/2026-03-16-p2-marker-sprint-batch-4.md`).
- [x] P2 marker sprint: closed composer, widget-store, and room-list algorithm marker clusters with implementation notes, m.widget state-event handling, and refreshed tracker counts (evidence: `docs/operations/evidence/2026-03-16-p2-marker-sprint-composer-widget-roomlist.md`).
- [x] P2 behavior batch: merged multi-event overlap search timelines in RoomSearchView, added inline add-3pid email validation, and clear edit-draft localStorage state on end-edit for WYSIWYG composer (evidence: `docs/operations/evidence/2026-03-15-p2-burndown-batch-3.md`).
- [x] P2 maintenance sweep: retired legacy TODO/FIXME markers in ViewSource, ScrollPanel, CaptchaForm, WidgetCapabilitiesPromptDialog, TextualBody, and EmojiButton by documenting stabilized behavior and compatibility constraints.
- [x] Batch closure (15 markers): test/docs marker debt resolved for MatrixChat/RoomCallBanner test gaps, slash-command/space-store/matrixchat regression comments, and vector shell i18n/theme backlog annotations.
- [x] `src/components/structures/MatrixChat.tsx` (uc-010): view-room navigation now drops stale async transitions during burst actions and send-event handling now safely rejects malformed payloads/failures without state-machine regressions.
- [x] `src/accessibility/KeyboardShortcuts.ts` (uc-008): keyboard shortcut utilities now filter malformed bindings, handle unsupported platform override contexts safely, and preserve deterministic collision behavior for UI/runtime shortcut parity.
- [x] `src/components/structures/MessagePanel.tsx` (uc-006): room-scoped hidden-event visibility overrides now persist per-room in local storage and fall back safely to the global timeline default.
- [x] `src/components/structures/MatrixChat.tsx` (uc-004): room/event ID fragment parsing now preserves v3 event IDs and safely decodes URL-encoded fragments with fallback logging for malformed encodings.
- [x] `src/components/structures/auth/Login.tsx` (uc-005): register button flow now explicitly blocks registration when homeserver policy returns `registrationEnabled === false` and preserves SSO-register routing where supported.
- [x] `src/components/views/rooms/wysiwyg_composer/components/WysiwygAutocomplete.tsx`: community autocomplete selections now insert plain text into the composer instead of no-op behavior.

### `src/components/views/room_settings/RoomProfileSettings.tsx`

- [ ] L53: `// TODO: Merge with ProfileSettings?`
- [ ] L141: `// TODO: What do we do about errors?`

### `src/components/views/rooms/BasicMessageComposer.tsx`

- [ ] L751: `// TODO: does this allow us to get rid of EditorStateTransfer?`

### `src/components/views/rooms/LegacyRoomList.tsx`

- [ ] L433: `// TODO: Replace with archived view: https://github.com/vector-im/element-web/issues/14038`

### `src/components/views/rooms/RoomSublist.tsx`

- [ ] L86: `// TODO: Use re-resizer's NumberSize when it is exposed as the type`

### `src/components/views/rooms/RoomTile.tsx`

- [ ] L298: `// TODO: [FTUE Notifications] Probably need to detect global mute state`

### `src/components/views/settings/ChangePassword.tsx`

- [ ] L241: `// TODO: We can remove this check (but should add some Playwright tests to`

### `src/components/views/settings/tabs/room/BridgeSettingsTab.tsx`

- [ ] L61: `// TODO: We don't have this link yet: this will prevent the translators`
- [ ] L83: `// TODO: We don't have this link yet: this will prevent the translators`

### `src/components/views/settings/tabs/user/AccountUserSettingsTab.tsx`

- [ ] L151: `// TODO: Figure out a design that doesn't involve replacing the current dialog`
- [ ] L160: `// TODO: Figure out a design that doesn't involve replacing the current dialog`

### `src/device-listener/DeviceListenerOtherDevices.ts`

- [ ] L86: `// TODO: maybe we don't need a full DeviceListener check? (Maybe we only`
- [ ] L121: `// TODO: maybe we don't need a full DeviceListener check? (Maybe we only`

### `src/integrations/IntegrationManagers.ts`

- [ ] L84: `// TODO: Log out of the scalar clients`

### `src/mjolnir/Mjolnir.ts`

- [ ] L22: `// TODO: Move this and related files to the js-sdk or something once finalized.`

### `src/resizer/resizer.ts`

- [ ] L36: `// TODO move vertical/horizontal to config option/container class`

### `src/settings/Settings.tsx`

- [ ] L758: `// TODO: Wire up appropriately to UI (FTUE notifications)`
- [ ] L1331: `// TODO: Rename with settings v3`

### `src/settings/controllers/DeviceIsolationModeController.ts`

- [ ] L36: `: // TODO: As part of https://github.com/element-hq/element-meta/issues/2492, we will change`

### `src/settings/controllers/NotificationControllers.ts`

- [ ] L33: `// TODO: [TS] Formal type that doesn't cause a cyclical reference.`

### `src/stores/OwnBeaconStore.ts`

- [ ] L305: `// TODO check powerlevels here`

### `src/utils/DMRoomMap.ts`

- [ ] L26: `// TODO: convert these to maps`
- [ ] L156: `// TODO: [Canonical DMs] Handle lookups for email addresses.`

### `test/jest-mocks.ts`

- [ ] L9: `// https://jestjs.io/docs/en/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom`

