import type { PluginDomain } from './domain';

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
    | 'creator-sso'
    | 'creator-write'
    | 'embedded-checkout';

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
    | 'subscription_tier'
    | 'post_unlock'
    | 'event_ticket'
    | 'role_grant'
    | 'channel_access';

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
    | 'purchase.chargebacked'
    | 'creator.payout.completed'
    | 'listing.signed_bundle.published'
    | 'creator.account.suspended'
    | 'referral.attributed'
    | 'ambassador.commission_paid'
    | 'quest.reward_settled';

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
    /**
     * When true, request an embeddable checkout session that can be rendered in
     * a sandboxed iframe inside the host app. The provider must emit
     * `postMessage` lifecycle events (`checkout.completed`, `checkout.cancelled`)
     * to its parent so the host can refresh entitlements without page reload.
     */
    embed?: boolean;
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

export interface CreatorListingDraftInput {
    sellerUserId: string;
    artifactKind: 'theme' | 'manifest_plugin' | 'code_plugin' | 'asset_bundle';
    category: MarketplaceCategory;
    entitlementKind: EntitlementKind;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    tags?: string[];
    mediaUrls?: string[];
    artifactPayload?: unknown;
    artifactUploadId?: string;
}

export interface CreatorListingResult {
    providerListingId: string;
    publicSlug: string | null;
    status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';
}

export interface CreatorOnboardingHandle {
    onboardingUrl: string;
    expiresAt: string;
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

    /** Optional creator-side surface — present when `creator-write` capability is advertised. */
    createCreatorListing?(input: CreatorListingDraftInput): Promise<CreatorListingResult>;
    publishCreatorListing?(providerListingId: string): Promise<CreatorListingResult>;
    archiveCreatorListing?(providerListingId: string): Promise<void>;
    startCreatorOnboarding?(sellerUserId: string, returnUrl?: string): Promise<CreatorOnboardingHandle>;

    /**
     * Optional bundle issuer for direct fulfillment. Used by stub/test
     * deployments to deliver a signed bundle from the same process; real
     * providers serve bundles from a CDN behind the asset-url flow.
     */
    issueSignedBundle?(entitlement: NormalizedEntitlement): Promise<SignedPluginBundleEnvelope>;
}

/**
 * Wire shape for direct bundle delivery. Mirrors `SignedPluginBundle`
 * from `@blackout/protocol` but is re-declared here as a plain object
 * so the marketplace provider interface stays free of cross-package
 * imports.
 */
export interface SignedPluginBundleEnvelope {
    manifest: Record<string, unknown>;
    bundleBase64: string;
    signature: {
        keyId: string;
        signature: string;
        manifestSha256: string;
        sha256: string;
        issuedAt: string;
    };
}

export interface NormalizedListing {
    providerId: MarketplaceProviderId;
    providerListingId: string;
    category: MarketplaceCategory;
    /** Ecosystem-domain axis (orthogonal to `category`); optional for legacy listings. */
    domain?: PluginDomain;
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
