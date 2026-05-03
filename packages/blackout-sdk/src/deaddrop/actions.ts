import {
    DEAD_DROP_QUOTAS,
    encryptDeadDrop,
    isOpaqueEnvelope,
    type DeadDropAuditEntry,
    type DeadDropCreated,
    type DeadDropEnvelopeV1,
    type DeadDropOpened,
    type DeadDropPaddingStrategy,
    type DeadDropShareSubmitted,
    type EntitlementAccessPayload,
    type MutualAidThreadOpenedEvent,
    type MutualAidThreadPayload,
    type MutualAidThreadStatus,
    type MutualAidThreadUpdatedEvent,
} from '@blackout/protocol';
import type { ApiClient } from '../client/types';
import {
    checkDeadDropEntitlements,
    type DeadDropGateResult,
    tierFromEntitlementPayload,
} from './entitlementGate';

/**
 * Tier-aware dead drop request maker.
 *
 * The three endpoints (`/v1/deaddrop/send`, `/v1/deaddrop/fetch`,
 * `/v1/deaddrop/open`) intentionally accept and return identical-shape
 * JSON so a passive observer cannot distinguish reads from writes by
 * traffic shape (cf. SecureDrop Protocol).
 */

export type CreateDeadDropInput = {
    plaintext: Uint8Array;
    recipientPublicKeyBase64: string;
    recipientCount?: number;
    retentionHours: number;
    coverSender?: boolean;
    paddingStrategy?: DeadDropPaddingStrategy;
    scheduledFlush?: boolean;
};

export type FetchDeadDropsResponse = {
    /** Mixed real + decoy envelopes; recipient must attempt to decrypt each. */
    envelopes: DeadDropEnvelopeV1[];
    /** Number of envelopes claimed to be decoys (informational; never trusted). */
    decoyCount: number;
};

export type SubmitQuorumShareInput = {
    deadDropId: string;
    shareIndex: number;
    encryptedShare: string;
};

const ENDPOINT = '/v1/deaddrop';

export const createDeadDropActions = (
    client: ApiClient,
    getEntitlements: () => EntitlementAccessPayload | undefined
) => {
    const requirePayload = (): EntitlementAccessPayload => {
        const payload = getEntitlements();
        if (!payload) {
            throw new Error(
                'Dead drop actions require an entitlement payload — call withEntitlements() first.'
            );
        }
        return payload;
    };

    return {
        /**
         * Encrypt + send a drop. Pre-flight checks the user's tier and
         * throws a typed error before any bytes leave the client when the
         * request would exceed entitlements.
         */
        sendDeadDrop: async (
            input: CreateDeadDropInput
        ): Promise<{
            envelope: DeadDropEnvelopeV1;
            response: DeadDropCreated;
            gate: DeadDropGateResult;
        }> => {
            const payload = requirePayload();
            const recipientCount = input.recipientCount ?? 1;
            const padStrategy: DeadDropPaddingStrategy =
                input.paddingStrategy ?? 'minimal';

            const gate = checkDeadDropEntitlements(payload, {
                payloadBytes: input.plaintext.length,
                recipientCount,
                retentionHours: input.retentionHours,
                requestPaddingBucket: padStrategy === 'bucket',
                requestCoverSender: input.coverSender === true,
                requestQuorumOpen: false,
                requestScheduledFlush: input.scheduledFlush === true,
            });
            if (!gate.ok) {
                throw new DeadDropEntitlementError(gate);
            }

            const expiresAt = new Date(
                Date.now() + input.retentionHours * 3_600_000
            ).toISOString();

            const envelope = await encryptDeadDrop({
                plaintext: input.plaintext,
                recipientPublicKeyBase64: input.recipientPublicKeyBase64,
                paddingStrategy: padStrategy,
                expiresAt,
            });

            const response = await client<DeadDropCreated>({
                method: 'POST',
                path: `${ENDPOINT}/send`,
                body: {
                    deadDropId: envelope.dropId,
                    expiresAt: envelope.expiresAt,
                    envelope,
                } satisfies DeadDropCreated['payload'],
            });

            return { envelope, response, gate };
        },

        /**
         * Fetch envelopes addressed by a clue. Server returns N decoys
         * mixed with real envelopes — the client tries to decrypt each
         * and silently drops failures.
         */
        fetchDeadDrops: (clueBase64: string) =>
            client<FetchDeadDropsResponse>({
                method: 'POST',
                path: `${ENDPOINT}/fetch`,
                body: { clue: clueBase64 },
            }),

        /**
         * Mark a drop as opened (used for audit trail; not required for
         * decryption itself).
         */
        openDeadDrop: (payload: DeadDropOpened['payload']) =>
            client<DeadDropOpened>({
                method: 'POST',
                path: `${ENDPOINT}/open`,
                body: payload,
            }),

        /**
         * Submit a Shamir share for a quorum-gated drop (Team / Enterprise).
         */
        submitQuorumShare: (input: SubmitQuorumShareInput) =>
            client<DeadDropShareSubmitted>({
                method: 'POST',
                path: `${ENDPOINT}/share`,
                body: input,
            }),

        /**
         * Append an encrypted audit entry. Caller is responsible for
         * sending it to the audit room via Megolm — this just records it
         * server-side for retention/compliance.
         */
        appendAuditEntry: (entry: DeadDropAuditEntry['payload']) =>
            client<DeadDropAuditEntry>({
                method: 'POST',
                path: `${ENDPOINT}/audit`,
                body: entry,
            }),

        /**
         * Returns the current tier + quota snapshot for the calling user.
         * Useful for UI render of "you can send up to X bytes".
         */
        getEffectiveQuota: () => {
            const payload = requirePayload();
            const tier = tierFromEntitlementPayload(payload);
            return { tier, quotas: DEAD_DROP_QUOTAS[tier] };
        },
    };
};

export class DeadDropEntitlementError extends Error {
    readonly gate: DeadDropGateResult;
    constructor(gate: DeadDropGateResult & { ok: false }) {
        super(gate.message);
        this.name = 'DeadDropEntitlementError';
        this.gate = gate;
    }
}

export { isOpaqueEnvelope };

/* ---------------- Mutual aid actions (unchanged) ---------------- */

export type MutualAidThreadListResponse = {
    subject: string;
    threads: MutualAidThreadPayload[];
};

export type OpenMutualAidThreadInput = {
    headline: string;
    body?: string;
};

export const createMutualAidActions = (client: ApiClient) => ({
    listThreads: () =>
        client<MutualAidThreadListResponse>({
            method: 'GET',
            path: '/v1/deaddrop/mutual-aid/threads',
        }),
    openThread: (input: OpenMutualAidThreadInput) =>
        client<MutualAidThreadOpenedEvent>({
            method: 'POST',
            path: '/v1/deaddrop/mutual-aid/threads',
            body: input,
        }),
    updateThreadStatus: (threadId: string, status: MutualAidThreadStatus) =>
        client<MutualAidThreadUpdatedEvent>({
            method: 'PUT',
            path: `/v1/deaddrop/mutual-aid/threads/${encodeURIComponent(threadId)}/status`,
            body: { status },
        }),
});

export const filterActiveMutualAidThreads = (
    threads: readonly MutualAidThreadPayload[]
): MutualAidThreadPayload[] =>
    threads.filter(
        (thread) => thread.status === 'open' || thread.status === 'in_progress'
    );

export const applyMutualAidThreadUpdate = (
    threads: readonly MutualAidThreadPayload[],
    payload: MutualAidThreadPayload
): MutualAidThreadPayload[] => {
    const existing = threads.find((thread) => thread.threadId === payload.threadId);
    if (!existing) return [...threads, payload];
    return threads.map((thread) =>
        thread.threadId === payload.threadId ? { ...thread, ...payload } : thread
    );
};

export type {
    MutualAidThreadOpenedEvent,
    MutualAidThreadPayload,
    MutualAidThreadStatus,
    MutualAidThreadUpdatedEvent,
};
