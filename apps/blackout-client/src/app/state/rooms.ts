import { atom, useSetAtom } from 'jotai';
import { atomFamily, selectAtom } from 'jotai/utils';
import { ClientEvent, RoomEvent, SyncState, type MatrixClient, type Room } from 'matrix-js-sdk';
import { useEffect } from 'react';
import { matrixClientAtom } from './auth';

/**
 * Writable storage for the live `Room[]` snapshot. Bound to Matrix sync
 * events by `useBindAllRoomsAtom` so the value tracks the client across
 * room joins, leaves, and membership flips.
 *
 * Historically this was a derived atom reading `client.getRooms()` from
 * `matrixClientAtom`. That made it freeze at whatever the IndexedDB sync
 * store held the moment `applyAuthAtoms` set the client, because Jotai
 * never recomputed a derived atom whose only dependency (the client
 * reference) hadn't changed -- even though the client's internal room
 * list mutated freely as sync progressed.
 */
/**
 * Exported so tests can seed it directly when stubbing `matrixClientAtom`
 * with a mock client. Production code should rely on `useBindAllRoomsAtom`
 * to keep this in sync; treat this export as a test seam, not a public
 * write API.
 */
export const allRoomsBaseAtom = atom<Room[]>([]);

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

/**
 * Subscribes `allRoomsBaseAtom` to the Matrix client so it tracks the live
 * room list. Mount once in the logged-in tree (see `BootstrapStatus` in
 * `main.tsx`); the effect seeds the atom on mount and re-snapshots on
 * every relevant event.
 *
 * Snapshotting `mx.getRooms()` afresh per event (rather than patching a
 * delta) trades a small array allocation for immunity to missed events
 * and out-of-order delivery.
 */
export const useBindAllRoomsAtom = (mx: MatrixClient): void => {
    const setAllRooms = useSetAtom(allRoomsBaseAtom);

    useEffect(() => {
        const snapshot = () => {
            setAllRooms(mx.getRooms());
        };

        // Initial seed: covers warm sessions whose IndexedDB store
        // already has rooms by the time we mount.
        snapshot();

        const handleSync = (state: SyncState) => {
            // PREPARED fires when the first /sync response has been
            // processed -- this closes the cold-session race where
            // applyAuthAtoms set matrixClientAtom before any rooms
            // existed on the client.
            if (state === SyncState.Prepared || state === SyncState.Syncing) {
                snapshot();
            }
        };

        mx.on(ClientEvent.Room, snapshot);
        mx.on(ClientEvent.DeleteRoom, snapshot);
        mx.on(RoomEvent.MyMembership, snapshot);
        mx.on(ClientEvent.Sync, handleSync);

        return () => {
            mx.removeListener(ClientEvent.Room, snapshot);
            mx.removeListener(ClientEvent.DeleteRoom, snapshot);
            mx.removeListener(RoomEvent.MyMembership, snapshot);
            mx.removeListener(ClientEvent.Sync, handleSync);
        };
    }, [mx, setAllRooms]);
};
