import {
    DEAD_DROP_COMMAND_EVENT_TYPE,
    DEAD_DROP_EVENT_TYPE,
    DEAD_DROP_SCHEMA_VERSION,
} from '@blackout/protocol';
import type { MatrixEventClient } from '../matrix/types';

type DeadDropConfig = {
    schemaVersion: number;
    enabled: boolean;
    schedule: {
        type: 'interval' | 'cron' | 'manual';
        intervalMinutes?: number;
        cronExpression?: string;
    };
    anonymize: boolean;
    maxQueueSize: number;
    retentionHours: number;
};

type DeadDropCommand = {
    action: 'flush' | 'clear';
    at: number;
    commandId: string;
};

export const createDeadDropMatrixActions = (client: MatrixEventClient) => ({
    setDeadDropConfig: async (roomId: string, config: DeadDropConfig) =>
        client.sendStateEvent(
            roomId,
            DEAD_DROP_EVENT_TYPE,
            { ...config, schemaVersion: DEAD_DROP_SCHEMA_VERSION },
            ''
        ),
    sendQueueCommand: async (roomId: string, command: DeadDropCommand) =>
        client.sendStateEvent(roomId, DEAD_DROP_COMMAND_EVENT_TYPE, command, ''),
});
