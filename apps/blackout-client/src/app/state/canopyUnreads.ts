import { atom } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import type { RoomToParents } from '../../types/matrix/room';
import { joinedRoomsAtom } from './rooms';
import { roomToParentsAtom } from './room/roomToParents';
import { roomToUnreadAtom, type RoomUnread } from './bmc-unreads';

export interface CanopyUnread {
    total: number;
    mentions: number;
}

/**
 * Rolls den-level unread counters up into every parent canopy. Spaces are
 * skipped as sources (a canopy's own timeline never counts toward itself),
 * and a canopy only gets an entry when at least one counter is non-zero,
 * so `Map.get(...) === undefined` doubles as "all read".
 *
 * `mentions` mirrors `RoomUnread.mentions` (the highlight count) — the
 * signal the rail renders as a counted badge, while `total` drives the
 * plain unread pip.
 */
export const rollupCanopyUnreads = (
    rooms: readonly Room[],
    roomToParents: RoomToParents,
    roomToUnread: ReadonlyMap<string, RoomUnread>
): Map<string, CanopyUnread> => {
    const totals = new Map<string, CanopyUnread>();
    rooms.forEach((room) => {
        if (room.getType() === 'm.space') return;
        const parents = roomToParents.get(room.roomId);
        if (!parents || parents.size === 0) return;
        const unread = roomToUnread.get(room.roomId);
        if (!unread) return;
        const { total, mentions } = unread;
        if (total <= 0 && mentions <= 0) return;
        parents.forEach((parentId) => {
            const entry = totals.get(parentId) ?? { total: 0, mentions: 0 };
            entry.total += total;
            entry.mentions += mentions;
            totals.set(parentId, entry);
        });
    });
    return totals;
};

/**
 * Per-canopy unread rollup keyed by canopy (space) room ID. Shared by the
 * canopy rail badges and the `/canopies` hub cards so the two never drift.
 */
export const canopyUnreadsAtom = atom((get) =>
    rollupCanopyUnreads(get(joinedRoomsAtom), get(roomToParentsAtom), get(roomToUnreadAtom))
);
