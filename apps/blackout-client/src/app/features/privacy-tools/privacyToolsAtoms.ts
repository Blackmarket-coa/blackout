import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';

/**
 * Persisted client settings for the Privacy Tools feature. EXIF stripping and
 * link sanitization are now native (always on, no toggle) — they're privacy
 * hygiene, not preferences. Only the "advanced" tier (perturbation + advanced
 * options) is settable here, and it's gated behind a purchased `privacy_tool`
 * entitlement (see `privacyToolsEntitledAtom`).
 */
export interface PrivacyToolsAdvancedOptions {
    /** Warn (instead of silently passing through) when a file type can't be stripped. */
    nonStrippableWarning: boolean;
}

export interface PrivacyToolsSettingsState {
    /** Anti-facial-recognition perturbation on avatar/image uploads (advanced). */
    avatarPerturbationEnabled: boolean;
    advancedOptions: PrivacyToolsAdvancedOptions;
}

export const privacyToolsSettingsAtom = atomWithStorage<PrivacyToolsSettingsState>(
    'blackout.settings.privacy-tools.v1',
    {
        avatarPerturbationEnabled: false,
        advancedOptions: {
            nonStrippableWarning: false,
        },
    }
);

/**
 * Whether the advanced privacy tier is unlocked, derived from a granted
 * `privacy_tool` entitlement on an installed-plugin record. Read-only — the
 * source of truth is the entitlement, never a local toggle.
 */
export const privacyToolsEntitledAtom = atom((get) =>
    get(installedPluginsAtom).some((record) => record.privacyTier?.tier === 'advanced')
);

/**
 * Composable per-feature gate. Multiple SKUs can grant overlapping features —
 * e.g. the Sovereignty Bundle grants all of them in one purchase. Each derived
 * atom checks whether ANY granted `privacy_tool` entitlement carries the given
 * feature in its `features` array.
 */
const hasFeatureAtom = (feature: import('./privacyGoods').PrivacyFeature) =>
    atom((get) =>
        get(installedPluginsAtom).some((record) => record.privacyTier?.features?.includes(feature))
    );

export const perturbationEntitledAtom = hasFeatureAtom('perturbation');
export const burnerProEntitledAtom = hasFeatureAtom('burner_pro');
export const ephemeralProEntitledAtom = hasFeatureAtom('ephemeral_pro');
export const bulkDeletionEntitledAtom = hasFeatureAtom('bulk_deletion');
export const stegoAdvancedEntitledAtom = hasFeatureAtom('stego_advanced');
