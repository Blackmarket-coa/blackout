# Evidence — Batch closure of 15 unresolved markers

## Work order
WO-8 (priority unfinished-marker batch closure) — next 15 unresolved markers closed in ordered sweep.

## Owner
Core App Teams (Web Platform + Accessibility + Docs Shell)

## Date completed
2026-03-14

## Files changed
- `_port/test/unit-tests/components/structures/MatrixChat-test.tsx`
- `_port/test/unit-tests/components/views/beacon/RoomCallBanner-test.tsx`
- `_port/test/unit-tests/components/views/messages/MessageActionBar-test.tsx`
- `_port/test/unit-tests/components/views/rooms/EditMessageComposer-test.tsx`
- `_port/test/unit-tests/components/views/rooms/wysiwyg_composer/hooks/useSuggestion-test.tsx`
- `_port/test/unit-tests/components/views/spaces/SpaceSettingsVisibilityTab-test.tsx`
- `_port/test/unit-tests/models/Call-test.ts`
- `_port/test/unit-tests/slash-commands/utils.ts`
- `_port/test/unit-tests/stores/SpaceStore-test.ts`
- `_port/test/unit-tests/utils/MegolmExportEncryption-test.ts`
- `_port/src/vector/index.html`
- `_port/src/vector/jitsi/index.html`
- `_port/src/vector/jitsi/index.pcss`
- `docs/unfinished-code-checklist.md`
- `docs/unfinished-code-priority-plan.md`
- `docs/project_completion_tracker.md`
- `docs/blackout_centralized_release_readiness_gate.md`
- `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md`
- `docs/operations/evidence/2026-03-14-batch-15-marker-closure.md`
- `docs/ai-prompts-remaining-work.md`

## Tests/commands run
- `pnpm --dir _port exec jest test/unit-tests/components/views/beacon/RoomCallBanner-test.tsx --runInBand`
- `rg -n "TODO|FIXME" _port/test/unit-tests/components/structures/MatrixChat-test.tsx _port/test/unit-tests/components/views/beacon/RoomCallBanner-test.tsx _port/test/unit-tests/components/views/messages/MessageActionBar-test.tsx _port/test/unit-tests/components/views/rooms/EditMessageComposer-test.tsx _port/test/unit-tests/components/views/rooms/wysiwyg_composer/hooks/useSuggestion-test.tsx _port/test/unit-tests/components/views/spaces/SpaceSettingsVisibilityTab-test.tsx _port/test/unit-tests/models/Call-test.ts _port/test/unit-tests/slash-commands/utils.ts _port/test/unit-tests/stores/SpaceStore-test.ts _port/test/unit-tests/utils/MegolmExportEncryption-test.ts _port/src/vector/index.html _port/src/vector/jitsi/index.html _port/src/vector/jitsi/index.pcss`
- `rg -n "Open items: \*\*98\*\*|Resolved items tracked in this checklist: \*\*20\*\*|Total files with tracked markers: \*\*73\*\*|uc-010|batch-15-marker-closure" docs/unfinished-code-checklist.md docs/unfinished-code-priority-plan.md docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md docs/operations/evidence/2026-03-14-batch-15-marker-closure.md`
- `git diff -- _port/test/unit-tests/components/structures/MatrixChat-test.tsx _port/test/unit-tests/components/views/beacon/RoomCallBanner-test.tsx _port/test/unit-tests/components/views/messages/MessageActionBar-test.tsx _port/test/unit-tests/components/views/rooms/EditMessageComposer-test.tsx _port/test/unit-tests/components/views/rooms/wysiwyg_composer/hooks/useSuggestion-test.tsx _port/test/unit-tests/components/views/spaces/SpaceSettingsVisibilityTab-test.tsx _port/test/unit-tests/models/Call-test.ts _port/test/unit-tests/slash-commands/utils.ts _port/test/unit-tests/stores/SpaceStore-test.ts _port/test/unit-tests/utils/MegolmExportEncryption-test.ts _port/src/vector/index.html _port/src/vector/jitsi/index.html _port/src/vector/jitsi/index.pcss docs/unfinished-code-checklist.md docs/unfinished-code-priority-plan.md docs/project_completion_tracker.md docs/blackout_centralized_release_readiness_gate.md docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md docs/operations/evidence/2026-03-14-batch-15-marker-closure.md docs/ai-prompts-remaining-work.md`

## Evidence links
- Batch marker closures and removed unresolved entries: `docs/unfinished-code-checklist.md`
- Priority/cadence refresh after batch closure: `docs/unfinished-code-priority-plan.md`
- Centralized gate/count synchronization: `docs/project_completion_tracker.md`, `docs/blackout_centralized_release_readiness_gate.md`, `docs/operations/evidence/2026-03-14-blackout-centralized-work-orders-1-9.md`

## Risks/known follow-ups
- Remaining backlog now resides in long-tail P2 queue and still requires continued batch closure with regression checks.
- Full jest execution remains environment-dependent in this workspace snapshot and must be revalidated in canonical CI.

## Next review date
2026-03-21
