import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE,
    canViewCharacterSheet,
    grantHasSection,
    isCharacterSheetSharedGrantPayload,
    type CharacterSheetSectionId,
    type CharacterSheetSharedGrantPayload,
} from '@blackout/protocol';
import { userIdAtom } from '../../state/auth';
import { joinedRoomsAtom } from '../../state/rooms';

/**
 * Discover which member ids have an active sheet grant in a single room
 * along with the grant payload itself (so per-section gates can read the
 * `sections` field). Reads `co.bmc.user.sheet.shared` state events keyed
 * by user id; an empty payload (revocation) is filtered out.
 */
function readGrants(room: Room): Map<string, CharacterSheetSharedGrantPayload> {
    const eventsRaw = room.currentState?.getStateEvents(
        CHARACTER_SHEET_SHARED_GRANT_EVENT_TYPE,
    );
    const events = Array.isArray(eventsRaw) ? eventsRaw : eventsRaw ? [eventsRaw] : [];
    const grants = new Map<string, CharacterSheetSharedGrantPayload>();
    for (const event of events) {
        const stateKey = event.getStateKey?.();
        if (!stateKey) continue;
        const content = event.getContent<Record<string, unknown>>();
        if (!isCharacterSheetSharedGrantPayload(content)) continue;
        grants.set(stateKey, content);
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

/**
 * Predicate hook: can the current user view the named section of
 * `holderUserId`'s character sheet? Self-view always true. For others, at
 * least one shared room must carry a grant whose `sections` includes the
 * id. Sections default off — callers should still render the whole-sheet
 * remainder (Roles + Quest log) under the looser `useCanViewSheet` gate.
 */
export function useCanViewSheetSection(
    holderUserId: string | null | undefined,
    section: CharacterSheetSectionId,
): boolean {
    const viewerId = useAtomValue(userIdAtom);
    const rooms = useAtomValue(joinedRoomsAtom);

    return useMemo(() => {
        if (!holderUserId) return false;
        if (!viewerId) return false;
        if (viewerId === holderUserId) return true;

        for (const room of rooms) {
            if (!room.getMember?.(holderUserId)) continue;
            const grants = readGrants(room);
            const grant = grants.get(holderUserId);
            if (grant && grantHasSection(grant, section)) return true;
        }
        return false;
    }, [holderUserId, rooms, section, viewerId]);
}

/** Tiny re-export so call sites can pull the predicate from one place. */
export { canViewCharacterSheet };
