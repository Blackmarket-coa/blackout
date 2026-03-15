# Unfinished Code Checklist

Auto-generated from TODO/FIXME/TBD/not-implemented markers across `src/`, `scripts/`, `docs/`, and `test/.`

- Excludes generated/vendor-heavy paths (`src/i18n/**`, `docs/lib/**`, `*.snap`), changelog, and this checklist file itself.
- Open items: **89**
- Resolved items tracked in this checklist: **29**
- Total files with tracked markers: **67**

## Checklist

## Recently resolved high-priority markers

- [x] P2 maintenance sweep: retired legacy TODO/FIXME markers in ViewSource, ScrollPanel, CaptchaForm, WidgetCapabilitiesPromptDialog, TextualBody, and EmojiButton by documenting stabilized behavior and compatibility constraints.
- [x] Batch closure (15 markers): test/docs marker debt resolved for MatrixChat/RoomCallBanner test gaps, slash-command/space-store/matrixchat regression comments, and vector shell i18n/theme backlog annotations.
- [x] `src/components/structures/MatrixChat.tsx` (uc-010): view-room navigation now drops stale async transitions during burst actions and send-event handling now safely rejects malformed payloads/failures without state-machine regressions.
- [x] `src/accessibility/KeyboardShortcuts.ts` (uc-008): keyboard shortcut utilities now filter malformed bindings, handle unsupported platform override contexts safely, and preserve deterministic collision behavior for UI/runtime shortcut parity.
- [x] `src/components/structures/MessagePanel.tsx` (uc-006): room-scoped hidden-event visibility overrides now persist per-room in local storage and fall back safely to the global timeline default.
- [x] `src/components/structures/MatrixChat.tsx` (uc-004): room/event ID fragment parsing now preserves v3 event IDs and safely decodes URL-encoded fragments with fallback logging for malformed encodings.
- [x] `src/components/structures/auth/Login.tsx` (uc-005): register button flow now explicitly blocks registration when homeserver policy returns `registrationEnabled === false` and preserves SSO-register routing where supported.
- [x] `src/components/views/rooms/wysiwyg_composer/components/WysiwygAutocomplete.tsx`: community autocomplete selections now insert plain text into the composer instead of no-op behavior.

### `src/autocomplete/UserProvider.tsx`

- [ ] L87: `// TODO: lazyload if we have no ev.sender room member?`

### `src/components/structures/LegacyCallEventGrouper.ts`

- [ ] L95: `// FIXME: Find a better way to determine this from the event?`

### `src/components/structures/LoggedInView.tsx`

- [ ] L219: `// TODO: In a future app release, remove support for legacy key.`

### `src/components/structures/RoomSearchView.tsx`

- [ ] L49: `// XXX: todo: merge overlapping results somehow?`

### `src/components/views/auth/InteractiveAuthEntryComponents.tsx`

- [ ] L566: `1, // TODO: Multiple send attempts?`

### `src/components/views/beacon/RoomCallBanner.tsx`

- [ ] L46: `// TODO matrix rtc`

### `src/components/views/dialogs/ModalWidgetDialog.tsx`

- [ ] L149: `// TODO: Replace these with proper widget params`

### `src/components/views/dialogs/spotlight/SpotlightDialog.tsx`

- [ ] L282: `// TODO we may want to put invites in their own list`

### `src/components/views/elements/AppTile.tsx`

- [ ] L608: `// TODO replace with full screen interactions`

### `src/components/views/elements/RoomAliasField.tsx`

- [ ] L152: `// XXX: FIXME https://github.com/matrix-org/matrix-doc/issues/668`

### `src/components/views/messages/MFileBody.tsx`

- [ ] L275: `TODO: Move iframe (and dummy link) into FileDownloader.`

### `src/components/views/messages/MImageBody.tsx`

- [ ] L215: `// FIXME: we let images grow as wide as you like, rather than capped to 800x600.`

### `src/components/views/messages/MessageEvent.tsx`

- [ ] L273: `// TODO: move to eventTypes when location sharing spec stabilises`

### `src/components/views/right_panel/VerificationPanel.tsx`

- [ ] L186: `// TODO: add way to open camera to scan a QR code`

### `src/components/views/room_settings/AliasSettings.tsx`

- [ ] L217: `// TODO: Add error handling based upon server validation`
- [ ] L261: `// TODO: In future, we should probably be making sure that the alias actually belongs`

### `src/components/views/room_settings/RoomProfileSettings.tsx`

- [ ] L53: `// TODO: Merge with ProfileSettings?`
- [ ] L141: `// TODO: What do we do about errors?`

### `src/components/views/rooms/BasicMessageComposer.tsx`

- [ ] L751: `// TODO: does this allow us to get rid of EditorStateTransfer?`

### `src/components/views/rooms/LegacyRoomList.tsx`

- [ ] L433: `// TODO: Replace with archived view: https://github.com/vector-im/element-web/issues/14038`

### `src/components/views/rooms/LinkPreviewWidget.tsx`

- [ ] L70: `// FIXME: do we want to factor out all image displaying between this and MImageBody - especially for lightboxing?`

### `src/components/views/rooms/RoomSublist.tsx`

- [ ] L86: `// TODO: Use re-resizer's NumberSize when it is exposed as the type`

### `src/components/views/rooms/RoomTile.tsx`

- [ ] L298: `// TODO: [FTUE Notifications] Probably need to detect global mute state`

### `src/components/views/rooms/Stickerpicker.tsx`

- [ ] L78: `// TODO: Pick the right manager for the widget`
- [ ] L242: `// TODO - Add support for Stickerpickers from multiple app stores.`
- [ ] L257: `// FIXME: could this use the same code as other apps?`

### `src/components/views/rooms/wysiwyg_composer/components/WysiwygAutocomplete.tsx`

- [ ] L77: `// TODO determine if utils in SlashCommands.tsx are required.`
- [ ] L117: `// TODO - determine if we show all of the /command suggestions, there are some options in the`

### `src/components/views/rooms/wysiwyg_composer/hooks/useInitialContent.ts`

- [ ] L45: `// TODO local storage`
- [ ] L58: `// Todo local storage`

### `src/components/views/rooms/wysiwyg_composer/hooks/usePlainTextListeners.ts`

- [ ] L154: `// TODO use getKeyBindingsManager().getMessageComposerAction(event) like in useInputEventProcessor`

### `src/components/views/rooms/wysiwyg_composer/hooks/useWysiwygSendActionHandler.ts`

- [ ] L58: `// TODO insert mention - see SendMessageComposer`
- [ ] L60: `// TODO insert quote message - see SendMessageComposer`

### `src/components/views/rooms/wysiwyg_composer/utils/createMessageContent.ts`

- [ ] L71: `// TODO markdown support`
- [ ] L95: `// TODO Do we need to attach mentions here?`
- [ ] L96: `// TODO Handle editing?`

### `src/components/views/rooms/wysiwyg_composer/utils/editing.ts`

- [ ] L17: `// todo local storage`

### `src/components/views/settings/AddRemoveThreepids.tsx`

- [ ] L375: `// TODO: Inline field validation`

### `src/components/views/settings/ChangePassword.tsx`

- [ ] L241: `// TODO: We can remove this check (but should add some Playwright tests to`

### `src/components/views/settings/Notifications.tsx`

- [ ] L56: `// TODO: this "view" component still has far too much application logic in it,`

### `src/components/views/settings/tabs/room/BridgeSettingsTab.tsx`

- [ ] L61: `// TODO: We don't have this link yet: this will prevent the translators`
- [ ] L83: `// TODO: We don't have this link yet: this will prevent the translators`

### `src/components/views/settings/tabs/user/AccountUserSettingsTab.tsx`

- [ ] L151: `// TODO: Figure out a design that doesn't involve replacing the current dialog`
- [ ] L160: `// TODO: Figure out a design that doesn't involve replacing the current dialog`

### `src/device-listener/DeviceListenerOtherDevices.ts`

- [ ] L86: `// TODO: maybe we don't need a full DeviceListener check? (Maybe we only`
- [ ] L121: `// TODO: maybe we don't need a full DeviceListener check? (Maybe we only`

### `src/dispatcher/actions.ts`

- [ ] L13: `// TODO: Populate with actual actions`

### `src/indexing/EventIndex.ts`

- [ ] L500: `// TODO we need to ensure to use member lazy loading with this`
- [ ] L580: `// TODO if there are no events at this point we're missing a lot`

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

### `src/settings/enums/Layout.ts`

- [ ] L10: `/* TODO: This should be later reworked into something more generic */`

### `src/stores/ActiveWidgetStore.ts`

- [ ] L56: `// TODO: Enable support for m.widget event type (https://github.com/vector-im/element-web/issues/13111)`

### `src/stores/OwnBeaconStore.ts`

- [ ] L305: `// TODO check powerlevels here`

### `src/stores/ThreepidInviteStore.ts`

- [ ] L22: `// TODO: Figure out if these are ever populated`

### `src/stores/WidgetStore.ts`

- [ ] L35: `// TODO consolidate WidgetEchoStore into this`
- [ ] L36: `// TODO consolidate ActiveWidgetStore into this`
- [ ] L166: `if (ev.getType() !== "im.vector.modular.widgets") return; // TODO: Support m.widget too`

### `src/stores/notifications/NotificationLevel.ts`

- [ ] L15: `// TODO: Remove bold with notifications: https://github.com/vector-im/element-web/issues/14227`

### `src/stores/notifications/RoomNotificationStateStore.ts`

- [ ] L71: `// TODO: Update if/when invites move out of the room list.`

### `src/stores/room-list/algorithms/list-ordering/ImportanceAlgorithm.ts`

- [ ] L307: `// TODO: Regenerate index when this happens: https://github.com/vector-im/element-web/issues/14234`

### `src/stores/room-list/algorithms/list-ordering/NaturalAlgorithm.ts`

- [ ] L84: `// TODO: Optimize this to avoid useless operations: https://github.com/vector-im/element-web/issues/14457`

### `src/stores/room-list/algorithms/tag-sorting/RecentAlgorithm.ts`

- [ ] L39: `// TODO: We could probably improve the sorting algorithm here by finding changes.`
- [ ] L45: `// TODO: Don't assume we're using the same client as the peg`

### `src/stores/spaces/SpaceStore.ts`

- [ ] L582: `// TODO consider sorting by number of in-refs to favour nodes with fewer parents.`
- [ ] L1054: `// TODO rebuild the space parent and not the room - check permissions?`
- [ ] L1055: `// TODO confirm this after implementing parenting behaviour`

### `src/stores/widgets/WidgetPermissionStore.ts`

- [ ] L24: `// TODO (all functions here): Merge widgetKind with the widget definition`

### `src/stores/widgets/types.ts`

- [ ] L30: `// TODO: [Deferred] Maximizing (fullscreen) widgets by default.`
- [ ] L38: `// TODO: [Deferred] Forced layout (fixed with no changes)`

### `src/utils/DMRoomMap.ts`

- [ ] L26: `// TODO: convert these to maps`
- [ ] L156: `// TODO: [Canonical DMs] Handle lookups for email addresses.`

### `src/utils/FileDownloader.ts`

- [ ] L54: `// TODO: If we decide to keep the download link behaviour, we should bring the style management into here.`

### `src/utils/MediaEventHelper.ts`

- [ ] L19: `// TODO: We should consider caching the blobs. https://github.com/vector-im/element-web/issues/17192`

### `src/utils/dm/startDm.ts`

- [ ] L54: `// TODO: [Canonical DMs] Remove this check and instead just create the multi-person DM`

### `src/utils/exportUtils/HtmlExport.tsx`

- [ ] L399: `// TODO: Handle callEvent errors`

### `src/utils/permalinks/MatrixSchemePermalinkConstructor.ts`

- [ ] L53: `// TODO: Change API signature to accept the URL for checking`

### `src/vector/platform/IPCManager.ts`

- [ ] L33: `// TODO this should be moved into the preload.js file.`

### `src/widgets/CapabilityText.tsx`

- [ ] L128: `// TODO: Support MSC3819 (to-device capabilities)`

### `src/widgets/WidgetType.ts`

- [ ] L9: `// TODO: Move to matrix-widget-api`

### `test/jest-mocks.ts`

- [ ] L9: `// https://jestjs.io/docs/en/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom`

### `test/setup/setupManualMocks.ts`

- [ ] L47: `// TODO: Extract this to a function and have tests that need it opt into it.`

### `test/test-utils/test-utils.ts`

- [ ] L56: `* TODO: once the components are updated to get their MatrixClients from`
