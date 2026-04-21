import { useCallback, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { type IPushRule, type MatrixError } from 'matrix-js-sdk';
import {
    roomNotificationTypeAtom as baselineRoomNotificationTypeAtom,
    roomToUnreadAtom as baselineRoomToUnreadAtom,
} from '../../state/unreads';
import {
    roomNotificationTypeAtom as legacyRoomNotificationTypeAtom,
    roomToUnreadAtom as legacyRoomToUnreadAtom,
} from '../../state/bmc-unreads';
import { useMatrixClient as useBaselineMatrixClient } from '../../hooks/useMatrixClient';
import { useMatrixClient as useLegacyMatrixClient } from '../../hooks/bmc-useMatrixClient';
import type { PluginDefinition } from '../contracts';
import { isRuntimePluginEnabled } from '../manifest';

export interface HookResult<T> {
    data: T;
    loading: boolean;
    error: Error | null;
}

export interface PushRulesResult extends HookResult<IPushRule[]> {
    setRoomMute: (roomId: string, mute: boolean) => Promise<void>;
}

type NotificationModeAdapter = {
    useNotificationCount: (
        roomId: string
    ) => HookResult<{ total: number; highlight: number; mentions: number }>;
    useNotificationType: (roomId: string) => ReturnType<typeof useNotificationTypeFromAtoms>;
    usePushRules: () => PushRulesResult;
};

const useNotificationCountFromAtoms = (
    roomId: string,
    unreadAtom: typeof baselineRoomToUnreadAtom
): HookResult<{ total: number; highlight: number; mentions: number }> => {
    const unreadMap = useAtomValue(unreadAtom);

    return useMemo(
        () => ({
            data: unreadMap.get(roomId) ?? { total: 0, highlight: 0, mentions: 0 },
            loading: false,
            error: null,
        }),
        [roomId, unreadMap]
    );
};

const useNotificationTypeFromAtoms = (
    roomId: string,
    typeAtomFactory: typeof baselineRoomNotificationTypeAtom
) => {
    const type = useAtomValue(typeAtomFactory(roomId));
    const setType = useSetAtom(typeAtomFactory(roomId));

    return {
        type,
        setType,
    };
};

const usePushRulesFromClient = (useClient: typeof useBaselineMatrixClient): PushRulesResult => {
    const client = useClient();
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
        [client]
    );

    return {
        data: rules,
        loading: false,
        error,
        setRoomMute,
    };
};

const baselineNotificationsAdapter: NotificationModeAdapter = {
    useNotificationCount: (roomId) =>
        useNotificationCountFromAtoms(roomId, baselineRoomToUnreadAtom),
    useNotificationType: (roomId) =>
        useNotificationTypeFromAtoms(roomId, baselineRoomNotificationTypeAtom),
    usePushRules: () => usePushRulesFromClient(useBaselineMatrixClient),
};

const legacyNotificationsAdapter: NotificationModeAdapter = {
    useNotificationCount: (roomId) => useNotificationCountFromAtoms(roomId, legacyRoomToUnreadAtom),
    useNotificationType: (roomId) =>
        useNotificationTypeFromAtoms(roomId, legacyRoomNotificationTypeAtom),
    usePushRules: () => usePushRulesFromClient(useLegacyMatrixClient),
};

let unregisterLifecycle = (): void => {};

export const notificationsAdapterPlugin: PluginDefinition<'notifications.adapter'> = {
    id: 'notifications.adapter',
    isEnabled: () => isRuntimePluginEnabled('notifications.adapter'),
    register: () => {
        unregisterLifecycle = (): void => {};
        return unregisterLifecycle;
    },
    unregister: () => {
        unregisterLifecycle();
    },
};

export const resolveNotificationsAdapter = (pluginEnabled: boolean): NotificationModeAdapter =>
    pluginEnabled ? legacyNotificationsAdapter : baselineNotificationsAdapter;
