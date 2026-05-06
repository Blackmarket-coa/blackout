import type {
    EntitlementKind,
    MarketplaceCategory,
    MarketplaceProviderId,
} from './provider';

export type CreatorListingStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';

export type CreatorArtifactKind = 'theme' | 'manifest_plugin' | 'code_plugin' | 'asset_bundle';

export interface CreatorListingDraft {
    artifactKind: CreatorArtifactKind;
    category: MarketplaceCategory;
    entitlementKind: EntitlementKind;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    tags?: string[];
    mediaUrls?: string[];
    /**
     * Inline artifact payload. The shape depends on `artifactKind`:
     * - theme: a serialized BlackoutCustomizationBundle JSON string
     * - manifest_plugin: a JSON-stringified FeatureCustomizationManifest
     * - code_plugin: { manifest, bundleBase64, sha256 }
     * - asset_bundle: { files: [{ name, mime, base64 }] }
     */
    artifactPayload: unknown;
    /**
     * Optional pointer to an already-uploaded artifact (FBM upload id), preferred
     * over inline payload when present.
     */
    artifactUploadId?: string;
}

export interface CreatorListing {
    id: string;
    providerId: MarketplaceProviderId;
    providerListingId: string | null;
    sellerUserId: string;
    artifactKind: CreatorArtifactKind;
    category: MarketplaceCategory;
    entitlementKind: EntitlementKind;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    status: CreatorListingStatus;
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    publicSlug: string | null;
}

export interface CreatorOnboardingResult {
    onboardingUrl: string;
    expiresAt: string;
}

export interface CreatorPayoutAccount {
    providerId: MarketplaceProviderId;
    sellerUserId: string;
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
    requirements: string[];
}

const artifactKinds: CreatorArtifactKind[] = [
    'theme',
    'manifest_plugin',
    'code_plugin',
    'asset_bundle',
];

const listingStatuses: CreatorListingStatus[] = [
    'draft',
    'pending_review',
    'published',
    'rejected',
    'archived',
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string): string {
    const raw = obj[key];
    if (typeof raw !== 'string' || raw.length === 0) {
        throw new Error(`${key} must be a non-empty string`);
    }
    return raw;
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], key: string): T {
    if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
        throw new Error(`${key} must be one of ${allowed.join(', ')}`);
    }
    return raw as T;
}

const categories: MarketplaceCategory[] = [
    'emoji-sticker',
    'meme-asset',
    'stego-software',
    'plugin-curated',
    'subscription',
];

const entitlementKinds: EntitlementKind[] = [
    'emoji_pack',
    'asset_bundle',
    'software_license',
    'plugin_flag',
    'subscription_tier',
    'post_unlock',
    'event_ticket',
    'role_grant',
    'channel_access',
];

export function parseCreatorListingDraft(input: unknown): CreatorListingDraft {
    if (!isRecord(input)) throw new Error('draft must be an object');
    const artifactKind = oneOf(input.artifactKind, artifactKinds, 'artifactKind');
    const category = oneOf(input.category, categories, 'category');
    const entitlementKind = oneOf(input.entitlementKind, entitlementKinds, 'entitlementKind');
    const priceRaw = input.priceCents;
    if (typeof priceRaw !== 'number' || !Number.isFinite(priceRaw) || priceRaw < 0) {
        throw new Error('priceCents must be a non-negative number');
    }
    if (input.artifactPayload === undefined && !input.artifactUploadId) {
        throw new Error('artifactPayload or artifactUploadId is required');
    }
    return {
        artifactKind,
        category,
        entitlementKind,
        title: requireString(input, 'title'),
        description: requireString(input, 'description'),
        priceCents: priceRaw,
        currency: requireString(input, 'currency'),
        tags: Array.isArray(input.tags)
            ? input.tags.filter((t): t is string => typeof t === 'string')
            : undefined,
        mediaUrls: Array.isArray(input.mediaUrls)
            ? input.mediaUrls.filter((t): t is string => typeof t === 'string')
            : undefined,
        artifactPayload: input.artifactPayload,
        artifactUploadId:
            typeof input.artifactUploadId === 'string' ? input.artifactUploadId : undefined,
    };
}

export { artifactKinds, listingStatuses };
