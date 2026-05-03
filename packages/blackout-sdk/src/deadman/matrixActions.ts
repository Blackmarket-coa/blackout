import {
    DEADMAN_COMMAND_EVENT_TYPE,
    DEADMAN_EVENT_TYPE,
    DEADMAN_SCHEMA_VERSION,
    type DeadmanSwitchPayload,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

type DeadmanRoomConfig = {
    schemaVersion: number;
    enabled: boolean;
    /** The currently advertised switch (the owner's most recent armed switch in the room). */
    currentSwitch?: DeadmanSwitchPayload;
};

type DeadmanCommand = {
    action: 'check-in' | 'cancel';
    switchId: string;
    at: number;
    commandId: string;
};

export const createDeadmanMatrixActions = (client: MatrixEventClient) => ({
    /**
     * Mirror the room-level deadman switch config into a state event so
     * other clients can render status without polling the server. The
     * payload is opaque to Synapse; recipients evaluate the
     * `currentSwitch` envelope locally.
     */
    setRoomConfig: async (roomId: string, config: Omit<DeadmanRoomConfig, 'schemaVersion'>) =>
        client.sendStateEvent(
            roomId,
            DEADMAN_EVENT_TYPE,
            { ...config, schemaVersion: DEADMAN_SCHEMA_VERSION },
            ''
        ),
    /**
     * Broadcast a check-in or cancel command for a switch. Useful for
     * cross-device sync (a check-in on mobile lands as a state mutation
     * other devices observe before the API round-trip resolves).
     */
    sendSwitchCommand: async (roomId: string, command: DeadmanCommand) =>
        client.sendStateEvent(roomId, DEADMAN_COMMAND_EVENT_TYPE, command, command.switchId),
});
