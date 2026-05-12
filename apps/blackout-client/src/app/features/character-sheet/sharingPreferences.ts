import { useCallback, useMemo } from 'react';
import {
    CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE,
    CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE,
    PRIVATE_SHEET_SHARING,
    isCharacterSheetSharingPayload,
    type CharacterSheetSharingPayload,
} from '@blackout/protocol';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useAccountData } from '../../hooks/useAccountData';

/**
 * Read the local user's character-sheet sharing preferences from account
 * data. Returns `PRIVATE_SHEET_SHARING` when the user has never shared
 * (no event, malformed event, or empty list) — the sheet is private by
 * default per the brief.
 */
export interface CharacterSheetSharingResult {
    payload: CharacterSheetSharingPayload;
    sharedRoomSet: ReadonlySet<string>;
    isSharedWith: (roomId: string) => boolean;
}

export function useCharacterSheetSharing(): CharacterSheetSharingResult {
    const event = useAccountData(CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE);

    const payload: CharacterSheetSharingPayload = useMemo(() => {
        const content = event?.getContent?.<Record<string, unknown>>();
        if (content && isCharacterSheetSharingPayload(content)) return content;
        return PRIVATE_SHEET_SHARING;
    }, [event]);

    const sharedRoomSet = useMemo(
        () => new Set(payload.sharedInRooms),
        [payload.sharedInRooms],
    );

    const isSharedWith = useCallback(
        (roomId: string) => sharedRoomSet.has(roomId),
        [sharedRoomSet],
    );

    return { payload, sharedRoomSet, isSharedWith };
}

/**
 * Returns a stable callback that toggles per-room sharing. Idempotent — the
 * caller doesn't need to know whether the room is currently shared; the
 * hook flips the bit and writes the updated payload back to account data.
 *
 * matrix-js-sdk's setAccountData accepts arbitrary type strings; the cast
 * keeps the call signature compatible without forking the union of known
 * account-data types.
 */
export function useToggleSheetSharing() {
    const mx = useMatrixClient();
    const { payload, sharedRoomSet } = useCharacterSheetSharing();

    return useCallback(
        async (roomId: string): Promise<void> => {
            const next = new Set(sharedRoomSet);
            const isTurningOn = !next.has(roomId);
            if (isTurningOn) next.add(roomId);
            else next.delete(roomId);
            const occurredAt = new Date().toISOString();

            // 1) Mirror the preference into the holder's account data so
            //    it follows the user across devices. This is the holder's
            //    private source of truth.
            const writeable = {
                sharedInRooms: [...next].sort(),
                updatedAt: occurredAt,
                // Carry forward any unknown fields a future schema version
                // adds, so we never silently drop them on a write.
                ...Object.fromEntries(
                    Object.entries(payload).filter(
                        ([key]) => key !== 'sharedInRooms' && key !== 'updatedAt',
                    ),
                ),
            };
            await (mx as { setAccountData: (t: string, c: unknown) => Promise<unknown> })
                .setAccountData(CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE, writeable);

            // 2) Mirror the per-room grant into a room state event so
            //    members of that den can discover the share. Matrix
            //    state events can't be "deleted" — we publish an empty
            //    payload to signal revocation; consumers treat a missing
            //    sharedAt as no-grant.
            const userId = mx.getUserId();
            if (userId) {
                const content = isTurningOn ? { sharedAt: occurredAt } : {};
                await mx.sendStateEvent(
                    roomId,
                    CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE as never,
                    content as never,
                    userId,
                );
            }
        },
        [mx, payload, sharedRoomSet],
    );
}

/**
 * Returns a stable callback that resets all sharing — the sheet flips
 * back to private. Useful for a "stop sharing with everyone" affordance.
 */
export function useResetSheetSharing() {
    const mx = useMatrixClient();
    const { payload } = useCharacterSheetSharing();
    return useCallback(async (): Promise<void> => {
        const occurredAt = new Date().toISOString();
        const writeable: CharacterSheetSharingPayload = {
            sharedInRooms: [],
            updatedAt: occurredAt,
        };
        await (mx as { setAccountData: (t: string, c: unknown) => Promise<unknown> })
            .setAccountData(CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE, writeable);

        // Revoke every per-room grant the holder previously emitted. The
        // best-effort `allSettled` keeps a single failed room from
        // poisoning the rest of the reset.
        const userId = mx.getUserId();
        if (userId) {
            await Promise.allSettled(
                payload.sharedInRooms.map((roomId) =>
                    mx.sendStateEvent(
                        roomId,
                        CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE as never,
                        {} as never,
                        userId,
                    ),
                ),
            );
        }
    }, [mx, payload]);
}
