import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MatrixClient, Room, RoomMember } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { getRoomAvatar, getRoomName, getRoomTopic, getJoinedMembers } from '../utils/room';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

const useRoomSubscription = (roomId: string): HookResult<Room | null> => {
    const client = useMatrixClient();
    const [room, setRoom] = useState<Room | null>(() => client.getRoom(roomId) ?? null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const resolveRoom = (mx: MatrixClient) => {
            try {
                setLoading(true);
                setError(null);
                setRoom(mx.getRoom(roomId) ?? null);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to resolve room.'));
            } finally {
                setLoading(false);
            }
        };

        resolveRoom(client);

        const onRoom = () => resolveRoom(client);
        const emitter = client as unknown as {
            on: (event: string, cb: () => void) => void;
            off: (event: string, cb: () => void) => void;
        };
        emitter.on('Room', onRoom);
        emitter.on('Room.name', onRoom);
        emitter.on('RoomState.events', onRoom);
        emitter.on('Room.timeline', onRoom);

        return () => {
            emitter.off('Room', onRoom);
            emitter.off('Room.name', onRoom);
            emitter.off('RoomState.events', onRoom);
            emitter.off('Room.timeline', onRoom);
        };
    }, [client, roomId]);

    return { data: room, loading, error };
};

/** Returns reactive room object for given roomId. */
export const useRoom = (roomId: string): HookResult<Room | null> => useRoomSubscription(roomId);

/** Returns reactive room display name for given roomId. */
export const useRoomName = (roomId: string): HookResult<string> => {
    const roomState = useRoomSubscription(roomId);

    return useMemo(
        () => ({
            data: roomState.data ? getRoomName(roomState.data) : roomId,
            loading: roomState.loading,
            error: roomState.error,
        }),
        [roomId, roomState],
    );
};

/** Returns reactive room avatar URL for given roomId. */
export const useRoomAvatar = (roomId: string): HookResult<string | null> => {
    const client = useMatrixClient();
    const roomState = useRoomSubscription(roomId);

    return useMemo(
        () => ({
            data: roomState.data ? getRoomAvatar(roomState.data, client) : null,
            loading: roomState.loading,
            error: roomState.error,
        }),
        [client, roomState],
    );
};

/** Returns reactive room topic for given roomId. */
export const useRoomTopic = (roomId: string): HookResult<string | null> => {
    const roomState = useRoomSubscription(roomId);

    return useMemo(
        () => ({
            data: roomState.data ? getRoomTopic(roomState.data) : null,
            loading: roomState.loading,
            error: roomState.error,
        }),
        [roomState],
    );
};

/** Returns reactive joined members for given roomId. */
export const useRoomMembers = (roomId: string): HookResult<RoomMember[]> => {
    const roomState = useRoomSubscription(roomId);

    return useMemo(
        () => ({
            data: roomState.data ? getJoinedMembers(roomState.data) : [],
            loading: roomState.loading,
            error: roomState.error,
        }),
        [roomState],
    );
};

export const useRoomRefresh = (roomId: string) => {
    const client = useMatrixClient();

    return useCallback(() => client.getRoom(roomId) ?? null, [client, roomId]);
};
