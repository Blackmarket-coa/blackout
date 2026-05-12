import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE,
    canViewCharacterSheet,
    isCharacterSheetSharedGrantPayload,
} from '@blackout/protocol';
import { userIdAtom } from '../../state/auth';
import { joinedRoomsAtom } from '../../state/rooms';

/**
 * Discover which member ids have an active sheet grant in a single room.
 * Reads the `co.bmc.user.sheet.shared` state events keyed by user id;
 * an empty payload (revocation) is filtered out.
 */
function readGrants(room: Room): Set<string> {
    const eventsRaw = room.currentState?.getStateEvents(
        CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE,
    );
    const events = Array.isArray(eventsRaw) ? eventsRaw : eventsRaw ? [eventsRaw] : [];
    const grants = new Set<string>();
    for (const event of events) {
        const stateKey = event.getStateKey?.();
        if (!stateKey) continue;
        const content = event.getContent<Record<string, unknown>>();
        if (!isCharacterSheetSharedGrantPayload(content)) continue;
        grants.add(stateKey);
    }
    return grants;
}

/**
 * Predicate hook: can the current user view `holderUserId`'s character
 * sheet?
 *
 * Walks each room both users belong to and checks for an active grant.
 * Returns true the moment one is found; falls back to the
 * `canViewCharacterSheet` helper for the self-view + zero-grants paths.
 *
 * The brief frames sharing as per-circle: a viewer sees the sheet only
 * when the holder has opted into a den they're both members of. No
 * federation-wide "follow" surface.
 */
export function useCanViewSheet(holderUserId: string | null | undefined): boolean {
    const viewerId = useAtomValue(userIdAtom);
    const rooms = useAtomValue(joinedRoomsAtom);

    return useMemo(() => {
        if (!holderUserId) return false;
        if (!viewerId) return false;
        if (viewerId === holderUserId) return true;

        // For each room the viewer belongs to that also has the holder
        // as a member, check whether the holder has emitted a grant.
        for (const room of rooms) {
            if (!room.getMember?.(holderUserId)) continue;
            const grants = readGrants(room);
            if (grants.has(holderUserId)) return true;
        }
        return false;
    }, [holderUserId, rooms, viewerId]);
}

/** Tiny re-export so call sites can pull the predicate from one place. */
export { canViewCharacterSheet };
