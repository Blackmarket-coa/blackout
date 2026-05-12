import type { EventEnvelope } from '../common/types';
import {
    isRoundOpenedPayload,
    type RoundClosedPayload,
    type RoundOpenedPayload,
} from './contracts';

export const ROUND_OPENED_EVENT_TYPE = 'co.bmc.governance.round.opened';
export const ROUND_CLOSED_EVENT_TYPE = 'co.bmc.governance.round.closed';
export const ROUNDS_SCHEMA_VERSION = 1;

export type RoundOpenedTimelineEvent = EventEnvelope<
    'blackout.governance.round.opened',
    RoundOpenedPayload
>;

export type RoundClosedTimelineEvent = EventEnvelope<
    'blackout.governance.round.closed',
    RoundClosedPayload
>;

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

export const isRoundOpenedTimelineEvent = (
    value: unknown,
): value is RoundOpenedTimelineEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.governance.round.opened') return false;
    return isRoundOpenedPayload((value as RoundOpenedTimelineEvent).payload);
};
