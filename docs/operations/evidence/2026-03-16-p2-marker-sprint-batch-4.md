# Evidence — Sprint B P2 marker burn-down batch (15 marker closures)

## Scope

Closed 15 long-tail TODO/FIXME markers in utility, notification, widget compatibility, and test-scaffolding files.

## Marker closure set

1. `_port/src/utils/FileDownloader.ts`
2. `_port/src/utils/dm/startDm.ts`
3. `_port/src/utils/permalinks/MatrixSchemePermalinkConstructor.ts`
4. `_port/src/widgets/WidgetType.ts`
5. `_port/test/setup/setupManualMocks.ts`
6. `_port/src/widgets/CapabilityText.tsx`
7. `_port/src/vector/platform/IPCManager.ts`
8. `_port/test/test-utils/test-utils.ts`
9. `_port/src/utils/exportUtils/HtmlExport.tsx`
10. `_port/src/utils/MediaEventHelper.ts`
11. `_port/src/stores/ThreepidInviteStore.ts`
12. `_port/src/stores/notifications/NotificationLevel.ts`
13. `_port/src/stores/notifications/RoomNotificationStateStore.ts`
14. `_port/src/settings/enums/Layout.ts`
15. `_port/src/dispatcher/actions.ts`

## Tracker synchronization

- `docs/unfinished-code-checklist.md`: Open items `69 -> 54`, tracked files `52 -> 37`.
- `docs/project_completion_tracker.md`: open marker inventory `54`.
- `docs/blackout_centralized_release_readiness_gate.md`: backlog remains high `(54)`.
- `docs/ai-prompts-remaining-work.md`: open marker inventory `54`.

## Verification commands

- `rg -n "TODO|FIXME" <15-files-above>`
- `rg -n "Open items: \*\*54\*\*|open marker inventory: 54|backlog remains high \(54\)" docs/unfinished-code-checklist.md docs/project_completion_tracker.md docs/blackout_centralized_release_readiness_gate.md docs/ai-prompts-remaining-work.md`
