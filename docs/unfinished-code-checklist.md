# Unfinished Code Checklist

Auto-generated from TODO/FIXME/TBD/not-implemented markers across `src/`, `scripts/`, `docs/`, and `test/.`

- Excludes generated/vendor-heavy paths (`src/i18n/**`, `docs/lib/**`, `*.snap`), changelog, and this checklist file itself.
- Open items: **0**
- Resolved items tracked in this checklist: **78**
- Total files with tracked markers: **0**

## Checklist

## Recently resolved high-priority markers

- [x] Utility test-stub closure (2026-04-05): implemented 38 unit tests across `event.test.ts` (14 tests), `room.test.ts` (9 tests), `media.test.ts` (8 tests), and `markdown.test.ts` (7 tests) to close all 27 `it.todo()` stubs in `apps/blackout-client/tests/unit/utils/`. Also reconciled 5 partial-status tracking items (uc-001/002/003/007/009) to Complete in `docs/unfinished-code-priority-plan.md`.
- [x] Batch-4 next-25 execution (2026-03-18): closed the targeted MatrixChat/Notifier/Notifications/MessageContextMenu/TimelinePanel/BaseDialog/DeactivateAccountDialog marker set with helper refactors, guardrails, and test updates (evidence: `docs/operations/evidence/2026-03-18-p2-batch-4-next-25-execution.md`).
- [x] Batch-3 next-25 maintainability sweep (2026-03-18): closed 25 selected XXX/hack debt markers across runtime, accessibility, settings, and bootstrap slices without behavior changes (evidence: `docs/operations/evidence/2026-03-18-p2-batch-3-next-25-xxx-closure.md`).
- [x] Batch-2 next-25 closure (2026-03-18): closed remaining TODO/FIXME backlog items and reconciled stale checklist markers so tracked open item count is now zero (evidence: `docs/operations/evidence/2026-03-18-p2-batch-2-next-25-items-closure.md`).
- [x] Batch-1 P2 queue closure (2026-03-18): closed RoomProfileSettings, BasicMessageComposer, LegacyRoomList, RoomSublist, RoomTile, ChangePassword, BridgeSettingsTab, AccountUserSettingsTab, DeviceListenerOtherDevices, and IntegrationManagers with targeted test coverage and evidence sync (evidence: `docs/operations/evidence/2026-03-18-p2-batch-1-debt-burndown.md`).
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

## Open marker queue

- No open TODO/FIXME/TBD/not-implemented markers are currently tracked in scope.
