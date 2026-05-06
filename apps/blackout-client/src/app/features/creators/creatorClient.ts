import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const CREATOR_BASE = '/v1/creator';

export type CreatorArtifactKind = 'theme' | 'manifest_plugin' | 'code_plugin' | 'asset_bundle';

export type CreatorListingCategory =
    | 'emoji-sticker'
    | 'meme-asset'
    | 'stego-software'
    | 'plugin-curated'
    | 'subscription';

export type CreatorEntitlementKind =
    | 'emoji_pack'
    | 'asset_bundle'
    | 'software_license'
    | 'plugin_flag'
    | 'subscription_tier'
    | 'post_unlock'
    | 'event_ticket'
    | 'role_grant'
    | 'channel_access';

export type CreatorListingStatus = 'draft' | 'published' | 'archived' | string;

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

export interface CreatorProvidersResponse {
    providers: Array<{ id: string; displayName: string; capabilities: string[] }>;
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

export interface CreatorOnboardingHandle {
    redirectUrl?: string;
    [key: string]: unknown;
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
