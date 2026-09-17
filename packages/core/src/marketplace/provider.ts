import type { PluginDomain } from './domain';

export const marketplaceProviderIds = [
    'freeblackmarket',
    'blamazon',
    'mayhem-marketplaze',
    'antin-amazon',
] as const;

export type MarketplaceProviderId = typeof marketplaceProviderIds[number];

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
    | 'subscription'
    | 'profile-cosmetic'
    | 'audio-pack'
    | 'community-template'
    | 'creator-asset'
    | 'security-tool'
    | 'ai-automation';

export type EntitlementKind =
    | 'emoji_pack'
    | 'asset_bundle'
    | 'software_license'
    | 'plugin_flag'
    | 'subscription_tier'
    | 'post_unlock'
    | 'event_ticket'
    | 'role_grant'
    | 'channel_access'
    | 'profile_cosmetic'
    | 'sound_pack'
    | 'community_template'
    | 'stream_asset'
    | 'vault_item'
    | 'privacy_tool';

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
    | 'quest.reward_settled'
    | 'bounty.reward_settled';

export interface CatalogQuery {
    category?: MarketplaceCategory;
    /** Optional artifact-kind filter; powers the marketplace "Plugins" shelf. */
    artifactKind?: import('./creator').CreatorArtifactKind;
    q?: string;
    cursor?: string;
    limit?: number;
}

export interface CheckoutInput {
    userId: string;
    listingId: string;
    sku?: string;
    /**
     * Charge this instead of the listing's own price, in minor units.
     *
     * For a coalition drive the contributor chooses what to give, so the
     * listing is a destination rather than a price. Without this the card was
     * charged `listing.price_cents` while Blackout recorded, displayed and
     * metered the amount the contributor actually picked — two different
     * numbers, with the contributor shown the one that never reached the rail.
     *
     * Omit it and the listing's price stands, which is what every fixed-price
     * flow (subscriptions, gifts, tickets) wants.
     */
    amountCents?: number;
    idempotencyKey: string;
    returnUrl?: string;
    /**
     * When true, request an embeddable checkout session that can be rendered in
     * a sandboxed iframe inside the host app. The provider must emit
     * `postMessage` lifecycle events (`checkout.completed`, `checkout.cancelled`)
     * to its parent so the host can refresh entitlements without page reload.
     */
    embed?: boolean;
    /**
     * Origin allowed to frame the embedded checkout (required by providers that
     * pin CSP `frame-ancestors` to it). Ignored unless `embed` is true.
     */
    embedOrigin?: string;
    /**
     * Bounded string→string echo the provider copies onto the resulting order
     * and returns verbatim on its purchase webhooks. This is the return-leg
     * correlation channel: `metadata.creatorSubscriptionId`,
     * `metadata.canopyPlanCode`, and `metadata.tipId` are how
     * `dispatchMonetizationEvent` maps a settled purchase back to the local
     * record that initiated it. Keep it small (providers cap ~20 keys /
     * 500-char values) and never put PII in it.
     */
    metadata?: Record<string, string>;
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
    artifactKind:
        | 'theme'
        | 'manifest_plugin'
        | 'code_plugin'
        | 'asset_bundle'
        | 'profile_cosmetic'
        | 'sound_pack'
        | 'community_template'
        | 'stream_asset'
        | 'vault_item'
        | 'ai_persona'
        | 'automation_recipe'
        | 'privacy_tool';
    category: MarketplaceCategory;
    entitlementKind: EntitlementKind;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    tags?: string[];
    mediaUrls?: string[];
    /**
     * Provider-side stamps on the listing. Values are strings because the
     * provider stores them on an opaque metadata column and consumers read
     * them back as text.
     *
     * A coalition drive needs these: FBM's embed drive checkout refuses a
     * listing that does not carry the coalition and drive it belongs to, so a
     * listing created without them is purchasable through one surface and
     * rejected by the other.
     */
    metadata?: Record<string, string>;
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
    /**
     * `sellerUserId` is a required owner assertion, not a convenience: the
     * provider API key is one shared secret standing in for every creator, so
     * the provider cannot otherwise tell which seller is acting and must be
     * told. Providers reject a mismatch.
     */
    publishCreatorListing?(
        providerListingId: string,
        sellerUserId: string
    ): Promise<CreatorListingResult>;
    archiveCreatorListing?(providerListingId: string, sellerUserId: string): Promise<void>;
    startCreatorOnboarding?(
        sellerUserId: string,
        returnUrl?: string
    ): Promise<CreatorOnboardingHandle>;

    /**
     * Optional bundle issuer for direct fulfillment. Used by stub/test
     * deployments to deliver a signed bundle from the same process; real
     * providers serve bundles from a CDN behind the asset-url flow.
     */
    issueSignedBundle?(entitlement: NormalizedEntitlement): Promise<SignedPluginBundleEnvelope>;

    /**
     * The platform fee this provider will actually charge on a listing, in
     * basis points — which can be lower than the table rate when the seller
     * pays for a plan that discounts it.
     *
     * `null` means "no opinion, use the table rate". Optional so providers
     * without a per-listing notion of fee need no change.
     */
    getListingFeeBps?(listingId: string): Promise<number | null>;
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
    /** Source artifact kind, when the provider can expose it; used by the UI to
     *  group plugins (manifest_plugin/code_plugin/automation_recipe) onto a
     *  dedicated shelf. Optional for legacy providers. */
    artifactKind?: import('./creator').CreatorArtifactKind;
    tags?: string[];
    availableSkus?: string[];
    /**
     * `features.*` entitlement keys this listing grants when purchased. For an
     * individual item this is usually one key (or empty for pure artifact
     * goods); for a `subscription_tier` listing it is the whole tier bundle.
     * This is the single field that bridges System A (marketplace listings) to
     * System B (`features.*` tier entitlements). Optional for legacy providers.
     */
    featureKeys?: string[];
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
    /** `features.*` keys this grant unlocks; carried through so the client can
     *  light up gated features/widgets without a second lookup. */
    featureKeys?: string[];
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
    /**
     * What the provider actually charged, in minor units, when it reports it.
     *
     * The settling side needs this to confirm that the money that moved is the
     * money it predicted: a tip's split is frozen when the tip is written, and
     * before this there was nothing in the return leg to check it against.
     * Absent for providers that do not report an amount.
     */
    amountCents?: number;
    /** `features.*` keys this event grants/revokes; for `subscription_tier`
     *  events this is the full tier bundle to fan out into per-key grants. */
    featureKeys?: string[];
    metadata: Record<string, unknown>;
}
