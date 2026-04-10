import { atom } from 'jotai';
import { atomFamily, selectAtom } from 'jotai/utils';
import type { Room } from 'matrix-js-sdk';
import { matrixClientAtom } from './bmc-auth';

/**
 * Snapshot of all rooms currently available from the active Matrix client.
 */
const allRoomsBaseAtom = atom<Room[]>((get) => {
    const client = get(matrixClientAtom);
    return client?.getRooms() ?? [];
});

/**
 * List of every known room from Matrix sync state.
 */
export const allRoomsAtom = selectAtom(allRoomsBaseAtom, (rooms) => rooms);

/**
 * Atom family that resolves a single room by room ID.
 */
export const roomByIdAtom = atomFamily((roomId: string) =>
    atom<Room | null>((get) => {
        const client = get(matrixClientAtom);
        return client?.getRoom(roomId) ?? null;
    }),
);

/**
 * Rooms where the current user has `join` membership.
 */
export const joinedRoomsAtom = selectAtom(allRoomsAtom, (rooms) =>
    rooms.filter((room) => room.getMyMembership() === 'join'),
);

/**
 * Rooms where the current user has pending `invite` membership.
 */
export const invitedRoomsAtom = selectAtom(allRoomsAtom, (rooms) =>
    rooms.filter((room) => room.getMyMembership() === 'invite'),
);
