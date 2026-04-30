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

/**
 * Mutual-aid thread contracts (BKL-013).
 *
 * Mirrors `_port`'s `/blackout/mutual-aid` route: requesters open a
 * thread describing a need, helpers reply, and a thread can be marked
 * resolved when the need is met.
 */
export const MUTUAL_AID_EVENT_NAMES = {
    threadOpened: 'co.bmc.deaddrop.mutual-aid.thread.opened',
    threadUpdated: 'co.bmc.deaddrop.mutual-aid.thread.updated',
} as const;

export type MutualAidEventName =
    (typeof MUTUAL_AID_EVENT_NAMES)[keyof typeof MUTUAL_AID_EVENT_NAMES];

export type MutualAidThreadStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled';

export interface MutualAidThreadPayload {
    /** Stable thread id (server-issued). */
    threadId: string;
    /** Subject who opened the thread. */
    requester: string;
    /** Short headline summarizing the need. */
    headline: string;
    /** Optional longer description. */
    body?: string;
    /** Status of the thread. */
    status: MutualAidThreadStatus;
    /** ISO-8601 timestamp the thread was opened. */
    openedAt: string;
    /** ISO-8601 timestamp the thread was last updated. */
    updatedAt: string;
}

export type MutualAidThreadOpenedEvent = EventEnvelope<
    'blackout.deaddrop.mutual-aid.thread.opened',
    MutualAidThreadPayload
>;

export type MutualAidThreadUpdatedEvent = EventEnvelope<
    'blackout.deaddrop.mutual-aid.thread.updated',
    MutualAidThreadPayload
>;

const isMutualAidEnvelope = (
    value: unknown
): value is { roomId: string; senderId: string; occurredAt: string; event: string; payload: unknown } => {
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

const MUTUAL_AID_STATUSES = ['open', 'in_progress', 'resolved', 'cancelled'] as const;

const isMutualAidPayload = (payload: unknown): payload is MutualAidThreadPayload => {
    if (!payload || typeof payload !== 'object') return false;
    const candidate = payload as Partial<MutualAidThreadPayload>;
    return (
        typeof candidate.threadId === 'string' &&
        typeof candidate.requester === 'string' &&
        typeof candidate.headline === 'string' &&
        typeof candidate.openedAt === 'string' &&
        typeof candidate.updatedAt === 'string' &&
        MUTUAL_AID_STATUSES.includes(
            candidate.status as (typeof MUTUAL_AID_STATUSES)[number]
        )
    );
};

export const isMutualAidThreadOpened = (
    value: unknown
): value is MutualAidThreadOpenedEvent => {
    if (!isMutualAidEnvelope(value)) return false;
    if (value.event !== 'blackout.deaddrop.mutual-aid.thread.opened') return false;
    return isMutualAidPayload((value as MutualAidThreadOpenedEvent).payload);
};

export const isMutualAidThreadUpdated = (
    value: unknown
): value is MutualAidThreadUpdatedEvent => {
    if (!isMutualAidEnvelope(value)) return false;
    if (value.event !== 'blackout.deaddrop.mutual-aid.thread.updated') return false;
    return isMutualAidPayload((value as MutualAidThreadUpdatedEvent).payload);
};
