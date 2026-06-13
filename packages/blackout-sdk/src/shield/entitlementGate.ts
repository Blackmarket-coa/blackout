/**
 * Shield / visibility entitlement check (OSS-manifest group G1).
 *
 * Detection is a free baseline, so this gate only confirms the capability is
 * present (it can be absent when an operator disables the baseline in a preset
 * or when the flag is off). Mirrors the other SDK entitlement gates.
 */

import {
    SHIELD_ENTITLEMENT_KEYS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '../entitlements';

export type ShieldGateResult =
    | { ok: true; tier: EntitlementTier }
    | { ok: false; tier: EntitlementTier; reason: 'feature_disabled'; message: string };

const tierFromPayload = (payload: EntitlementAccessPayload): EntitlementTier =>
    payload.planState?.tier ?? payload.orgTier ?? 'free';

export const checkShieldEntitlements = (
    payload: EntitlementAccessPayload
): ShieldGateResult => {
    const tier = tierFromPayload(payload);
    const enabled = resolveSdkEntitlement({
        payload,
        key: SHIELD_ENTITLEMENT_KEYS.enabled,
    }).enabled;

    if (!enabled) {
        return {
            ok: false,
            tier,
            reason: 'feature_disabled',
            message: 'The shield / visibility baseline is not available.',
        };
    }
    return { ok: true, tier };
};
