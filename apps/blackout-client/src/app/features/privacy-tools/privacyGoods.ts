/**
 * Model for the purchasable "Privacy Tools — Advanced" entitlement
 * (`privacy_tool` artifact kind). A granted entitlement unlocks the advanced
 * tier of the privacy features (EXIF stripping + link sanitization). Decoded
 * onto the installed-plugin record and read by `privacyToolsEntitledAtom` to
 * gate the advanced settings. Dependency-free for the installer + atoms.
 */

export type PrivacyTierLevel = 'advanced';

/**
 * Composable feature flags carried on a granted `privacy_tool` entitlement. One
 * entitlement can unlock multiple features (used by the Sovereignty Bundle to
 * unlock all the privacy "Pro" tiers in one purchase).
 */
export type PrivacyFeature =
    | 'exif_strip'
    | 'link_sanitize'
    | 'perturbation'
    | 'burner_pro'
    | 'ephemeral_pro'
    | 'bulk_deletion'
    | 'stego_advanced';

export interface OwnedPrivacyTier {
    tier: PrivacyTierLevel;
    features: PrivacyFeature[];
}

const PRIVACY_FEATURES: readonly PrivacyFeature[] = [
    'exif_strip',
    'link_sanitize',
    'perturbation',
    'burner_pro',
    'ephemeral_pro',
    'bulk_deletion',
    'stego_advanced',
];

/** Parse + sanitize an untrusted privacy_tool payload. */
export function parseOwnedPrivacyTier(payload: unknown): OwnedPrivacyTier | null {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as Record<string, unknown>;
    if (data.tier !== 'advanced') return null;

    const features = Array.isArray(data.features)
        ? Array.from(
              new Set(
                  data.features.filter((f): f is PrivacyFeature =>
                      PRIVACY_FEATURES.includes(f as PrivacyFeature)
                  )
              )
          )
        : [];

    return { tier: 'advanced', features };
}
