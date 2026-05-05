import type {
    MarketplaceCategory,
    MarketplaceProviderFeeSchedule,
    MarketplaceProviderId,
    NormalizedEntitlement,
    NormalizedListing,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../../sdk/client';

export interface MarketplaceProviderPresentationSummary {
    label: string;
    icon: string;
    profileSlug: string;
    profileHeadline: string;
}

export interface MarketplaceProviderTrustSummary {
    tier: 'verified' | 'community' | 'unverified';
    verificationBadge: string | null;
    trustSummary: string;
    checkoutDisclosure: string;
    payoutPolicy: string;
    refundPolicy: string;
    supportPolicy: string;
}

export interface MarketplaceProviderSummary {
    id: MarketplaceProviderId;
    displayName: string;
    enabled: boolean;
    capabilities: string[];
    fees: MarketplaceProviderFeeSchedule;
    presentation: MarketplaceProviderPresentationSummary;
    trust: MarketplaceProviderTrustSummary;
    profileUrl: string;
}

export interface FulfillmentAsset {
    entitlementId: string;
    providerId: MarketplaceProviderId;
    kind: string;
    signature: string;
    expiresAt: string;
    assetUrl?: string;
    licenseKey?: string;
    activationsUsed?: number;
    activationsMax?: number;
}

const MARKETPLACE_BASE = '/v1/marketplace';

async function getJson<T>(url: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({
        method: 'GET',
        path: url,
    });
}

async function postJson<T>(url: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({
        method: 'POST',
        path: url,
        body,
    });
}

export async function fetchProviders(token: string | null): Promise<MarketplaceProviderSummary[]> {
    const data = await getJson<{ providers: MarketplaceProviderSummary[] }>(
        `${MARKETPLACE_BASE}/providers`,
        token
    );
    return data.providers;
}

export interface ListingsQuery {
    providerId?: MarketplaceProviderId;
    category?: MarketplaceCategory;
    q?: string;
}

export async function fetchListings(
    query: ListingsQuery,
    token: string | null
): Promise<NormalizedListing[]> {
    const url = new URL(`${MARKETPLACE_BASE}/listings`, 'https://blackout.local');
    if (query.providerId) url.searchParams.set('providerId', query.providerId);
    if (query.category) url.searchParams.set('category', query.category);
    if (query.q) url.searchParams.set('q', query.q);
    const data = await getJson<{ listings: NormalizedListing[] }>(
        url.pathname + url.search,
        token
    );
    return data.listings;
}

export async function fetchListingDetail(
    providerId: MarketplaceProviderId,
    listingId: string,
    token: string | null
): Promise<NormalizedListing> {
    const data = await getJson<{ listing: NormalizedListing }>(
        `${MARKETPLACE_BASE}/listings/${providerId}/${listingId}`,
        token
    );
    return data.listing;
}

export async function startCheckout(
    input: {
        providerId: MarketplaceProviderId;
        listingId: string;
        sku?: string;
        returnUrl?: string;
        embed?: boolean;
    },
    token: string | null
): Promise<{ redirectUrl: string; sessionId: string; embed?: boolean }> {
    return postJson(`${MARKETPLACE_BASE}/checkout`, input, token);
}

export async function fetchEntitlements(token: string | null): Promise<NormalizedEntitlement[]> {
    const data = await getJson<{ entitlements: NormalizedEntitlement[] }>(
        `${MARKETPLACE_BASE}/entitlements`,
        token
    );
    return data.entitlements;
}

export async function fetchFulfillmentAsset(
    entitlementId: string,
    token: string | null
): Promise<FulfillmentAsset> {
    return getJson(`${MARKETPLACE_BASE}/fulfillment/${entitlementId}/asset`, token);
}
