import type { EntitlementFamily } from '@blackout/protocol';

export function getEntitlementSnapshotPath(): '/v1/entitlements/me' {
    return '/v1/entitlements/me';
}

export function getEntitlementFamilyPath(family: EntitlementFamily): `/v1/entitlements/${EntitlementFamily}` {
    return `/v1/entitlements/${family}`;
}
