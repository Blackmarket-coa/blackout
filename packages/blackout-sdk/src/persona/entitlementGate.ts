/**
 * Tier-aware persona-engine entitlement checks.
 *
 * Mirrors `deaddrop/entitlementGate.ts`: the SDK refuses an action that
 * would violate the caller's entitlements *before* it reaches the server,
 * so the UI can surface a tier-upgrade prompt instead of a generic 403.
 *
 * The numeric roster cap is the canonical `PERSONA_QUOTAS[tier].maxPersonas`
 * (`-1` ⇒ unlimited); rotation and compartments are boolean entitlements.
 */

import {
    PERSONA_ENTITLEMENT_KEYS,
    PERSONA_QUOTAS,
    type PersonaQuotas,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '../entitlements';

export type PersonaGateInput = {
    /** Active personas the caller already holds (before this create). */
    activePersonaCount: number;
    requestRotation: boolean;
    requestCompartments: boolean;
};

export type PersonaGateReason =
    | 'feature_disabled'
    | 'roster_full'
    | 'rotation_not_entitled'
    | 'compartments_not_entitled';

export type PersonaGateResult =
    | { ok: true; tier: EntitlementTier; quotas: PersonaQuotas }
    | {
          ok: false;
          tier: EntitlementTier;
          reason: PersonaGateReason;
          message: string;
          /** Suggested upgrade tier that would unblock the action. */
          suggestedTier?: EntitlementTier;
      };

const TIER_ORDER: readonly EntitlementTier[] = ['free', 'pro', 'team', 'enterprise'];

const tierFromPayload = (payload: EntitlementAccessPayload): EntitlementTier =>
    payload.planState?.tier ?? payload.orgTier ?? 'free';

/** First higher tier whose roster cap exceeds the current one (or is unlimited). */
const suggestRosterTier = (currentTier: EntitlementTier): EntitlementTier | undefined => {
    const currentMax = PERSONA_QUOTAS[currentTier].maxPersonas;
    for (let i = TIER_ORDER.indexOf(currentTier) + 1; i < TIER_ORDER.length; i += 1) {
        const max = PERSONA_QUOTAS[TIER_ORDER[i]].maxPersonas;
        if (max === -1 || max > currentMax) return TIER_ORDER[i];
    }
    return undefined;
};

/** First higher tier that grants the given boolean entitlement. */
const suggestEntitlementTier = (
    payload: EntitlementAccessPayload,
    key: string,
    currentTier: EntitlementTier
): EntitlementTier | undefined => {
    for (let i = TIER_ORDER.indexOf(currentTier) + 1; i < TIER_ORDER.length; i += 1) {
        const probe = resolveSdkEntitlement({
            payload: { ...payload, planState: { ...payload.planState, tier: TIER_ORDER[i], status: 'active', isPaid: true } },
            key: key as `features.${string}`,
        });
        if (probe.enabled) return TIER_ORDER[i];
    }
    return undefined;
};

export const checkPersonaEntitlements = (
    payload: EntitlementAccessPayload,
    input: PersonaGateInput
): PersonaGateResult => {
    const tier = tierFromPayload(payload);
    const quotas = PERSONA_QUOTAS[tier];

    const enabled = resolveSdkEntitlement({
        payload,
        key: PERSONA_ENTITLEMENT_KEYS.enabled,
    }).enabled;
    if (!enabled) {
        return {
            ok: false,
            tier,
            reason: 'feature_disabled',
            message: 'The persona engine is not enabled for your account.',
            suggestedTier: suggestEntitlementTier(payload, PERSONA_ENTITLEMENT_KEYS.enabled, tier),
        };
    }

    if (quotas.maxPersonas !== -1 && input.activePersonaCount >= quotas.maxPersonas) {
        return {
            ok: false,
            tier,
            reason: 'roster_full',
            message: `Your ${tier} plan allows ${quotas.maxPersonas} active ${
                quotas.maxPersonas === 1 ? 'persona' : 'personas'
            }. Burn one or upgrade to add more.`,
            suggestedTier: suggestRosterTier(tier),
        };
    }

    if (input.requestRotation) {
        const ok = resolveSdkEntitlement({
            payload,
            key: PERSONA_ENTITLEMENT_KEYS.rotation,
        }).enabled;
        if (!ok) {
            return {
                ok: false,
                tier,
                reason: 'rotation_not_entitled',
                message: 'Alias rotation requires the Pro tier or higher.',
                suggestedTier: suggestEntitlementTier(payload, PERSONA_ENTITLEMENT_KEYS.rotation, tier) ?? 'pro',
            };
        }
    }

    if (input.requestCompartments) {
        const ok = resolveSdkEntitlement({
            payload,
            key: PERSONA_ENTITLEMENT_KEYS.compartments,
        }).enabled;
        if (!ok) {
            return {
                ok: false,
                tier,
                reason: 'compartments_not_entitled',
                message: 'Persona compartments require the Pro tier or higher.',
                suggestedTier: suggestEntitlementTier(payload, PERSONA_ENTITLEMENT_KEYS.compartments, tier) ?? 'pro',
            };
        }
    }

    return { ok: true, tier, quotas };
};

export const tierFromPersonaPayload = tierFromPayload;
