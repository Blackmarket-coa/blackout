import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import type { PluginDefinition } from '../contracts';
import { isRuntimePluginEnabled } from '../manifest';

export type ReadOnlyMatrixClientAdapter = Pick<
    MatrixClient,
    | 'getRoom'
    | 'getRooms'
    | 'getUserId'
    | 'getAccountData'
    | 'getPushActionsForEvent'
    | 'getVisibleRooms'
>;

export type ReadOnlyRoomAdapter = Pick<
    Room,
    'roomId' | 'name' | 'getLiveTimeline' | 'getJoinedMembers' | 'getPendingEvents'
>;

export type ReadOnlyMatrixEventAdapter = Pick<
    MatrixEvent,
    'getId' | 'getType' | 'getSender' | 'getTs' | 'getContent'
>;

export type MatrixReadOnlyAdapters = {
    client: ReadOnlyMatrixClientAdapter;
    room: ReadOnlyRoomAdapter;
    event: ReadOnlyMatrixEventAdapter;
};

const MATRIX_ADAPTER_PLUGIN_ID = 'notifications.adapter';

let unregisterLifecycle = (): void => {};

export const matrixReadOnlyAdaptersPlugin: PluginDefinition<'notifications.adapter'> = {
    id: MATRIX_ADAPTER_PLUGIN_ID,
    isEnabled: () => isRuntimePluginEnabled(MATRIX_ADAPTER_PLUGIN_ID),
    register: () => {
        unregisterLifecycle = (): void => {};
        return unregisterLifecycle;
    },
    unregister: () => {
        unregisterLifecycle();
    },
};

export const createReadOnlyMatrixAdapters = (
    client: MatrixClient,
    room: Room,
    event: MatrixEvent
): MatrixReadOnlyAdapters => ({
    client,
    room,
    event,
});
