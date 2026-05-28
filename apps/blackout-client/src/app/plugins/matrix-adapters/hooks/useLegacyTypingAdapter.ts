import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoomMember } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../../state/auth';
import { useLegacyMatrixClientAdapter as useMatrixClient } from './useLegacyMatrixClientAdapter';
import { useLegacyRoomAdapter as useRoom } from './useLegacyRoomAdapter';
import { shouldSendTypingNotifications } from '../../../features/metadata-privacy/outboundPrivacy';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

export const useLegacyTypingIndicatorAdapter = (roomId: string): HookResult<RoomMember[]> => {
    const roomState = useRoom(roomId);
    const myUserId = useAtomValue(userIdAtom);
    const [typing, setTyping] = useState<RoomMember[]>([]);

    useEffect(() => {
        const update = () => {
            const room = roomState.data;
            if (!room) {
                setTyping([]);
                return;
            }

            const typingMembers = room
                .getMembers()
                .filter((member) => member.typing)
                .filter((member) => member.userId !== myUserId);

            setTyping(typingMembers);
        };

        update();

        const room = roomState.data;
        const emitter = room as {
            on?: (event: string, cb: () => void) => void;
            off?: (event: string, cb: () => void) => void;
        } | null;
        emitter?.on?.('RoomMember.typing', update);
        emitter?.on?.('RoomState.events', update);

        return () => {
            emitter?.off?.('RoomMember.typing', update);
            emitter?.off?.('RoomState.events', update);
        };
    }, [myUserId, roomState.data]);

    return useMemo(
        () => ({
            data: typing,
            loading: roomState.loading,
            error: roomState.error,
        }),
        [roomState.error, roomState.loading, typing]
    );
};

export const useLegacySendTypingAdapter = (roomId: string) => {
    const client = useMatrixClient();

    return useCallback(
        async (isTyping: boolean, timeoutMs = 10_000) => {
            // Respect the outbound-privacy toggle: don't broadcast typing when
            // the user has opted out (sending `true` is the leak; `false` would
            // only ever clear our own state, so suppressing both is fine).
            if (!shouldSendTypingNotifications()) return;
            await client.sendTyping(roomId, isTyping, timeoutMs);
        },
        [client, roomId]
    );
};
