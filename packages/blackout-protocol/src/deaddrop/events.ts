import type { EventEnvelope } from '../common/types';
import type { DeadDropEnvelopeV1 } from './crypto';

export const DEAD_DROP_EVENT_TYPE = 'co.bmc.deaddrop';
export const DEAD_DROP_QUEUE_EVENT_TYPE = 'co.bmc.deaddrop.queue';
export const DEAD_DROP_COMMAND_EVENT_TYPE = 'co.bmc.deaddrop.command';
export const DEAD_DROP_SHARE_EVENT_TYPE = 'co.bmc.deaddrop.share';
export const DEAD_DROP_AUDIT_EVENT_TYPE = 'co.bmc.deaddrop.audit';
export const DEAD_DROP_SCHEMA_VERSION = 1;

export type DeadDropCreated = EventEnvelope<
    'blackout.deaddrop.created',
    {
        deadDropId: string;
        expiresAt: string;
        /**
         * The opaque ciphertext envelope. Servers MUST treat this as a
         * black box: they may store it, expire it, and serve it back
         * verbatim, but they MUST NOT inspect or modify it.
         */
        envelope: DeadDropEnvelopeV1;
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
 * Quorum share submission (Team / Enterprise tiers). When a drop is
 * configured with k-of-n quorum, each team member contributes one share
 * via this event; the recipient client reconstructs the AES key from
 * any k shares using `combine()` from crypto/quorum.
 *
 * The share itself is encrypted to the recipient's pickup pubkey, so
 * the appservice and other room members never see the raw share bytes.
 */
export type DeadDropShareSubmitted = EventEnvelope<
    'blackout.deaddrop.share.submitted',
    {
        deadDropId: string;
        /** 1..255 — the GF(256) x-coordinate */
        shareIndex: number;
        /** Sealed-box ciphertext of the share bytes, base64. */
        encryptedShare: string;
        /** Submitting member id (matrix user id). */
        submittedBy: string;
    }
>;

/**
 * Per-org encrypted audit trail. Written to a Megolm-encrypted audit
 * room (`#deaddrop-audit:<server>`) so only org admins holding the room
 * key can read it.
 */
export type DeadDropAuditEntry = EventEnvelope<
    'blackout.deaddrop.audit',
    {
        deadDropId: string;
        action: 'created' | 'opened' | 'share-submitted' | 'expired' | 'rejected';
        actor: string;
        at: string;
        /** Optional human-readable reason (e.g. for `rejected`). */
        reason?: string;
    }
>;

/**
 * Mutual-aid thread contracts (BKL-013).
 *
 * A requester opens a thread describing a need; the thread carries a status
 * that can be moved to resolved once the need is met.
 *
 * Note what the payload deliberately does NOT model: there is no helper,
 * responder or `claimedBy` field, and `MutualAidThreadStatus` records only
 * that a thread progressed — not who moved it. An earlier version of this
 * comment described "helpers reply", which read as a shipped role and is not
 * one. Adding that role is a schema change, not a copy change.
 */
export const MUTUAL_AID_EVENT_NAMES = {
    threadOpened: 'co.bmc.deaddrop.mutual-aid.thread.opened',
    threadUpdated: 'co.bmc.deaddrop.mutual-aid.thread.updated',
} as const;

export type MutualAidEventName = typeof MUTUAL_AID_EVENT_NAMES[keyof typeof MUTUAL_AID_EVENT_NAMES];

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
        MUTUAL_AID_STATUSES.includes(candidate.status as typeof MUTUAL_AID_STATUSES[number])
    );
};

export const isMutualAidThreadOpened = (value: unknown): value is MutualAidThreadOpenedEvent => {
    if (!isMutualAidEnvelope(value)) return false;
    if (value.event !== 'blackout.deaddrop.mutual-aid.thread.opened') return false;
    return isMutualAidPayload((value as MutualAidThreadOpenedEvent).payload);
};

export const isMutualAidThreadUpdated = (value: unknown): value is MutualAidThreadUpdatedEvent => {
    if (!isMutualAidEnvelope(value)) return false;
    if (value.event !== 'blackout.deaddrop.mutual-aid.thread.updated') return false;
    return isMutualAidPayload((value as MutualAidThreadUpdatedEvent).payload);
};
