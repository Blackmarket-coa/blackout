# 2026-03-18 P2 batch-1 debt burndown evidence

## Branch and scope

- Branch: `debt/p2-burndown-20260318`.
- Scope lock: regenerated top-10 P2 queue from `docs/unfinished-code-priority-plan.md` (`RoomProfileSettings` through `IntegrationManagers`).

## Before snapshot (working notes baseline)

- Source of truth: `docs/unfinished-code-checklist.md`.
- Baseline open markers before this batch: **28**.
- Baseline tracked files before this batch: **16**.

## Batch-1 definition of done

Each marker is complete only when all of the following are present:

1. Code change implementing or explicitly stabilizing the behavior.
2. Test proof (unit/integration targeted to changed behavior).
3. Checklist status update in `docs/unfinished-code-checklist.md`.
4. Evidence link in docs (this file).

## Batch-1 implementation summary

Closed marker set:

1. `_port/src/components/views/room_settings/RoomProfileSettings.tsx` L53/L141
2. `_port/src/components/views/rooms/BasicMessageComposer.tsx` L751
3. `_port/src/components/views/rooms/LegacyRoomList.tsx` L433
4. `_port/src/components/views/rooms/RoomSublist.tsx` L86
5. `_port/src/components/views/rooms/RoomTile.tsx` L298
6. `_port/src/components/views/settings/ChangePassword.tsx` L241
7. `_port/src/components/views/settings/tabs/room/BridgeSettingsTab.tsx` L61/L83
8. `_port/src/components/views/settings/tabs/user/AccountUserSettingsTab.tsx` L151/L160
9. `_port/src/device-listener/DeviceListenerOtherDevices.ts` L86/L121
10. `_port/src/integrations/IntegrationManagers.ts` L84

## Tests and validation

- Targeted unit tests for changed components/stores were run.
- Baseline gates were re-run (`pnpm lint`, `pnpm test`) after batch merge.

## Risk notes

- `LegacyRoomList` archived behavior remains intentionally behind a legacy fallback until a full ArchivedView rollout is complete.
- `AccountUserSettingsTab` still uses modal-based success/error feedback, but wording now explicitly documents this as a temporary UX constraint.

## Follow-on queue (batch-2)

Prioritize correctness-sensitive remaining markers first:

1. `_port/src/indexing/EventIndex.ts`
2. `_port/src/stores/spaces/SpaceStore.ts`
3. `_port/src/stores/OwnBeaconStore.ts`
4. `_port/src/settings/controllers/DeviceIsolationModeController.ts`
5. `_port/src/settings/controllers/NotificationControllers.ts`

Then continue maintainability/refactor debt:

6. `_port/src/components/views/messages/MessageEvent.tsx`
7. `_port/src/components/views/rooms/Stickerpicker.tsx`
8. `_port/src/settings/Settings.tsx`
9. `_port/src/utils/DMRoomMap.ts`
10. `_port/src/mjolnir/Mjolnir.ts`
11. `_port/src/resizer/resizer.ts`
12. `_port/test/jest-mocks.ts`

## Two-week SLO

- Reduce open tracked markers from **28 -> 15** by closing batch-2 and validating with lint/test + updated checklist snapshot.
