import type { EventEnvelope } from '../common/types';
import {
    isDenPlaybookPayload,
    type DenPlaybookPayload,
} from './contracts';

export const DEN_PLAYBOOK_EVENT_TYPE = 'co.bmc.den.playbook';
export const PLAYBOOK_SCHEMA_VERSION = 1;

export type DenPlaybookSetEvent = EventEnvelope<
    'blackout.den.playbook.set',
    DenPlaybookPayload
>;

const isEventEnvelope = (
    value: unknown
): value is {
    roomId: string;
    senderId: string;
    occurredAt: string;
    event: string;
    payload: unknown;
} => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<{
        roomId: string;
        senderId: string;
        occurredAt: string;
        event: string;
    }>;
    return (
        typeof candidate.roomId === 'string' &&
        typeof candidate.senderId === 'string' &&
        typeof candidate.occurredAt === 'string' &&
        typeof candidate.event === 'string'
    );
};

export const isDenPlaybookSetEvent = (value: unknown): value is DenPlaybookSetEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.den.playbook.set') return false;
    return isDenPlaybookPayload((value as DenPlaybookSetEvent).payload);
};
