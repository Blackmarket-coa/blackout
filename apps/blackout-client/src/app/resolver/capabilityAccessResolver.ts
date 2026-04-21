import {
    resolveSdkEntitlement,
    resolveSdkEntitlementMap,
    type EntitlementAccessPayload,
    type EntitlementKey,
    type EntitlementMap,
    type EntitlementTier,
    type ResolvedEntitlement,
} from '@blackout/sdk';

export type FeaturePresetKey = 'starter' | 'governance' | 'sovereignty';

export type CapabilityResolverOptions = {
    deploymentPreset?: FeaturePresetKey;
    orgTier?: EntitlementTier;
    presetOverride?: EntitlementMap;
    orgTierOverride?: EntitlementMap;
    userOverride?: EntitlementMap;
};

export const PRESET_ENTITLEMENTS: Record<FeaturePresetKey, EntitlementMap> = {
    starter: {
        'features.settings.appearance': false,
        'features.settings.account': false,
        'features.nav.roomInvites': false,
        'features.nav.search': false,
        'features.timeline.threads': false,
        'features.bmc.roles': false,
        'features.call.elementCall': false,
        'features.bmc.forum': false,
    },
    governance: {
        'features.settings.appearance': true,
        'features.settings.account': true,
        'features.nav.roomInvites': false,
        'features.nav.search': false,
        'features.timeline.threads': false,
        'features.bmc.roles': false,
        'features.call.elementCall': false,
        'features.bmc.forum': false,
    },
    sovereignty: {
        'features.settings.appearance': true,
        'features.settings.account': true,
        'features.nav.roomInvites': true,
        'features.nav.search': true,
        'features.timeline.threads': true,
        'features.bmc.roles': true,
        'features.call.elementCall': true,
        'features.bmc.forum': true,
    },
};

export const ORG_TIER_ENTITLEMENTS: Record<EntitlementTier, EntitlementMap> = {
    free: PRESET_ENTITLEMENTS.starter,
    pro: PRESET_ENTITLEMENTS.governance,
    team: {
        ...PRESET_ENTITLEMENTS.governance,
        'features.nav.search': true,
        'features.timeline.threads': true,
    },
    enterprise: PRESET_ENTITLEMENTS.sovereignty,
};

export const buildEntitlementAccessPayload = (
    options: CapabilityResolverOptions = {}
): EntitlementAccessPayload => {
    const deploymentPreset = options.deploymentPreset ?? 'sovereignty';

    return {
        deploymentPreset,
        deploymentPresetEntitlements: {
            ...PRESET_ENTITLEMENTS[deploymentPreset],
            ...(options.presetOverride ?? {}),
        },
        orgTier: options.orgTier,
        orgTierEntitlements: options.orgTier
            ? {
                  ...ORG_TIER_ENTITLEMENTS[options.orgTier],
                  ...(options.orgTierOverride ?? {}),
              }
            : options.orgTierOverride,
        userOverrideEntitlements: options.userOverride,
    };
};

export const resolveCapabilityAccess = (
    key: EntitlementKey,
    payload: EntitlementAccessPayload
): ResolvedEntitlement => resolveSdkEntitlement({ key, payload });

export const resolveCapabilityAccessMap = (
    keys: EntitlementKey[],
    payload: EntitlementAccessPayload
): EntitlementMap => resolveSdkEntitlementMap(keys, payload);
