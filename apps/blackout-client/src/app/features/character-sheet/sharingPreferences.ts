import { useCallback, useMemo } from 'react';
import {
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
            if (next.has(roomId)) next.delete(roomId);
            else next.add(roomId);
            const writeable = {
                sharedInRooms: [...next].sort(),
                updatedAt: new Date().toISOString(),
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
    return useCallback(async (): Promise<void> => {
        const writeable: CharacterSheetSharingPayload = {
            sharedInRooms: [],
            updatedAt: new Date().toISOString(),
        };
        await (mx as { setAccountData: (t: string, c: unknown) => Promise<unknown> })
            .setAccountData(CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE, writeable);
    }, [mx]);
}
