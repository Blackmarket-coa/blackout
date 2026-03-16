# Evidence — P2 debt burn-down batch (3 markers)

Date: 2026-03-15
Branch: `work`
Commit under test: `b0430664fdb232dd98f1066b7b415d0a06ffd58b`
Verifier: Codex (GPT-5.2-Codex)

## Closed markers

1. `src/components/structures/RoomSearchView.tsx` L49
   - Implemented multi-event overlap merging for successive search result timelines (not just single-event overlap).
   - Added regression test coverage for multi-event overlap merge behavior.

2. `src/components/views/settings/AddRemoveThreepids.tsx` L375
   - Replaced modal-only invalid email handling with inline field validation state.
   - Added regression test verifying inline feedback and no add-request side effect on invalid email input.

3. `src/components/views/rooms/wysiwyg_composer/utils/editing.ts` L17
   - Implemented edit-draft localStorage cleanup for the active timeline rendering context during `endEditing`.
   - Added unit test ensuring context-scoped cleanup while preserving other timeline context draft keys.

## Validation

- `pnpm lint` (pass)
- `pnpm test --filter @blackout/web` (pass)
- `pnpm test --filter @blackout/ui` (pass)
- `pnpm exec jest --config _port/jest.config.ts _port/test/unit-tests/components/structures/RoomSearchView-test.tsx _port/test/unit-tests/components/views/settings/AddRemoveThreepids-test.tsx _port/test/unit-tests/components/views/rooms/wysiwyg_composer/utils/editing-test.ts --runInBand` (fails: `Command "jest" not found` in current pnpm workspace)
- `node _port/scripts/operations/docs_integrity_check.cjs` (pass)
