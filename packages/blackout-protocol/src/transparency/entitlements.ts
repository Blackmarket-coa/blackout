/**
 * Transparency entitlement keys (OSS-manifest group G9).
 *
 * Self-service transparency (the "what's stored about me" report) and the
 * warrant canary are free trust primitives. Org-scoped audit export is a
 * Governance/team-tier capability.
 */

import type { EntitlementKey, EntitlementTier } from '../entitlements/types';

export const TRANSPARENCY_ENTITLEMENT_KEYS = {
    enabled: 'features.transparency.enabled',
    selfReport: 'features.transparency.selfReport',
    auditExport: 'features.transparency.auditExport',
    warrantCanary: 'features.transparency.warrantCanary',
} as const satisfies Record<string, EntitlementKey>;

export type TransparencyEntitlementKey =
    (typeof TRANSPARENCY_ENTITLEMENT_KEYS)[keyof typeof TRANSPARENCY_ENTITLEMENT_KEYS];

/**
 * Per-tier defaults. Free already gets the self-report + warrant canary
 * (transparency-of-self is a baseline right); `team`+ adds org-scoped audit
 * export.
 */
export const TRANSPARENCY_TIER_ENTITLEMENTS: Record<
    EntitlementTier,
    Partial<Record<TransparencyEntitlementKey, boolean>>
> = {
    free: {
        'features.transparency.enabled': true,
        'features.transparency.selfReport': true,
        'features.transparency.warrantCanary': true,
    },
    pro: {
        'features.transparency.enabled': true,
        'features.transparency.selfReport': true,
        'features.transparency.warrantCanary': true,
    },
    team: {
        'features.transparency.enabled': true,
        'features.transparency.selfReport': true,
        'features.transparency.warrantCanary': true,
        'features.transparency.auditExport': true,
    },
    enterprise: {
        'features.transparency.enabled': true,
        'features.transparency.selfReport': true,
        'features.transparency.warrantCanary': true,
        'features.transparency.auditExport': true,
    },
};
