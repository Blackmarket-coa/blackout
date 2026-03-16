# Evidence — Sprint C risk queue #1-#10 closure

## Scope

Implemented and closed the ranked risk queue items #1 through #10 from `docs/unfinished-code-priority-plan.md`.

## Code closures

1. `_port/src/components/views/messages/MImageBody.tsx`
2. `_port/src/components/views/room_settings/AliasSettings.tsx`
3. `_port/src/indexing/EventIndex.ts`
4. `_port/src/stores/spaces/SpaceStore.ts`
5. `_port/src/components/views/right_panel/VerificationPanel.tsx`
6. `_port/src/components/views/rooms/LinkPreviewWidget.tsx`
7. `_port/src/components/views/rooms/Stickerpicker.tsx`
8. `_port/src/components/views/settings/Notifications.tsx`
9. `_port/src/stores/WidgetStore.ts`
10. `_port/src/autocomplete/UserProvider.tsx`

## Tracker synchronization

- `docs/unfinished-code-checklist.md`: Open items `54 -> 39`, tracked files `37 -> 27`.
- `docs/project_completion_tracker.md`: open marker inventory updated to `39`.
- `docs/blackout_centralized_release_readiness_gate.md`: residual risk marker backlog updated to `(39)`.
- `docs/ai-prompts-remaining-work.md`: open marker inventory updated to `39`.
- `docs/unfinished-code-priority-plan.md`: ranked queue entries marked complete.

## Verification commands

- `rg -n "TODO|FIXME" _port/src/components/views/messages/MImageBody.tsx _port/src/components/views/room_settings/AliasSettings.tsx _port/src/indexing/EventIndex.ts _port/src/stores/spaces/SpaceStore.ts _port/src/components/views/right_panel/VerificationPanel.tsx _port/src/components/views/rooms/LinkPreviewWidget.tsx _port/src/components/views/rooms/Stickerpicker.tsx _port/src/components/views/settings/Notifications.tsx _port/src/stores/WidgetStore.ts _port/src/autocomplete/UserProvider.tsx`
- `rg -n "Open items: \*\*39\*\*|open marker inventory: 39|backlog remains high \(39\)" docs/unfinished-code-checklist.md docs/project_completion_tracker.md docs/blackout_centralized_release_readiness_gate.md docs/ai-prompts-remaining-work.md`
- `node _port/scripts/operations/docs_integrity_check.cjs`
