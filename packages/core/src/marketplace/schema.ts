import type {
    EntitlementKind,
    EntitlementStatus,
    LifecycleEventType,
    MarketplaceCategory,
    MarketplaceProviderId,
    NormalizedEntitlement,
    NormalizedLifecycleEvent,
    NormalizedListing,
} from './provider';
import { marketplaceProviderIds } from './provider';
import { isPluginDomain } from './domain';

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

const entitlementStatuses: EntitlementStatus[] = [
    'granted',
    'pending',
    'refunded',
    'chargebacked',
    'revoked',
    'expired',
];

const marketplaceCategories: MarketplaceCategory[] = [
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

const lifecycleEventTypes: LifecycleEventType[] = [
    'purchase.succeeded',
    'purchase.failed',
    'purchase.refunded',
    'purchase.chargebacked',
    'creator.payout.completed',
    'listing.signed_bundle.published',
    'creator.account.suspended',
    'referral.attributed',
    'ambassador.commission_paid',
    'quest.reward_settled',
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string): string {
    const raw = obj[key];
    if (typeof raw !== 'string') throw new Error(`${key} must be a string`);
    return raw;
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
    const raw = obj[key];
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== 'string') throw new Error(`${key} must be a string if present`);
    return raw;
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], key: string): T {
    if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
        throw new Error(`${key} must be one of ${allowed.join(', ')}`);
    }
    return raw as T;
}

export function parseNormalizedListing(input: unknown): NormalizedListing {
    if (!isRecord(input)) throw new Error('listing must be an object');
    const providerId = oneOf(input.providerId, marketplaceProviderIds, 'providerId');
    const category = oneOf(input.category, marketplaceCategories, 'category');
    const entitlementKind = oneOf(input.entitlementKind, entitlementKinds, 'entitlementKind');
    const media = Array.isArray(input.mediaUrls)
        ? input.mediaUrls.filter((v): v is string => typeof v === 'string')
        : [];
    const tags = Array.isArray(input.tags)
        ? input.tags.filter((v): v is string => typeof v === 'string')
        : undefined;
    const availableSkus = Array.isArray(input.availableSkus)
        ? input.availableSkus.filter((v): v is string => typeof v === 'string')
        : undefined;

    const priceRaw = input.priceCents;
    if (typeof priceRaw !== 'number' || !Number.isFinite(priceRaw) || priceRaw < 0) {
        throw new Error('priceCents must be a non-negative number');
    }

    return {
        providerId,
        providerListingId: requireString(input, 'providerListingId'),
        category,
        domain: isPluginDomain(input.domain) ? input.domain : undefined,
        title: requireString(input, 'title'),
        description: requireString(input, 'description'),
        priceCents: priceRaw,
        currency: requireString(input, 'currency'),
        sellerId: typeof input.sellerId === 'string' ? input.sellerId : null,
        sellerDisplayName: optionalString(input, 'sellerDisplayName'),
        mediaUrls: media,
        entitlementKind,
        tags,
        availableSkus,
    };
}

export function parseNormalizedEntitlement(input: unknown): NormalizedEntitlement {
    if (!isRecord(input)) throw new Error('entitlement must be an object');
    return {
        id: requireString(input, 'id'),
        userId: requireString(input, 'userId'),
        providerId: oneOf(input.providerId, marketplaceProviderIds, 'providerId'),
        providerListingId: requireString(input, 'providerListingId'),
        sku: typeof input.sku === 'string' ? input.sku : null,
        kind: oneOf(input.kind, entitlementKinds, 'kind'),
        status: oneOf(input.status, entitlementStatuses, 'status'),
        grantedAt: requireString(input, 'grantedAt'),
        expiresAt: typeof input.expiresAt === 'string' ? input.expiresAt : null,
        sourceEventId: requireString(input, 'sourceEventId'),
        metadata: isRecord(input.metadata) ? input.metadata : {},
    };
}

export function parseNormalizedLifecycleEvent(input: unknown): NormalizedLifecycleEvent {
    if (!isRecord(input)) throw new Error('event must be an object');
    return {
        providerId: oneOf(input.providerId, marketplaceProviderIds, 'providerId'),
        eventId: requireString(input, 'eventId'),
        type: oneOf(input.type, lifecycleEventTypes, 'type'),
        userId: requireString(input, 'userId'),
        providerListingId: requireString(input, 'providerListingId'),
        sku: typeof input.sku === 'string' ? input.sku : null,
        kind: oneOf(input.kind, entitlementKinds, 'kind'),
        occurredAt: requireString(input, 'occurredAt'),
        metadata: isRecord(input.metadata) ? input.metadata : {},
    };
}

export {
    entitlementKinds,
    entitlementStatuses,
    marketplaceCategories,
    lifecycleEventTypes,
};

export type MarketplaceProviderIdType = MarketplaceProviderId;
