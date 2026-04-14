export type EntitlementKey = `features.${string}`;

export type EntitlementTier = 'free' | 'pro' | 'team' | 'enterprise';

export type EntitlementMap = Partial<Record<EntitlementKey, boolean>>;

export type EntitlementResolutionSource =
    | 'deployment_preset'
    | 'org_tier'
    | 'user_override'
    | 'fallback';

export type ResolvedEntitlement = {
    key: EntitlementKey;
    enabled: boolean;
    source: EntitlementResolutionSource;
};

export type EntitlementAccessPayload = {
    deploymentPreset: string;
    deploymentPresetEntitlements: EntitlementMap;
    orgTier?: EntitlementTier;
    orgTierEntitlements?: EntitlementMap;
    userOverrideEntitlements?: EntitlementMap;
};

export type EntitlementResolverInput = {
    key: EntitlementKey;
    payload: EntitlementAccessPayload;
};
