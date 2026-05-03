/**
 * Dead drop entitlement keys + per-tier quotas.
 *
 * The entitlement system itself only stores booleans (see
 * `entitlements/types.ts`), so quantitative limits live in
 * `DEAD_DROP_QUOTAS` keyed by `EntitlementTier`.
 *
 * Free tier is a fully-functional secure dead drop. Paid tiers add
 * substantive capabilities (anonymity hardening, capacity, team
 * coordination) — never mere unlocks of the same code path.
 */

import type { EntitlementKey, EntitlementTier } from '../entitlements/types';

export const DEAD_DROP_ENTITLEMENT_KEYS = {
    enabled: 'features.deaddrop.enabled',
    scheduledFlush: 'features.deaddrop.scheduledFlush',
    multiRecipient: 'features.deaddrop.multiRecipient',
    paddingBucket: 'features.deaddrop.anonymity.padding',
    decoys: 'features.deaddrop.anonymity.decoys',
    coverSender: 'features.deaddrop.anonymity.coverSender',
    mutualAidPost: 'features.deaddrop.mutualAid.post',
    quorumOpen: 'features.deaddrop.team.quorumOpen',
    auditLog: 'features.deaddrop.team.auditLog',
    webauthnRequired: 'features.deaddrop.team.webauthnRequired',
} as const satisfies Record<string, EntitlementKey>;

export type DeadDropEntitlementKey =
    (typeof DEAD_DROP_ENTITLEMENT_KEYS)[keyof typeof DEAD_DROP_ENTITLEMENT_KEYS];

export type DeadDropQuotas = {
    /** Maximum plaintext payload bytes allowed before encryption. */
    maxPayloadBytes: number;
    /** Maximum retention window in hours before server-side expiry. */
    maxRetentionHours: number;
    /** Max recipients per drop. -1 = unlimited. */
    maxRecipients: number;
    /** Max number of decoys returned on each /fetch. */
    decoysPerFetch: number;
    /** Max members in a quorum share set. */
    maxQuorumMembers: number;
};

export const DEAD_DROP_QUOTAS: Record<EntitlementTier, DeadDropQuotas> = {
    free: {
        maxPayloadBytes: 64 * 1024,
        maxRetentionHours: 24,
        maxRecipients: 1,
        decoysPerFetch: 0,
        maxQuorumMembers: 0,
    },
    pro: {
        maxPayloadBytes: 5 * 1024 * 1024,
        maxRetentionHours: 24 * 30,
        maxRecipients: 16,
        decoysPerFetch: 9,
        maxQuorumMembers: 0,
    },
    team: {
        maxPayloadBytes: 50 * 1024 * 1024,
        maxRetentionHours: 24 * 90,
        maxRecipients: 256,
        decoysPerFetch: 9,
        maxQuorumMembers: 7,
    },
    enterprise: {
        maxPayloadBytes: 500 * 1024 * 1024,
        maxRetentionHours: 24 * 365,
        maxRecipients: -1,
        decoysPerFetch: 9,
        maxQuorumMembers: 31,
    },
};

/**
 * Per-tier default boolean entitlements. Used by the API route's
 * canonical entitlement set so a paid plan switch is a one-line change
 * here, not a sweep across consumer code.
 */
export const DEAD_DROP_TIER_ENTITLEMENTS: Record<
    EntitlementTier,
    Partial<Record<DeadDropEntitlementKey, boolean>>
> = {
    free: {
        'features.deaddrop.enabled': true,
    },
    pro: {
        'features.deaddrop.enabled': true,
        'features.deaddrop.scheduledFlush': true,
        'features.deaddrop.multiRecipient': true,
        'features.deaddrop.anonymity.padding': true,
        'features.deaddrop.anonymity.decoys': true,
        'features.deaddrop.anonymity.coverSender': true,
        'features.deaddrop.mutualAid.post': true,
    },
    team: {
        'features.deaddrop.enabled': true,
        'features.deaddrop.scheduledFlush': true,
        'features.deaddrop.multiRecipient': true,
        'features.deaddrop.anonymity.padding': true,
        'features.deaddrop.anonymity.decoys': true,
        'features.deaddrop.anonymity.coverSender': true,
        'features.deaddrop.mutualAid.post': true,
        'features.deaddrop.team.quorumOpen': true,
        'features.deaddrop.team.auditLog': true,
    },
    enterprise: {
        'features.deaddrop.enabled': true,
        'features.deaddrop.scheduledFlush': true,
        'features.deaddrop.multiRecipient': true,
        'features.deaddrop.anonymity.padding': true,
        'features.deaddrop.anonymity.decoys': true,
        'features.deaddrop.anonymity.coverSender': true,
        'features.deaddrop.mutualAid.post': true,
        'features.deaddrop.team.quorumOpen': true,
        'features.deaddrop.team.auditLog': true,
        'features.deaddrop.team.webauthnRequired': true,
    },
};
