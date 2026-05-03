export type EntitlementKey = `features.${string}`;

export type EntitlementTier = 'free' | 'pro' | 'team' | 'enterprise';

export type EntitlementFamily = 'stego' | 'governance' | 'deaddrop';

export type PlanStateStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'inactive';

export type PlanState = {
    tier: EntitlementTier;
    status: PlanStateStatus;
    isPaid: boolean;
    trialEndsAt?: string;
    currentPeriodEndsAt?: string;
};

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
    planState?: PlanState;
};

export type EntitlementReadResponse = {
    family: EntitlementFamily | 'all';
    payload: EntitlementAccessPayload;
};

export type EntitlementResolverInput = {
    key: EntitlementKey;
    payload: EntitlementAccessPayload;
};
