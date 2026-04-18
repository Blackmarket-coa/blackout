import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoomMember } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../state/auth';
import { useMatrixClient } from './useMatrixClient';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

/** Returns reactive list of currently typing members in room (excluding me). */
export const useTypingIndicator = (roomId: string): HookResult<RoomMember[]> => {
    const client = useMatrixClient();
    const myUserId = useAtomValue(userIdAtom);
    const [typing, setTyping] = useState<RoomMember[]>([]);

    useEffect(() => {
        const room = roomId ? client.getRoom(roomId) : null;
        const update = () => {
            if (!room) {
                setTyping([]);
                return;
            }

            const typingMembers = room
                .getMembers()
                .filter((member: RoomMember) => member.typing)
                .filter((member: RoomMember) => member.userId !== myUserId);

            setTyping(typingMembers);
        };

        update();

        const emitter = room as unknown as {
            on?: (event: string, cb: () => void) => void;
            off?: (event: string, cb: () => void) => void;
        } | null;
        emitter?.on?.('RoomMember.typing', update);
        emitter?.on?.('RoomState.events', update);

        return () => {
            emitter?.off?.('RoomMember.typing', update);
            emitter?.off?.('RoomState.events', update);
        };
    }, [client, myUserId, roomId]);

    return useMemo(
        () => ({
            data: typing,
            loading: false,
            error: null,
        }),
        [typing],
    );
};

/** Returns function to send typing notifications for current user. */
export const useSendTyping = (roomId: string) => {
    const client = useMatrixClient();

    return useCallback(
        async (isTyping: boolean, timeoutMs = 10_000) => {
            await client.sendTyping(roomId, isTyping, timeoutMs);
        },
        [client, roomId],
    );
};
