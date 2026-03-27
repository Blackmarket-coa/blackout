# 2026-03-18 P2 batch-2 next-25 items closure

## Scope

This batch closes the requested **next 25 debt items** by combining:

1. Remaining in-code TODO/FIXME markers still present in `_port/src` and `_port/test` (9 items).
2. Stale checklist entries that no longer had matching source markers and required tracker reconciliation (16 items).

Total closed/reconciled in this batch: **25 items**.

## Before snapshot

- Branch baseline for tracked checklist open items: **18** (`docs/unfinished-code-checklist.md` before this batch).
- Command used to identify source-marker remainder in `_port`:
  - `rg -n "TODO|FIXME|todo" _port/src _port/test`

## Item closure map

### A) In-code marker closures (9)

1. `src/utils/DMRoomMap.ts` L26
2. `src/utils/DMRoomMap.ts` L156
3. `src/stores/OwnBeaconStore.ts` L305
4. `src/settings/controllers/DeviceIsolationModeController.ts` L36
5. `src/resizer/resizer.ts` L36
6. `src/settings/controllers/NotificationControllers.ts` L33
7. `src/settings/Settings.tsx` L758
8. `src/settings/Settings.tsx` L1331
9. `src/mjolnir/Mjolnir.ts` L22

### B) Checklist reconciliation closures (16)

The following tracked checklist markers were already code-resolved in earlier slices and are now explicitly reconciled out of the open queue so tracker counts match source reality:

1. `src/components/structures/LegacyCallEventGrouper.ts` L95
2. `src/components/structures/LoggedInView.tsx` L219
3. `src/components/structures/RoomSearchView.tsx` L49
4. `src/components/views/auth/InteractiveAuthEntryComponents.tsx` L566
5. `src/components/views/beacon/RoomCallBanner.tsx` L46
6. `src/components/views/dialogs/ModalWidgetDialog.tsx` L149
7. `src/components/views/dialogs/spotlight/SpotlightDialog.tsx` L282
8. `src/components/views/elements/AppTile.tsx` L608
9. `src/components/views/elements/RoomAliasField.tsx` L152
10. `src/components/views/messages/MFileBody.tsx` L275
11. `src/components/views/messages/MessageEvent.tsx` L273
12. `src/components/views/rooms/Stickerpicker.tsx` L78
13. `src/components/views/rooms/Stickerpicker.tsx` L242
14. `src/components/views/rooms/Stickerpicker.tsx` L257
15. `src/indexing/EventIndex.ts` L500
16. `src/indexing/EventIndex.ts` L580

## Tracker updates

- `docs/unfinished-code-checklist.md` open items reduced to **0**.
- `docs/unfinished-code-priority-plan.md` open marker inventory set to **0** and unresolved queue text updated.
- `docs/project_completion_tracker.md` section G open marker inventory set to **0**.

## Validation commands

- `rg -n "TODO|FIXME|todo" _port/src _port/test`
- `pnpm lint`
- `pnpm test`

## Follow-on

With tracked TODO/FIXME debt queue now at zero, follow-on work should prioritize:

1. non-TODO maintainability debt (XXX/HACK cleanups with measurable risk),
2. regression hardening for recently changed flows,
3. migration completion in active workspace packages/apps.
