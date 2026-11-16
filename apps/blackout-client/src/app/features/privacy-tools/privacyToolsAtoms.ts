import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { installedPluginsAtom } from '../monetization/install/installedPluginsAtom';

/**
 * Persisted client settings for the Privacy Tools feature. Metadata stripping
 * and link cleaning have no setting: they run where the panel says they do
 * (utils/stripImageMetadata.ts, utils/sanitizeUrl.ts), which is not
 * everywhere. Only the "advanced" tier (the avatar pattern) is settable here,
 * and it's gated behind a purchased `privacy_tool` entitlement (see
 * `privacyToolsEntitledAtom`).
 *
 * Until 2026-11-16 the advanced tier also offered "Warn when a file type
 * can't be stripped", which nothing read. It is gone, and the message box
 * now says, for everyone, which attachments keep their metadata
 * (docs/security/trust-claims-2026-11-16.md, T12). A value stored for it by
 * an older version is ignored.
 */
export interface PrivacyToolsSettingsState {
    /**
     * A faint pattern on avatar uploads (advanced). It does not stop current
     * face recognition; see utils/perturbImage.ts.
     */
    avatarPerturbationEnabled: boolean;
}

export const privacyToolsSettingsAtom = atomWithStorage<PrivacyToolsSettingsState>(
    'blackout.settings.privacy-tools.v1',
    {
        avatarPerturbationEnabled: false,
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
