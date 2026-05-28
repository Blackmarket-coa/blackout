import type {
    EntitlementKind,
    MarketplaceCategory,
    MarketplaceProviderId,
} from './provider';
import { isPluginDomain, type PluginDomain } from './domain';
import { isValidFeeBps } from './fees';

export type CreatorListingStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';

export type CreatorArtifactKind =
    | 'theme'
    | 'manifest_plugin'
    | 'code_plugin'
    | 'asset_bundle'
    | 'coalition_kit'
    | 'profile_cosmetic'
    | 'sound_pack'
    | 'community_template'
    | 'stream_asset'
    | 'vault_item'
    | 'ai_persona'
    | 'automation_recipe';

export interface CreatorListingDraft {
    artifactKind: CreatorArtifactKind;
    category: MarketplaceCategory;
    /** Ecosystem-domain axis (orthogonal to `category`); optional for legacy listings. */
    domain?: PluginDomain;
    entitlementKind: EntitlementKind;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    /**
     * Optional per-listing platform commission, in basis points (0..10000),
     * overriding the provider's default rate (Phase 8). Only honored when the
     * `creatorFeeOverride` flag is enabled server-side.
     */
    feeBpsOverride?: number;
    tags?: string[];
    mediaUrls?: string[];
    /**
     * Inline artifact payload. The shape depends on `artifactKind`:
     * - theme: a serialized BlackoutCustomizationBundle JSON string
     * - manifest_plugin: a JSON-stringified FeatureCustomizationManifest
     * - code_plugin: { manifest, bundleBase64, sha256 }
     * - asset_bundle: { files: [{ name, mime, base64 }] }
     * - profile_cosmetic: { cosmeticType: 'avatar_decoration'|'nameplate'|'profile_effect'|'badge', ... }
     * - sound_pack: { soundKind: 'soundboard'|'notification'|'voice_filter', ... }
     * - community_template: { template: {...} }
     * - stream_asset: { assetType: 'overlay'|'alert'|'channel_point_kit'|'badge_set', ... }
     * - vault_item: { vaultKind: 'slot'|'template', ... }
     * - ai_persona: { persona: {...} }
     * - automation_recipe: { triggers: [...], actions: [...] }
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
    feeBpsOverride?: number;
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
    'coalition_kit',
    'profile_cosmetic',
    'sound_pack',
    'community_template',
    'stream_asset',
    'vault_item',
    'ai_persona',
    'automation_recipe',
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
    'profile-cosmetic',
    'audio-pack',
    'community-template',
    'creator-asset',
    'security-tool',
    'ai-automation',
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
    'profile_cosmetic',
    'sound_pack',
    'community_template',
    'stream_asset',
    'vault_item',
];

/**
 * Light, discriminant-only validation for the newer artifact kinds. Throws only
 * when a payload is present, is an object, declares its discriminant key, and
 * that key holds an invalid value — so placeholder/upload-id flows stay
 * permissive while clearly-malformed payloads are rejected early.
 */
const cosmeticTypes = ['avatar_decoration', 'nameplate', 'profile_effect', 'badge'] as const;
const soundKinds = ['soundboard', 'notification', 'voice_filter'] as const;
const streamAssetTypes = ['overlay', 'alert', 'channel_point_kit', 'badge_set'] as const;
const vaultKinds = ['slot', 'template'] as const;

function discriminant<T extends string>(
    payload: Record<string, unknown>,
    key: string,
    allowed: readonly T[]
): void {
    const raw = payload[key];
    if (raw === undefined) return;
    if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
        throw new Error(`${key} must be one of ${allowed.join(', ')}`);
    }
}

export function validateArtifactPayload(kind: CreatorArtifactKind, payload: unknown): void {
    if (!isRecord(payload)) return;
    switch (kind) {
        case 'profile_cosmetic':
            discriminant(payload, 'cosmeticType', cosmeticTypes);
            break;
        case 'sound_pack':
            discriminant(payload, 'soundKind', soundKinds);
            break;
        case 'stream_asset':
            discriminant(payload, 'assetType', streamAssetTypes);
            break;
        case 'vault_item':
            discriminant(payload, 'vaultKind', vaultKinds);
            break;
        default:
            break;
    }
}

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
    let feeBpsOverride: number | undefined;
    if (input.feeBpsOverride !== undefined) {
        if (typeof input.feeBpsOverride !== 'number' || !isValidFeeBps(input.feeBpsOverride)) {
            throw new Error('feeBpsOverride must be an integer in 0..10000');
        }
        feeBpsOverride = input.feeBpsOverride;
    }
    validateArtifactPayload(artifactKind, input.artifactPayload);
    return {
        artifactKind,
        category,
        domain: isPluginDomain(input.domain) ? input.domain : undefined,
        entitlementKind,
        title: requireString(input, 'title'),
        description: requireString(input, 'description'),
        priceCents: priceRaw,
        currency: requireString(input, 'currency'),
        feeBpsOverride,
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
