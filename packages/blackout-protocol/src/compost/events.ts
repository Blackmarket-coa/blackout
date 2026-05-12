import type { EventEnvelope } from '../common/types';
import { isCompostPayload, type CompostPayload } from './contracts';

export const COMPOST_EVENT_TYPE = 'co.bmc.den.compost';
export const COMPOST_SCHEMA_VERSION = 1;

export type CompostTimelineEvent = EventEnvelope<'blackout.den.composted', CompostPayload>;

const isEventEnvelope = (
    value: unknown,
): value is {
    roomId: string;
    senderId: string;
    occurredAt: string;
    event: string;
    payload: unknown;
} => {
    if (!value || typeof value !== 'object') return false;
    const c = value as Partial<{
        roomId: string;
        senderId: string;
        occurredAt: string;
        event: string;
    }>;
    return (
        typeof c.roomId === 'string' &&
        typeof c.senderId === 'string' &&
        typeof c.occurredAt === 'string' &&
        typeof c.event === 'string'
    );
};

export const isCompostTimelineEvent = (value: unknown): value is CompostTimelineEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.den.composted') return false;
    return isCompostPayload((value as CompostTimelineEvent).payload);
};
