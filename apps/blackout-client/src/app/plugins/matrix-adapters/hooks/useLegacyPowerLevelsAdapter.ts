import { useMemo } from 'react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { userIdAtom } from '../../../state/bmc-auth';
import { useLegacyRoomAdapter as useRoom } from './useLegacyRoomAdapter';
import { canDoAction, getPowerLevel } from '../../../features/room-metadata/utils/roomMetadata';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

export const useLegacyPowerLevelsAdapter = (roomId: string): HookResult<MatrixEvent | null> => {
    const roomState = useRoom(roomId);

    return useMemo(
        () => ({
            data: roomState.data?.currentState.getStateEvents('m.room.power_levels', '') ?? null,
            loading: roomState.loading,
            error: roomState.error,
        }),
        [roomState]
    );
};

export const useLegacyMyPowerLevelAdapter = (roomId: string): HookResult<number> => {
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

export const useLegacyCanSendMessageAdapter = (roomId: string): HookResult<boolean> => {
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

export const useLegacyCanModerateAdapter = (roomId: string): HookResult<boolean> => {
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
