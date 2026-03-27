# Evidence — uc-006 MessagePanel per-room hidden-event controls

## Work order
WO-8 (high-priority unfinished marker closure) — `blackout#uc-006`.

## Owner
Rooms UX

## Date completed
2026-03-14

## Files changed
- `_port/src/components/structures/MessagePanel.tsx`
- `_port/test/unit-tests/components/structures/MessagePanel-test.tsx`
- `docs/unfinished-code-checklist.md`
- `docs/unfinished-code-priority-plan.md`
- `docs/operations/evidence/2026-03-14-uc-006-messagepanel-room-hide-controls.md`

## Tests/commands run
- `pnpm --dir _port test test/unit-tests/components/structures/MessagePanel-test.tsx --runInBand`
- `rg -n "uc-006|MessagePanel.tsx|Open items: \*\*113\*\*|Resolved items tracked in this checklist: \*\*3\*\*|Total files with tracked markers: \*\*86\*\*" docs/unfinished-code-checklist.md docs/unfinished-code-priority-plan.md`
- `git diff -- _port/src/components/structures/MessagePanel.tsx _port/test/unit-tests/components/structures/MessagePanel-test.tsx docs/unfinished-code-checklist.md docs/unfinished-code-priority-plan.md docs/operations/evidence/2026-03-14-uc-006-messagepanel-room-hide-controls.md`

## Evidence links
- Room-scoped preference implementation: `_port/src/components/structures/MessagePanel.tsx`
- Isolation + persistence regression test: `_port/test/unit-tests/components/structures/MessagePanel-test.tsx`
- Tracker synchronization: `docs/unfinished-code-checklist.md`, `docs/unfinished-code-priority-plan.md`

## Risks/known follow-ups
- UI surface for toggling room-scoped hidden-event preference is still intentionally thin; existing behavior remains safe by default with global fallback and optional room override API.
- Continue P1 backlog closure (`uc-008`, `uc-010`) in strict priority order.

## Next review date
2026-03-21
