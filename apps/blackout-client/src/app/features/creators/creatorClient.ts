import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const CREATOR_BASE = '/v1/creator';

export type CreatorArtifactKind =
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
    | 'automation_recipe';

export type CreatorListingCategory =
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

export type CreatorEntitlementKind =
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
    | 'vault_item';

export type CreatorListingStatus =
    | 'draft'
    | 'pending_review'
    | 'published'
    | 'rejected'
    | 'archived';

export interface CreatorListingView {
    id: string;
    providerId: string;
    providerListingId: string | null;
    artifactKind: CreatorArtifactKind;
    category: CreatorListingCategory;
    entitlementKind: CreatorEntitlementKind;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    status: CreatorListingStatus;
    publicSlug: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreatorProviderSummary {
    id: string;
    displayName: string;
    capabilities: string[];
}

export interface CreatorProvidersResponse {
    providers: CreatorProviderSummary[];
}

export interface CreatorListingsResponse {
    listings: CreatorListingView[];
}

export interface CreatorListingDraft {
    providerId: string;
    artifactKind: CreatorArtifactKind;
    category: CreatorListingCategory;
    entitlementKind: CreatorEntitlementKind;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    tags?: string[];
    mediaUrls?: string[];
    artifactPayload?: unknown;
    artifactUploadId?: string;
}

/** Alias for the studio composer, which historically named the draft type this way. */
export type CreateListingInput = CreatorListingDraft;

/**
 * Payout-onboarding handle. Mirrors the server contract — the
 * `/v1/creator/payouts/onboarding` route returns the provider's
 * `CreatorOnboardingHandle` (`{ onboardingUrl, expiresAt }`) verbatim
 * (see `@blackout/core` `marketplace/provider.ts`).
 */
export interface CreatorOnboardingHandle {
    onboardingUrl: string;
    expiresAt: string;
}

const callJson = <T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body: unknown,
    token: string | null
): Promise<T> => createAuthorizedApiClient(token)({ method, path, body }) as Promise<T>;

export const fetchCreatorProviders = (
    token: string | null = readBlackoutApiToken()
): Promise<CreatorProvidersResponse> =>
    callJson('GET', `${CREATOR_BASE}/providers`, undefined, token);

export const fetchMyCreatorListings = (
    token: string | null = readBlackoutApiToken()
): Promise<CreatorListingsResponse> =>
    callJson('GET', `${CREATOR_BASE}/listings/mine`, undefined, token);

export const createCreatorListing = (
    draft: CreatorListingDraft,
    token: string | null = readBlackoutApiToken()
): Promise<{ listing: CreatorListingView }> =>
    callJson('POST', `${CREATOR_BASE}/listings`, draft, token);

export const publishCreatorListing = (
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ listing: CreatorListingView | null }> =>
    callJson(
        'POST',
        `${CREATOR_BASE}/listings/${encodeURIComponent(id)}/publish`,
        undefined,
        token
    );

export const archiveCreatorListing = (
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: true }> =>
    callJson('DELETE', `${CREATOR_BASE}/listings/${encodeURIComponent(id)}`, undefined, token);

export const startCreatorPayoutOnboarding = (
    providerId: string,
    returnUrl: string | undefined = undefined,
    token: string | null = readBlackoutApiToken()
): Promise<CreatorOnboardingHandle> =>
    callJson('POST', `${CREATOR_BASE}/payouts/onboarding`, { providerId, returnUrl }, token);

// --- Public storefront wrappers (PR 4) ----------------------------------
//
// CreatorStorefront pulls from three pre-existing read endpoints; the
// client wrappers below keep their shapes loose so the page can render
// partial data without crashing on an absent service slice.

export interface PublicProfileResponse {
    userId: string;
    handle?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    [key: string]: unknown;
}

export interface PublicCreatorTier {
    id: string;
    name: string;
    description?: string;
    priceCents: number;
    currency: string;
    [key: string]: unknown;
}

export interface PublicCreatorTiersResponse {
    tiers: PublicCreatorTier[];
}

export const fetchPublicProfile = (
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<PublicProfileResponse> =>
    callJson('GET', `/v1/profile/${encodeURIComponent(userId)}`, undefined, token);

export const fetchCreatorTiers = (
    creatorUserId: string,
    token: string | null = readBlackoutApiToken()
): Promise<PublicCreatorTiersResponse> =>
    callJson(
        'GET',
        `/v1/creator-subs/creators/${encodeURIComponent(creatorUserId)}/tiers`,
        undefined,
        token
    );
