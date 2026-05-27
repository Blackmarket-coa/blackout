import { createAuthorizedApiClient } from '../../../sdk/client';

const CREATOR_BASE = '/v1/creator';

export interface CreatorProviderSummary {
    id: string;
    displayName: string;
    capabilities: string[];
}

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
    category: string;
    entitlementKind: string;
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

export interface CreateListingInput {
    providerId: string;
    artifactKind: CreatorArtifactKind;
    category: string;
    entitlementKind: string;
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    tags?: string[];
    mediaUrls?: string[];
    artifactPayload?: unknown;
    artifactUploadId?: string;
}

export async function fetchCreatorProviders(token: string | null): Promise<CreatorProviderSummary[]> {
    const data = await createAuthorizedApiClient(token)<{ providers: CreatorProviderSummary[] }>({
        method: 'GET',
        path: `${CREATOR_BASE}/providers`,
    });
    return data.providers;
}

export async function fetchMyListings(token: string | null): Promise<CreatorListingView[]> {
    const data = await createAuthorizedApiClient(token)<{ listings: CreatorListingView[] }>({
        method: 'GET',
        path: `${CREATOR_BASE}/listings/mine`,
    });
    return data.listings;
}

export async function createListing(
    body: CreateListingInput,
    token: string | null
): Promise<CreatorListingView> {
    const data = await createAuthorizedApiClient(token)<{ listing: CreatorListingView }>({
        method: 'POST',
        path: `${CREATOR_BASE}/listings`,
        body,
    });
    return data.listing;
}

export async function publishListing(
    id: string,
    token: string | null
): Promise<CreatorListingView | null> {
    const data = await createAuthorizedApiClient(token)<{ listing: CreatorListingView | null }>({
        method: 'POST',
        path: `${CREATOR_BASE}/listings/${id}/publish`,
        body: {},
    });
    return data.listing;
}

export async function archiveListing(id: string, token: string | null): Promise<void> {
    await createAuthorizedApiClient(token)({
        method: 'DELETE',
        path: `${CREATOR_BASE}/listings/${id}`,
    });
}

export async function startPayoutOnboarding(
    providerId: string,
    returnUrl: string | undefined,
    token: string | null
): Promise<{ onboardingUrl: string; expiresAt: string }> {
    return createAuthorizedApiClient(token)({
        method: 'POST',
        path: `${CREATOR_BASE}/payouts/onboarding`,
        body: { providerId, returnUrl },
    });
}
