import type { FeatureSettingsItem } from '../../core/features/types';
import { PrivacyToolsSettings } from './PrivacyToolsSettings';
import { ShieldVisibilitySettings } from './ShieldVisibilitySettings';

/**
 * Settings sections for the OSS-manifest privacy groups G1 (Shield /
 * Visibility) and G2 (Privacy Hardening). Both compose against the existing
 * `PrivacyToolsSettings` surface; the gating difference lives in the
 * per-customization `capabilityGate` in `manifest.ts`.
 */
export const shieldVisibilitySettings: FeatureSettingsItem[] = [
    {
        section: 'Privacy / Shield',
        component: ShieldVisibilitySettings,
    },
];

export const privacyHardeningSettings: FeatureSettingsItem[] = [
    {
        section: 'Privacy / Hardening',
        component: PrivacyToolsSettings,
    },
];
