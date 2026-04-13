import type { EventEnvelope } from '../common/types';

export const DEAD_DROP_EVENT_TYPE = 'co.bmc.deaddrop';
export const DEAD_DROP_QUEUE_EVENT_TYPE = 'co.bmc.deaddrop.queue';
export const DEAD_DROP_COMMAND_EVENT_TYPE = 'co.bmc.deaddrop.command';
export const DEAD_DROP_SCHEMA_VERSION = 1;

export type DeadDropCreated = EventEnvelope<
    'blackout.deaddrop.created',
    {
        deadDropId: string;
        expiresAt: string;
        encryptedPayload: string;
    }
>;

export type DeadDropOpened = EventEnvelope<
    'blackout.deaddrop.opened',
    {
        deadDropId: string;
        openedBy: string;
    }
>;
