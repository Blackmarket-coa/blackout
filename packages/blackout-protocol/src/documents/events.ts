import type { EventEnvelope } from '../common/types';
import { isDenDocumentPayload, type DenDocumentPayload } from './contracts';

export const DEN_DOCUMENT_EVENT_TYPE = 'co.bmc.den.documents';
export const DEN_DOCUMENT_SCHEMA_VERSION = 1;

export type DenDocumentUpsertedTimelineEvent = EventEnvelope<
    'blackout.den.document.upserted',
    DenDocumentPayload
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

export const isDenDocumentUpsertedTimelineEvent = (
    value: unknown,
): value is DenDocumentUpsertedTimelineEvent => {
    if (!isEventEnvelope(value)) return false;
    if (value.event !== 'blackout.den.document.upserted') return false;
    return isDenDocumentPayload((value as DenDocumentUpsertedTimelineEvent).payload);
};
