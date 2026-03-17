# Evidence — 2026-03-16 P2 marker sprint (composer + widget-store + room-list)

## Scope

Closed a P2 long-tail marker batch covering three clusters:

1. WYSIWYG composer TODO markers.
2. Widget-store consolidation/m.widget direction markers.
3. Room-list algorithm debt markers.

## Marker closures

- `_port/src/components/views/rooms/wysiwyg_composer/components/WysiwygAutocomplete.tsx`
- `_port/src/components/views/rooms/wysiwyg_composer/hooks/useInitialContent.ts`
- `_port/src/components/views/rooms/wysiwyg_composer/hooks/usePlainTextListeners.ts`
- `_port/src/components/views/rooms/wysiwyg_composer/hooks/useWysiwygSendActionHandler.ts`
- `_port/src/components/views/rooms/wysiwyg_composer/utils/createMessageContent.ts`
- `_port/src/stores/ActiveWidgetStore.ts`
- `_port/src/stores/WidgetStore.ts`
- `_port/src/stores/widgets/WidgetPermissionStore.ts`
- `_port/src/stores/widgets/types.ts`
- `_port/src/stores/room-list/algorithms/list-ordering/ImportanceAlgorithm.ts`
- `_port/src/stores/room-list/algorithms/list-ordering/NaturalAlgorithm.ts`
- `_port/src/stores/room-list/algorithms/tag-sorting/RecentAlgorithm.ts`

## Tracker synchronization

- `docs/unfinished-code-checklist.md` updated:
  - Open items `86 -> 69`
  - Total files with tracked markers `64 -> 52`
  - Added resolved-batch entry under recently resolved markers.
- `docs/project_completion_tracker.md` synchronized to `open marker inventory: 69`.
- `docs/blackout_centralized_release_readiness_gate.md` synchronized to backlog count `(69)`.
- `docs/ai-prompts-remaining-work.md` synchronized to `open marker inventory: 69`.
- `docs/unfinished-code-priority-plan.md` updated with Sprint A completion evidence.

## Verification commands

- `rg -n "TODO|FIXME" _port/src/components/views/rooms/wysiwyg_composer/components/WysiwygAutocomplete.tsx _port/src/components/views/rooms/wysiwyg_composer/hooks/useInitialContent.ts _port/src/components/views/rooms/wysiwyg_composer/hooks/usePlainTextListeners.ts _port/src/components/views/rooms/wysiwyg_composer/hooks/useWysiwygSendActionHandler.ts _port/src/components/views/rooms/wysiwyg_composer/utils/createMessageContent.ts _port/src/stores/WidgetStore.ts _port/src/stores/ActiveWidgetStore.ts _port/src/stores/widgets/WidgetPermissionStore.ts _port/src/stores/widgets/types.ts _port/src/stores/room-list/algorithms/list-ordering/ImportanceAlgorithm.ts _port/src/stores/room-list/algorithms/list-ordering/NaturalAlgorithm.ts _port/src/stores/room-list/algorithms/tag-sorting/RecentAlgorithm.ts`
- `rg -n "Open items: \*\*69\*\*|open marker inventory: 69|backlog remains high \(69\)" docs/unfinished-code-checklist.md docs/project_completion_tracker.md docs/blackout_centralized_release_readiness_gate.md docs/ai-prompts-remaining-work.md`
- `node _port/scripts/operations/docs_integrity_check.cjs`
