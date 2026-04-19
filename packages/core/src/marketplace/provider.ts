export const marketplaceProviderIds = [
    'freeblackmarket',
    'blamazon',
    'mayhem-marketplaze',
    'antin-amazon',
] as const;

export type MarketplaceProviderId = (typeof marketplaceProviderIds)[number];

export type MarketplaceAuthScheme = 'api-key' | 'oauth2' | 'hmac-shared-secret';

export type MarketplaceCapability =
    | 'catalog'
    | 'search'
    | 'checkout'
    | 'webhooks'
    | 'payouts'
    | 'creator-sso';

export type MarketplaceCategory =
    | 'emoji-sticker'
    | 'meme-asset'
    | 'stego-software'
    | 'plugin-curated'
    | 'subscription';

export type EntitlementKind =
    | 'emoji_pack'
    | 'asset_bundle'
    | 'software_license'
    | 'plugin_flag'
    | 'subscription_tier';

export type EntitlementStatus =
    | 'granted'
    | 'pending'
    | 'refunded'
    | 'chargebacked'
    | 'revoked'
    | 'expired';

export type LifecycleEventType =
    | 'purchase.succeeded'
    | 'purchase.failed'
    | 'purchase.refunded'
    | 'purchase.chargebacked';

export interface CatalogQuery {
    category?: MarketplaceCategory;
    q?: string;
    cursor?: string;
    limit?: number;
}

export interface CheckoutInput {
    userId: string;
    listingId: string;
    sku?: string;
    idempotencyKey: string;
    returnUrl?: string;
}

export interface CheckoutResult {
    redirectUrl: string;
    sessionId: string;
}

export interface WebhookVerification {
    ok: boolean;
    eventId: string | null;
    reason?: string;
}

export interface MarketplaceProviderInfo {
    id: MarketplaceProviderId;
    displayName: string;
    baseUrl: string;
    enabled: boolean;
    auth: MarketplaceAuthScheme;
    capabilities: readonly MarketplaceCapability[];
}

export interface MarketplaceProvider extends MarketplaceProviderInfo {
    fetchCatalog(query: CatalogQuery): Promise<NormalizedListing[]>;
    getListing(listingId: string): Promise<NormalizedListing | null>;
    createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult>;
    verifyWebhook(
        rawBody: string,
        headers: Record<string, string | undefined>
    ): WebhookVerification;
    parseEvent(payload: unknown): NormalizedLifecycleEvent | null;
}

export interface NormalizedListing {
    providerId: MarketplaceProviderId;
    providerListingId: string;
    category: MarketplaceCategory;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    sellerId: string | null;
    sellerDisplayName?: string;
    mediaUrls: string[];
    entitlementKind: EntitlementKind;
    tags?: string[];
    availableSkus?: string[];
}

export interface NormalizedEntitlement {
    id: string;
    userId: string;
    providerId: MarketplaceProviderId;
    providerListingId: string;
    sku: string | null;
    kind: EntitlementKind;
    status: EntitlementStatus;
    grantedAt: string;
    expiresAt: string | null;
    sourceEventId: string;
    metadata: Record<string, unknown>;
}

export interface NormalizedLifecycleEvent {
    providerId: MarketplaceProviderId;
    eventId: string;
    type: LifecycleEventType;
    userId: string;
    providerListingId: string;
    sku: string | null;
    kind: EntitlementKind;
    occurredAt: string;
    metadata: Record<string, unknown>;
}
