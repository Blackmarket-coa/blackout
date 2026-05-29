import { listEntitlementsForUser } from './marketplaceEntitlements';
import { betaUnlockAllEnabled } from './betaUnlock';

// Mirrors the client-side `PrivacyFeature` union in
// `apps/blackout-client/src/app/features/privacy-tools/privacyGoods.ts`.
// Kept as a local string set to avoid pulling the client package into the API.
export const PRIVACY_FEATURES = [
    'exif_strip',
    'link_sanitize',
    'perturbation',
    'burner_pro',
    'ephemeral_pro',
    'bulk_deletion',
    'stego_advanced',
] as const;
export type PrivacyFeature = (typeof PRIVACY_FEATURES)[number];

const VALID_FEATURES = new Set<string>(PRIVACY_FEATURES);
const ACTIVE_STATUSES = new Set(['granted', 'pending']);

/**
 * Returns the union of privacy features granted to the user via any active
 * `privacy_tool` entitlement. The features array travels in the entitlement
 * `metadata.features` field, populated by the provider webhook for that SKU
 * (see `freeblackmarketStub.materializeWebhook`).
 *
 * Beta override grants every feature so unentitled developers can exercise
 * gated code paths locally.
 */
export function getActivePrivacyFeaturesForUser(userId: string): Set<PrivacyFeature> {
    if (betaUnlockAllEnabled()) return new Set<PrivacyFeature>(PRIVACY_FEATURES);

    const features = new Set<PrivacyFeature>();
    for (const ent of listEntitlementsForUser(userId)) {
        if (ent.kind !== 'privacy_tool') continue;
        if (!ACTIVE_STATUSES.has(ent.status)) continue;
        const raw = ent.metadata['features'];
        if (!Array.isArray(raw)) continue;
        for (const f of raw) {
            if (typeof f === 'string' && VALID_FEATURES.has(f)) {
                features.add(f as PrivacyFeature);
            }
        }
    }
    return features;
}

export function userHasPrivacyFeature(userId: string, feature: PrivacyFeature): boolean {
    return getActivePrivacyFeaturesForUser(userId).has(feature);
}
