/**
 * Creator Studio client — thin adapter over the canonical creator client
 * (`features/creators/creatorClient.ts`). Studio prefers "unwrapped" return
 * shapes (bare arrays / records) and an explicit `token` argument, so this
 * module adapts the canonical envelope-returning functions rather than
 * duplicating the endpoint wiring and type definitions (which previously drifted
 * — e.g. the payout-onboarding response shape).
 */
import {
    archiveCreatorListing,
    createCreatorListing,
    fetchCreatorProviders as fetchCreatorProvidersEnvelope,
    fetchMyCreatorListings,
    publishCreatorListing,
    startCreatorPayoutOnboarding,
    type CreateListingInput,
    type CreatorArtifactKind,
    type CreatorListingStatus,
    type CreatorListingView,
    type CreatorOnboardingHandle,
    type CreatorProviderSummary,
} from '../../creators/creatorClient';

export type {
    CreateListingInput,
    CreatorArtifactKind,
    CreatorListingStatus,
    CreatorListingView,
    CreatorOnboardingHandle,
    CreatorProviderSummary,
};

export async function fetchCreatorProviders(
    token: string | null
): Promise<CreatorProviderSummary[]> {
    const { providers } = await fetchCreatorProvidersEnvelope(token);
    return providers;
}

export async function fetchMyListings(token: string | null): Promise<CreatorListingView[]> {
    const { listings } = await fetchMyCreatorListings(token);
    return listings;
}

export async function createListing(
    body: CreateListingInput,
    token: string | null
): Promise<CreatorListingView> {
    const { listing } = await createCreatorListing(body, token);
    return listing;
}

export async function publishListing(
    id: string,
    token: string | null
): Promise<CreatorListingView | null> {
    const { listing } = await publishCreatorListing(id, token);
    return listing;
}

export async function archiveListing(id: string, token: string | null): Promise<void> {
    await archiveCreatorListing(id, token);
}

export function startPayoutOnboarding(
    providerId: string,
    returnUrl: string | undefined,
    token: string | null
): Promise<CreatorOnboardingHandle> {
    return startCreatorPayoutOnboarding(providerId, returnUrl, token);
}
