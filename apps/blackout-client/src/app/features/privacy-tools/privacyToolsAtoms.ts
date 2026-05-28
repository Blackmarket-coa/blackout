import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';

/**
 * Persisted client settings for the Privacy Tools feature. Both protections
 * default ON — they're privacy hygiene, not opt-in. The "advanced" options are
 * gated behind a purchased `privacy_tool` entitlement (see
 * `privacyToolsEntitledAtom`), not a stored flag, so they can't be toggled on
 * without the entitlement actually being granted.
 */
export interface PrivacyToolsAdvancedOptions {
    /** Warn (instead of silently passing through) when a file type can't be stripped. */
    nonStrippableWarning: boolean;
}

export interface PrivacyToolsSettingsState {
    exifStripEnabled: boolean;
    linkSanitizeEnabled: boolean;
    advancedOptions: PrivacyToolsAdvancedOptions;
}

export const privacyToolsSettingsAtom = atomWithStorage<PrivacyToolsSettingsState>(
    'blackout.settings.privacy-tools.v1',
    {
        exifStripEnabled: true,
        linkSanitizeEnabled: true,
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
