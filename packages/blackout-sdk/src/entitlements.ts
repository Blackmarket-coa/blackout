import type {
    EntitlementAccessPayload,
    EntitlementKey,
    EntitlementMap,
    EntitlementResolverInput,
    ResolvedEntitlement,
} from '@blackout/protocol';

export function resolveSdkEntitlement(input: EntitlementResolverInput): ResolvedEntitlement {
    const { key, payload } = input;
    const { deploymentPresetEntitlements, orgTierEntitlements, userOverrideEntitlements } = payload;

    if (Object.prototype.hasOwnProperty.call(userOverrideEntitlements ?? {}, key)) {
        return { key, enabled: Boolean(userOverrideEntitlements?.[key]), source: 'user_override' };
    }

    if (Object.prototype.hasOwnProperty.call(orgTierEntitlements ?? {}, key)) {
        return { key, enabled: Boolean(orgTierEntitlements?.[key]), source: 'org_tier' };
    }

    if (Object.prototype.hasOwnProperty.call(deploymentPresetEntitlements, key)) {
        return {
            key,
            enabled: Boolean(deploymentPresetEntitlements[key]),
            source: 'deployment_preset',
        };
    }

    return { key, enabled: false, source: 'fallback' };
}

export function resolveSdkEntitlementMap(
    keys: EntitlementKey[],
    payload: EntitlementAccessPayload
): EntitlementMap {
    return Object.fromEntries(
        keys.map((key) => [key, resolveSdkEntitlement({ key, payload }).enabled])
    );
}
