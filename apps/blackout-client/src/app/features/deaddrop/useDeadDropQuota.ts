/**
 * Hook surfacing the caller's effective dead-drop tier and quotas.
 *
 * The hook reads from whatever entitlement payload the app already
 * resolved (currently exposed via a Jotai atom in the entitlements
 * provider — wired in `core/entitlements/entitlementsAtom.ts` if
 * present, otherwise falls back to the free-tier defaults so that the
 * UI never crashes when entitlements have not yet loaded).
 */

import { useMemo } from 'react';
import {
    DEAD_DROP_ENTITLEMENT_KEYS,
    DEAD_DROP_QUOTAS,
    buildFullyUnlockedEntitlementPayload,
    type DeadDropQuotas,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '@blackout/sdk';
import { betaUnlockAllEnabled } from '../../core/features/betaUnlock';

export type DeadDropQuotaSnapshot = {
    tier: EntitlementTier;
    quotas: DeadDropQuotas;
    enabled: boolean;
    canUseBucketPadding: boolean;
    canUseCoverSender: boolean;
    canUseQuorum: boolean;
    canUseScheduledFlush: boolean;
    canUseMultiRecipient: boolean;
    canPostMutualAid: boolean;
};

const FREE_FALLBACK: EntitlementAccessPayload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {
        'features.deaddrop.enabled': true,
    },
    orgTier: 'free',
    planState: { tier: 'free', status: 'inactive', isPaid: false },
};

/**
 * The blackout client does not yet expose a stable entitlements atom in
 * `core/`; until it does, this hook accepts an optional payload prop so
 * callers can pipe in whatever they have. Once a global atom lands, the
 * default value below should switch to reading from it.
 */
export const useDeadDropQuota = (
    payload: EntitlementAccessPayload = betaUnlockAllEnabled()
        ? buildFullyUnlockedEntitlementPayload()
        : FREE_FALLBACK
): DeadDropQuotaSnapshot =>
    useMemo(() => {
        const tier = payload.planState?.tier ?? payload.orgTier ?? 'free';
        const quotas = DEAD_DROP_QUOTAS[tier];
        const probe = (key: string) =>
            resolveSdkEntitlement({
                payload,
                key: key as `features.${string}`,
            }).enabled;
        return {
            tier,
            quotas,
            enabled: probe(DEAD_DROP_ENTITLEMENT_KEYS.enabled),
            canUseBucketPadding: probe(DEAD_DROP_ENTITLEMENT_KEYS.paddingBucket),
            canUseCoverSender: probe(DEAD_DROP_ENTITLEMENT_KEYS.coverSender),
            canUseQuorum: probe(DEAD_DROP_ENTITLEMENT_KEYS.quorumOpen),
            canUseScheduledFlush: probe(DEAD_DROP_ENTITLEMENT_KEYS.scheduledFlush),
            canUseMultiRecipient: probe(DEAD_DROP_ENTITLEMENT_KEYS.multiRecipient),
            canPostMutualAid: probe(DEAD_DROP_ENTITLEMENT_KEYS.mutualAidPost),
        };
    }, [payload]);
