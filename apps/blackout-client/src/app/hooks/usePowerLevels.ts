import { useMemo } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../state/auth';
import { useRoom } from './useRoom';
import { canDoAction, getPowerLevel } from '../utils/room';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

/** Returns m.room.power_levels state event for room. */
export const usePowerLevels = (roomId: string): HookResult<MatrixEvent | null> => {
    const roomState = useRoom(roomId);

    return useMemo(
        () => ({
            data: roomState.data?.currentState.getStateEvents('m.room.power_levels', '') ?? null,
            loading: roomState.loading,
            error: roomState.error,
        }),
        [roomState],
    );
};

/** Returns current user's effective power level in room. */
export const useMyPowerLevel = (roomId: string): HookResult<number> => {
    const roomState = useRoom(roomId);
    const myUserId = useAtomValue(userIdAtom);

    return useMemo(() => {
        if (!roomState.data || !myUserId) {
            return { data: 0, loading: roomState.loading, error: roomState.error };
        }

        return {
            data: getPowerLevel(roomState.data, myUserId),
            loading: roomState.loading,
            error: roomState.error,
        };
    }, [myUserId, roomState]);
};

/** Returns whether current user can send m.room.message events in room. */
export const useCanSendMessage = (roomId: string): HookResult<boolean> => {
    const roomState = useRoom(roomId);
    const myUserId = useAtomValue(userIdAtom);

    return useMemo(() => {
        if (!roomState.data || !myUserId) {
            return { data: false, loading: roomState.loading, error: roomState.error };
        }

        return {
            data: canDoAction(roomState.data, myUserId, 'm.room.message'),
            loading: roomState.loading,
            error: roomState.error,
        };
    }, [myUserId, roomState]);
};

/** Returns whether current user can moderate (kick/ban) in room. */
export const useCanModerate = (roomId: string): HookResult<boolean> => {
    const roomState = useRoom(roomId);
    const myUserId = useAtomValue(userIdAtom);

    return useMemo(() => {
        if (!roomState.data || !myUserId) {
            return { data: false, loading: roomState.loading, error: roomState.error };
        }

        const canKick = canDoAction(roomState.data, myUserId, 'kick');
        const canBan = canDoAction(roomState.data, myUserId, 'ban');

        return {
            data: canKick || canBan,
            loading: roomState.loading,
            error: roomState.error,
        };
    }, [myUserId, roomState]);
};
