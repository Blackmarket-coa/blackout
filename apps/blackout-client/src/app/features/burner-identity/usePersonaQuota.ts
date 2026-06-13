/**
 * Hook surfacing the caller's effective persona tier, roster quota, and
 * rotation/compartment entitlements. Mirrors `features/deaddrop/useDeadDropQuota.ts`.
 *
 * Until a global entitlements atom lands in `core/`, the hook accepts an
 * optional payload prop and otherwise falls back to free-tier defaults so the
 * UI never crashes before entitlements resolve.
 */

import { useMemo } from 'react';
import {
    PERSONA_ENTITLEMENT_KEYS,
    PERSONA_QUOTAS,
    buildFullyUnlockedEntitlementPayload,
    type PersonaQuotas,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '@blackout/sdk';
import { betaUnlockAllEnabled } from '../../core/features/betaUnlock';

export type PersonaQuotaSnapshot = {
    tier: EntitlementTier;
    quotas: PersonaQuotas;
    enabled: boolean;
    canRotate: boolean;
    canUseCompartments: boolean;
    /** Active personas remaining before the roster cap; `Infinity` = unlimited. */
    remaining: (activePersonaCount: number) => number;
};

const FREE_FALLBACK: EntitlementAccessPayload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {
        'features.persona.enabled': true,
    },
    orgTier: 'free',
    planState: { tier: 'free', status: 'inactive', isPaid: false },
};

export const usePersonaQuota = (
    payload: EntitlementAccessPayload = betaUnlockAllEnabled()
        ? buildFullyUnlockedEntitlementPayload()
        : FREE_FALLBACK
): PersonaQuotaSnapshot =>
    useMemo(() => {
        const tier = payload.planState?.tier ?? payload.orgTier ?? 'free';
        const quotas = PERSONA_QUOTAS[tier];
        const probe = (key: string) =>
            resolveSdkEntitlement({
                payload,
                key: key as `features.${string}`,
            }).enabled;
        return {
            tier,
            quotas,
            enabled: probe(PERSONA_ENTITLEMENT_KEYS.enabled),
            canRotate: probe(PERSONA_ENTITLEMENT_KEYS.rotation),
            canUseCompartments: probe(PERSONA_ENTITLEMENT_KEYS.compartments),
            remaining: (activePersonaCount: number) =>
                quotas.maxPersonas === -1
                    ? Number.POSITIVE_INFINITY
                    : Math.max(0, quotas.maxPersonas - activePersonaCount),
        };
    }, [payload]);
