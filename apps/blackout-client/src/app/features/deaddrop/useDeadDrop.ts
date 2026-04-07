import { useCallback, useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';

export const DEAD_DROP_EVENT_TYPE = 'co.bmc.deaddrop';
export const DEAD_DROP_QUEUE_EVENT_TYPE = 'co.bmc.deaddrop.queue';
export const DEAD_DROP_COMMAND_EVENT_TYPE = 'co.bmc.deaddrop.command';
export const DEAD_DROP_SCHEMA_VERSION = 1;

export type DeadDropScheduleType = 'interval' | 'cron' | 'manual';

export interface DeadDropSchedule {
    type: DeadDropScheduleType;
    intervalMinutes?: number;
    cronExpression?: string;
}

export interface DeadDropConfig {
    schemaVersion: number;
    enabled: boolean;
    schedule: DeadDropSchedule;
    anonymize: boolean;
    maxQueueSize: number;
    retentionHours: number;
}

export interface DeadDropDiagnostics {
    schemaVersion: number;
    migrated: boolean;
    queueCount: number;
    invalidStateEvents: number;
}

const defaultConfig: DeadDropConfig = {
    schemaVersion: DEAD_DROP_SCHEMA_VERSION,
    enabled: false,
    schedule: {
        type: 'interval',
        intervalMinutes: 60,
    },
    anonymize: false,
    maxQueueSize: 100,
    retentionHours: 48,
};

const normalizeSchedule = (input: Record<string, unknown> | undefined): DeadDropSchedule => {
    if (!input) return defaultConfig.schedule;

    const type = input.type;
    if (type !== 'interval' && type !== 'cron' && type !== 'manual') {
        return defaultConfig.schedule;
    }

    const intervalMinutes =
        typeof input.intervalMinutes === 'number'
            ? Math.max(1, Math.floor(input.intervalMinutes))
            : undefined;
    const cronExpression =
        typeof input.cronExpression === 'string' ? input.cronExpression : undefined;

    return {
        type,
        intervalMinutes,
        cronExpression,
    };
};

const toDeadDropConfig = (
    content: Record<string, unknown> | undefined,
): { config: DeadDropConfig; migrated: boolean; invalid: boolean } => {
    if (!content) return { config: defaultConfig, migrated: false, invalid: false };

    const schemaVersionRaw = content.schemaVersion ?? content.schema_version;
    const schemaVersion =
        typeof schemaVersionRaw === 'number' ? Math.max(0, Math.floor(schemaVersionRaw)) : 0;

    const config: DeadDropConfig = {
        schemaVersion: schemaVersion || DEAD_DROP_SCHEMA_VERSION,
        enabled: content.enabled === true,
        schedule: normalizeSchedule(content.schedule as Record<string, unknown> | undefined),
        anonymize: content.anonymize === true,
        maxQueueSize:
            typeof content.maxQueueSize === 'number'
                ? Math.max(1, Math.floor(content.maxQueueSize))
                : typeof content.queue_limit === 'number'
                  ? Math.max(1, Math.floor(content.queue_limit))
                  : defaultConfig.maxQueueSize,
        retentionHours:
            typeof content.retentionHours === 'number'
                ? Math.max(1, Math.floor(content.retentionHours))
                : typeof content.retention_hours === 'number'
                  ? Math.max(1, Math.floor(content.retention_hours))
                  : defaultConfig.retentionHours,
    };

    const invalid = !content.schedule || typeof content.enabled !== 'boolean';
    return { config, migrated: schemaVersion !== DEAD_DROP_SCHEMA_VERSION, invalid };
};

const toQueueCount = (content: Record<string, unknown> | undefined): number => {
    if (!content) return 0;
    const raw = content.queueCount;
    return typeof raw === 'number' ? Math.max(0, Math.floor(raw)) : 0;
};

export const getNextDeliveryDate = (config: DeadDropConfig): Date | null => {
    if (!config.enabled) return null;

    if (config.schedule.type === 'interval') {
        const minutes = config.schedule.intervalMinutes ?? 60;
        return new Date(Date.now() + minutes * 60_000);
    }

    if (config.schedule.type === 'cron') {
        const next = new Date();
        next.setMinutes(0, 0, 0);
        next.setHours(next.getHours() + 1);
        return next;
    }

    return null;
};

export const describeDeadDropSchedule = (config: DeadDropConfig): string => {
    if (!config.enabled) return 'Dead drop disabled';

    if (config.schedule.type === 'interval') {
        return `Dead Drop: delivers every ${config.schedule.intervalMinutes ?? 60} min`;
    }

    if (config.schedule.type === 'cron') {
        return `Dead Drop: cron ${config.schedule.cronExpression ?? '0 * * * *'}`;
    }

    return 'Dead Drop: manual release only';
};

export const useDeadDrop = (roomId: string) => {
    const roomState = useRoom(roomId);

    return useMemo(() => {
        const room = roomState.data;
        const deadDropEvent = room?.currentState.getStateEvents(DEAD_DROP_EVENT_TYPE, '');
        const queueEvent = room?.currentState.getStateEvents(DEAD_DROP_QUEUE_EVENT_TYPE, '');

        const normalized = toDeadDropConfig(deadDropEvent?.getContent<Record<string, unknown>>());
        const queueCount = toQueueCount(queueEvent?.getContent<Record<string, unknown>>());

        return {
            ...roomState,
            data: normalized.config,
            queueCount,
            diagnostics: {
                schemaVersion: normalized.config.schemaVersion,
                migrated: normalized.migrated,
                queueCount,
                invalidStateEvents: normalized.invalid ? 1 : 0,
            } satisfies DeadDropDiagnostics,
            summary: describeDeadDropSchedule(normalized.config),
            nextDelivery: getNextDeliveryDate(normalized.config),
        };
    }, [roomState]);
};

export const useSetDeadDrop = (roomId: string) => {
    const client = useMatrixClient();

    return useCallback(
        async (config: DeadDropConfig) => {
            await client.sendStateEvent(
                roomId,
                DEAD_DROP_EVENT_TYPE as never,
                { ...config, schemaVersion: DEAD_DROP_SCHEMA_VERSION } as never,
                '',
            );
        },
        [client, roomId],
    );
};

export const useDeadDropQueueActions = (roomId: string) => {
    const client = useMatrixClient();

    return useMemo(
        () => ({
            flush: async () =>
                client.sendStateEvent(
                    roomId,
                    DEAD_DROP_COMMAND_EVENT_TYPE as never,
                    { action: 'flush', at: Date.now(), commandId: crypto.randomUUID() } as never,
                    '',
                ),
            clear: async () =>
                client.sendStateEvent(
                    roomId,
                    DEAD_DROP_COMMAND_EVENT_TYPE as never,
                    { action: 'clear', at: Date.now(), commandId: crypto.randomUUID() } as never,
                    '',
                ),
        }),
        [client, roomId],
    );
};
