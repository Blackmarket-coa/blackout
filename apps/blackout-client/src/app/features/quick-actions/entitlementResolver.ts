import {
    resolveSdkEntitlement,
    type EntitlementKey,
    type EntitlementMap,
    type EntitlementResolverInput,
    type ResolvedEntitlement,
} from '@blackout/sdk';

export type WorkspaceTier = 'free' | 'pro' | 'team' | 'enterprise';

export type QuickActionEntitlementLayers = Omit<EntitlementResolverInput, 'key'>;

export const resolveQuickActionEntitlement = (
    key: EntitlementKey,
    layers: QuickActionEntitlementLayers
): ResolvedEntitlement => resolveSdkEntitlement({ key, ...layers });

export const resolveQuickActionEntitlementMap = (
    keys: EntitlementKey[],
    layers: QuickActionEntitlementLayers
): EntitlementMap =>
    Object.fromEntries(
        keys.map((key) => [key, resolveQuickActionEntitlement(key, layers).enabled])
    );
