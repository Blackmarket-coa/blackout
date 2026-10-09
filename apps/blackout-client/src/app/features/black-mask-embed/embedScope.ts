/**
 * What the Black Mask chat panel shows, decided in one place.
 *
 * The panel shows canopies (Matrix spaces), their text dens, loose text dens
 * and direct messages — nothing else. Town Square, Coliseum, Market and feeds
 * are app surfaces, not rooms, so they are excluded by the panel having no
 * route for them; this module is the room-level half of the rule.
 *
 * Kept pure (plain facts in, decision out) so it is testable without a Matrix
 * client. `roomToEmbedFacts` is the only Matrix-aware adapter.
 */
import type { Room } from 'matrix-js-sdk';
import { readDenKind, type DenKind } from '../canopy/denKind';

export type EmbedRoomKind = 'canopy' | 'den' | 'dm';

export interface EmbedRoomFacts {
    roomId: string;
    name: string;
    /** The signed-in user's membership; only `join` is shown. */
    membership: string;
    /** `m.room.create` content `type`: undefined for a plain room, `m.space` for a canopy. */
    createType: string | undefined;
    denKind: DenKind;
    /** Listed in the user's `m.direct` account data. */
    isDirect: boolean;
    /** Parent canopy ids (from `m.space.parent` / `m.space.child`). */
    parentIds: readonly string[];
}

/**
 * Text chat only. Voice and stage dens need LiveKit (failing at the last audit;
 * the panel starts text-only), and forum dens render a different surface.
 * Announcement dens are text channels where only moderators post.
 */
const PANEL_DEN_KINDS: ReadonlySet<DenKind> = new Set<DenKind>(['text', 'announcement']);

/**
 * Returns the panel kind for a room, or null when the panel does not show it
 * (not joined, a custom room type, a voice/stage/forum den).
 */
export const classifyEmbedRoom = (facts: EmbedRoomFacts): EmbedRoomKind | null => {
    if (facts.membership !== 'join') return null;
    if (facts.createType === 'm.space') return 'canopy';
    // Any other custom room type is some other surface's room, not a den.
    if (facts.createType !== undefined) return null;
    if (facts.isDirect) return 'dm';
    return PANEL_DEN_KINDS.has(facts.denKind) ? 'den' : null;
};

const byName = (a: EmbedRoomFacts, b: EmbedRoomFacts): number =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export interface EmbedHomeLists {
    /** Joined canopies that have no joined parent canopy. */
    canopies: EmbedRoomFacts[];
    /** Text dens that sit in no joined canopy. */
    looseDens: EmbedRoomFacts[];
    dms: EmbedRoomFacts[];
}

export const buildEmbedHomeLists = (rooms: readonly EmbedRoomFacts[]): EmbedHomeLists => {
    const joinedCanopyIds = new Set(
        rooms.filter((r) => classifyEmbedRoom(r) === 'canopy').map((r) => r.roomId)
    );
    const hasJoinedParent = (r: EmbedRoomFacts) =>
        r.parentIds.some((id) => joinedCanopyIds.has(id));

    const canopies: EmbedRoomFacts[] = [];
    const looseDens: EmbedRoomFacts[] = [];
    const dms: EmbedRoomFacts[] = [];
    for (const room of rooms) {
        const kind = classifyEmbedRoom(room);
        if (kind === 'canopy' && !hasJoinedParent(room)) canopies.push(room);
        else if (kind === 'den' && !hasJoinedParent(room)) looseDens.push(room);
        else if (kind === 'dm') dms.push(room);
    }
    return {
        canopies: canopies.sort(byName),
        looseDens: looseDens.sort(byName),
        dms: dms.sort(byName),
    };
};

export interface EmbedCanopyLists {
    dens: EmbedRoomFacts[];
    subCanopies: EmbedRoomFacts[];
    /**
     * Joined children the panel does not show (voice, stage, forum, custom
     * types). Listed so their unread activity is visible, and opened in a
     * normal Blackout tab.
     */
    elsewhere: EmbedRoomFacts[];
}

export const buildEmbedCanopyLists = (
    rooms: readonly EmbedRoomFacts[],
    canopyId: string
): EmbedCanopyLists => {
    const dens: EmbedRoomFacts[] = [];
    const subCanopies: EmbedRoomFacts[] = [];
    const elsewhere: EmbedRoomFacts[] = [];
    for (const room of rooms) {
        if (room.roomId === canopyId || !room.parentIds.includes(canopyId)) continue;
        if (room.membership !== 'join') continue;
        const kind = classifyEmbedRoom(room);
        if (kind === 'den') dens.push(room);
        else if (kind === 'canopy') subCanopies.push(room);
        // A DM that also sits in a canopy is listed under DMs, not here.
        else if (kind === null) elsewhere.push(room);
    }
    return {
        dens: dens.sort(byName),
        subCanopies: subCanopies.sort(byName),
        elsewhere: elsewhere.sort(byName),
    };
};

/** Read the facts the panel needs off a live Matrix room. */
export const roomToEmbedFacts = (
    room: Room,
    directRoomIds: ReadonlySet<string>,
    parentIds: ReadonlySet<string> | undefined
): EmbedRoomFacts => {
    const createContent = room.currentState
        ?.getStateEvents('m.room.create', '')
        ?.getContent<{ type?: unknown }>();
    const createType = typeof createContent?.type === 'string' ? createContent.type : undefined;
    return {
        roomId: room.roomId,
        name: room.name || room.roomId,
        membership: room.getMyMembership(),
        createType,
        denKind: readDenKind(room),
        isDirect: directRoomIds.has(room.roomId),
        parentIds: parentIds ? Array.from(parentIds) : [],
    };
};
