import {
    type EntitlementAccessPayload,
    type EntitlementKey,
    type EntitlementMap,
    type ResolvedEntitlement,
} from '@blackout/sdk';

import {
    resolveCapabilityAccess,
    resolveCapabilityAccessMap,
} from '../../resolver/capabilityAccessResolver';

export type QuickActionEntitlementLayers = EntitlementAccessPayload;

export const resolveQuickActionEntitlement = (
    key: EntitlementKey,
    payload: QuickActionEntitlementLayers
): ResolvedEntitlement => resolveCapabilityAccess(key, payload);

export const resolveQuickActionEntitlementMap = (
    keys: EntitlementKey[],
    payload: QuickActionEntitlementLayers
): EntitlementMap => resolveCapabilityAccessMap(keys, payload);
