import { atom } from 'jotai';
import { userIdAtom } from './auth';
import { joinedRoomsAtom } from './rooms';
import { awaitsMeForMatrixRoom } from '../features/notifications/awaitsMeForMatrixRoom';
import type { AwaitsMeItem } from '../../lib/bmc-core';

/**
 * Cross-room awaits-me aggregation as a Jotai derived atom.
 *
 * Jotai memoizes derived atom values across every subscriber, so a
 * sidebar rendering 50 rows + a shell-level badge run the
 * awaits-me-for-each-room walk *once* per dependency change rather than
 * once per subscriber. That was the deferred bottleneck — useAwaitsMe was
 * a hook composed of four sub-hooks, which made per-row consumption too
 * expensive.
 *
 * Atom outputs:
 *   • totalCount — global awaits-me count, used by shell-level badges.
 *   • byRoom — Map<roomId, number> for constant-time per-row lookup.
 *   • items — newest-first merged list, for the standalone drawer.
 *
 * Re-computes whenever `joinedRoomsAtom` or `userIdAtom` changes. The
 * Matrix Room objects themselves mutate in place, so timeline / state
 * updates *don't* trigger a recompute on their own — the
 * `joinedRoomsAtom` already swaps references when membership changes,
 * which is the cheap-but-correct invalidation we want here.
 */
export interface AwaitsMeAcrossRoomsValue {
    totalCount: number;
    rooms: Array<{ roomId: string; count: number }>;
    byRoom: Map<string, number>;
    items: ReadonlyArray<AwaitsMeItem>;
}

const EMPTY: AwaitsMeAcrossRoomsValue = {
    totalCount: 0,
    rooms: [],
    byRoom: new Map(),
    items: [],
};

export const awaitsMeAcrossRoomsAtom = atom<AwaitsMeAcrossRoomsValue>((get) => {
    const userId = get(userIdAtom);
    const rooms = get(joinedRoomsAtom);
    if (!userId || rooms.length === 0) return EMPTY;

    const perRoom: Array<{ roomId: string; count: number }> = [];
    const byRoom = new Map<string, number>();
    const items: AwaitsMeItem[] = [];

    for (const room of rooms) {
        const roomItems = awaitsMeForMatrixRoom(room, userId);
        perRoom.push({ roomId: room.roomId, count: roomItems.length });
        byRoom.set(room.roomId, roomItems.length);
        for (const item of roomItems) items.push(item);
    }

    items.sort((a, b) => b.sortTimestamp - a.sortTimestamp);

    return {
        totalCount: items.length,
        rooms: perRoom,
        byRoom,
        items,
    };
});

/**
 * Derived atom of just the per-room count map. Subscribers who only need
 * to look up "does this single room have anything awaiting me?" can read
 * this instead of the full aggregate so they don't re-render when, say,
 * the items list reshuffles.
 */
export const awaitsMeByRoomAtom = atom<Map<string, number>>((get) => {
    return get(awaitsMeAcrossRoomsAtom).byRoom;
});
