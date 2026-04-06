import { useCallback, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { type IPushRule, type MatrixError } from 'matrix-js-sdk';
import { roomNotificationTypeAtom, roomToUnreadAtom } from '../state/unreads';
import { useMatrixClient } from './useMatrixClient';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

/** Returns unread totals/highlights/mentions for a room. */
export const useNotificationCount = (
    roomId: string,
): HookResult<{ total: number; highlight: number; mentions: number }> => {
    const unreadMap = useAtomValue(roomToUnreadAtom);

    return useMemo(
        () => ({
            data: unreadMap.get(roomId) ?? { total: 0, highlight: 0, mentions: 0 },
            loading: false,
            error: null,
        }),
        [roomId, unreadMap],
    );
};

/** Returns and sets room notification behavior (mute/mention/all). */
export const useNotificationType = (roomId: string) => {
    const type = useAtomValue(roomNotificationTypeAtom(roomId));
    const setType = useSetAtom(roomNotificationTypeAtom(roomId));

    return {
        type,
        setType,
    };
};

export interface PushRulesResult extends HookResult<IPushRule[]> {
    setRoomMute: (roomId: string, mute: boolean) => Promise<void>;
}

/** Returns push rules and helpers to update room mute state. */
export const usePushRules = (): PushRulesResult => {
    const client = useMatrixClient();
    const [error, setError] = useState<Error | null>(null);

    const rules = useMemo(() => {
        const pushRules = client
            .getAccountData('m.push_rules' as unknown as never)
            ?.getContent<{ global?: { override?: IPushRule[] } }>();
        return pushRules?.global?.override ?? [];
    }, [client]);

    const setRoomMute = useCallback(
        async (roomId: string, mute: boolean) => {
            try {
                setError(null);
                await client.setRoomMutePushRule('global', roomId, mute);
            } catch (err) {
                const fallbackError = err as MatrixError;
                setError(new Error(fallbackError.message || 'Failed to update push rule.'));
                throw err;
            }
        },
        [client],
    );

    return {
        data: rules,
        loading: false,
        error,
        setRoomMute,
    };
};
