import { useCallback, useMemo } from 'react';
import {
    DEADMAN_COMMAND_EVENT_TYPE,
    DEADMAN_EVENT_TYPE,
    DEADMAN_SCHEMA_VERSION,
    type DeadmanSwitchPayload,
} from '@blackout/protocol';
import { createDeadmanMatrixActions } from '@blackout/sdk';
import { useMatrixClient } from '../../hooks/bmc-useMatrixClient';

/**
 * React hook exposing room-scoped deadman switch helpers. Mirrors the
 * deaddrop hook so feature plugins share a uniform integration shape.
 *
 * The hook deliberately does not own the API client wiring; arming and
 * checking-in are HTTP calls handled by `@blackout/sdk`'s
 * `createDeadmanActions`. This hook covers the Matrix-state mirror so
 * other devices in the room can render the current switch without
 * polling the server.
 */
export const useDeadmanSwitch = (roomId: string | null) => {
    const matrixClient = useMatrixClient();

    const actions = useMemo(() => {
        if (!matrixClient) return null;
        return createDeadmanMatrixActions({
            sendEvent: (rid, et, content) =>
                matrixClient.sendEvent(rid, et as never, content as never),
            sendStateEvent: (rid, et, content, stateKey) =>
                matrixClient.sendStateEvent(rid, et as never, content as never, stateKey),
        });
    }, [matrixClient]);

    const advertiseSwitch = useCallback(
        async (currentSwitch: DeadmanSwitchPayload | null) => {
            if (!actions || !roomId) return;
            await actions.setRoomConfig(roomId, {
                enabled: Boolean(currentSwitch),
                currentSwitch: currentSwitch ?? undefined,
            });
        },
        [actions, roomId]
    );

    const broadcastCommand = useCallback(
        async (command: { action: 'check-in' | 'cancel'; switchId: string }) => {
            if (!actions || !roomId) return;
            await actions.sendSwitchCommand(roomId, {
                action: command.action,
                switchId: command.switchId,
                at: Date.now(),
                commandId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`,
            });
        },
        [actions, roomId]
    );

    return {
        roomId,
        schemaVersion: DEADMAN_SCHEMA_VERSION,
        configEventType: DEADMAN_EVENT_TYPE,
        commandEventType: DEADMAN_COMMAND_EVENT_TYPE,
        advertiseSwitch,
        broadcastCommand,
    };
};
