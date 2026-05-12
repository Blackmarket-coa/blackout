import { useCallback, useMemo } from 'react';
import {
    CHARACTER_SHEET_SECTION_IDS,
    CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE,
    CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE,
    PRIVATE_SHEET_SHARING,
    isCharacterSheetSharingPayload,
    type CharacterSheetSectionId,
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
    /**
     * Sections the holder has opted into for `roomId`. Empty set when the
     * room isn't shared at all OR when the den-grant is on but no section
     * is opted in (default state — only the whole-sheet remainder is
     * shared with that den).
     */
    sectionsFor: (roomId: string) => ReadonlySet<CharacterSheetSectionId>;
}

const KNOWN_SECTION_SET = new Set<string>(CHARACTER_SHEET_SECTION_IDS);

const filterSections = (
    raw: ReadonlyArray<string> | undefined,
): ReadonlyArray<CharacterSheetSectionId> => {
    if (!raw) return [];
    return raw.filter(
        (entry): entry is CharacterSheetSectionId => KNOWN_SECTION_SET.has(entry),
    );
};

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

    const sectionsByRoom = payload.sectionsByRoom;
    const sectionsFor = useCallback(
        (roomId: string) => {
            const raw = sectionsByRoom?.[roomId];
            return new Set<CharacterSheetSectionId>(filterSections(raw));
        },
        [sectionsByRoom],
    );

    return { payload, sharedRoomSet, isSharedWith, sectionsFor };
}

/**
 * Build the writeable account-data shape, carrying forward any unknown
 * top-level fields a future schema version added — never silently drop
 * them on a write.
 */
const carryForward = (
    payload: CharacterSheetSharingPayload,
    overrides: Partial<CharacterSheetSharingPayload>,
): Record<string, unknown> => {
    return {
        ...Object.fromEntries(
            Object.entries(payload).filter(
                ([key]) =>
                    key !== 'sharedInRooms' &&
                    key !== 'updatedAt' &&
                    key !== 'sectionsByRoom',
            ),
        ),
        sharedInRooms: overrides.sharedInRooms ?? payload.sharedInRooms,
        updatedAt: overrides.updatedAt ?? payload.updatedAt,
        ...(overrides.sectionsByRoom !== undefined
            ? { sectionsByRoom: overrides.sectionsByRoom }
            : payload.sectionsByRoom !== undefined
              ? { sectionsByRoom: payload.sectionsByRoom }
              : {}),
    };
};

/**
 * Returns a stable callback that toggles per-room sharing. Idempotent — the
 * caller doesn't need to know whether the room is currently shared; the
 * hook flips the bit and writes the updated payload back to account data.
 *
 * matrix-js-sdk's setAccountData accepts arbitrary type strings; the cast
 * keeps the call signature compatible without forking the union of known
 * account-data types.
 *
 * Turning a room off also clears any per-section opt-ins for that room so
 * a re-grant starts from the explicit-opt-in default per the brief.
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

            // Drop the per-section entry on revoke; carry it forward on grant.
            const nextSectionsByRoom: Record<string, ReadonlyArray<string>> = {
                ...(payload.sectionsByRoom ?? {}),
            };
            if (!isTurningOn) delete nextSectionsByRoom[roomId];

            const writeable = carryForward(payload, {
                sharedInRooms: [...next].sort(),
                updatedAt: occurredAt,
                sectionsByRoom: nextSectionsByRoom,
            });
            await (mx as { setAccountData: (t: string, c: unknown) => Promise<unknown> })
                .setAccountData(CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE, writeable);

            // 2) Mirror the per-room grant into a room state event so
            //    members of that den can discover the share. Matrix
            //    state events can't be "deleted" — we publish an empty
            //    payload to signal revocation; consumers treat a missing
            //    sharedAt as no-grant.
            const userId = mx.getUserId();
            if (userId) {
                const content = isTurningOn
                    ? { sharedAt: occurredAt, sections: [] as ReadonlyArray<string> }
                    : {};
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
 * Toggle a single per-section opt-in for `roomId`. No-op when the den-grant
 * itself is off — per the brief, sections live under a per-den grant; you
 * can't share a single section into a den you haven't already opted in.
 */
export function useToggleSheetSection() {
    const mx = useMatrixClient();
    const { payload, sharedRoomSet } = useCharacterSheetSharing();

    return useCallback(
        async (roomId: string, section: CharacterSheetSectionId): Promise<void> => {
            if (!sharedRoomSet.has(roomId)) return;

            const currentRaw = payload.sectionsByRoom?.[roomId] ?? [];
            const current = new Set<string>(currentRaw);
            if (current.has(section)) current.delete(section);
            else current.add(section);

            const nextSectionsByRoom: Record<string, ReadonlyArray<string>> = {
                ...(payload.sectionsByRoom ?? {}),
                [roomId]: [...current].sort(),
            };
            const occurredAt = new Date().toISOString();

            const writeable = carryForward(payload, {
                updatedAt: occurredAt,
                sectionsByRoom: nextSectionsByRoom,
            });
            await (mx as { setAccountData: (t: string, c: unknown) => Promise<unknown> })
                .setAccountData(CHARACTER_SHEET_SHARING_ACCOUNT_DATA_TYPE, writeable);

            const userId = mx.getUserId();
            if (userId) {
                await mx.sendStateEvent(
                    roomId,
                    CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE as never,
                    {
                        sharedAt: occurredAt,
                        sections: [...current].sort(),
                    } as never,
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
        const writeable = carryForward(payload, {
            sharedInRooms: [],
            updatedAt: occurredAt,
            sectionsByRoom: {},
        });
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
