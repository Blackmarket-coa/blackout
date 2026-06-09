import type { BlackoutFeature } from '../../core/features/types';
import {
    privacyHardeningSettings,
    shieldVisibilitySettings,
} from './settings';

/**
 * Privacy-tools feature module — anchors OSS-manifest groups G1 (Shield /
 * Visibility) and G2 (Privacy Hardening). See
 * `docs/oss_manifest_packaging.md` for the free/tiered/plugin classification.
 *
 * Two customizations:
 *   - `shield-visibility`  free baseline plugin; gated by `shield.scan.run`
 *                          behind the `shieldVisibility` flag.
 *   - `privacy-hardening`  `pro`-tier upgrade; gated by `hardening.tor.use`
 *                          behind the `privacyHardening` flag.
 *
 * Both ride behind their feature flags so the canonical shell stays
 * unchanged until operators opt in. Per-tier entitlement keys live in
 * `packages/blackout-protocol/src/hardening/entitlements.ts`.
 */
export const privacyToolsFeature: BlackoutFeature = {
    id: 'privacy-tools',
    name: 'Privacy Tools',
    customizations: [
        {
            id: 'shield-visibility',
            name: 'Shield · Visibility',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['shield.scan.run'],
                flags: ['shieldVisibility'],
            },
            settings: shieldVisibilitySettings,
        },
        {
            id: 'privacy-hardening',
            name: 'Privacy · Hardening',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['hardening.tor.use'],
                flags: ['privacyHardening'],
            },
            settings: privacyHardeningSettings,
        },
    ],
    capabilities: ['shield.scan.run', 'hardening.tor.use'],
};
