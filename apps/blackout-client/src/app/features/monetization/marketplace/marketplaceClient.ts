import type {
    MarketplaceCategory,
    MarketplaceProviderFeeSchedule,
    MarketplaceProviderId,
    NormalizedEntitlement,
    NormalizedListing,
} from '@blackout/core';

export interface MarketplaceProviderSummary {
    id: MarketplaceProviderId;
    displayName: string;
    enabled: boolean;
    capabilities: string[];
    fees: MarketplaceProviderFeeSchedule;
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

const API_BASE =
    (typeof import.meta !== 'undefined' &&
        (import.meta as { env?: { VITE_BLACKOUT_API_BASE_URL?: string } }).env
            ?.VITE_BLACKOUT_API_BASE_URL) ||
    '';
const MARKETPLACE_BASE = `${API_BASE}/v1/marketplace`;

function authHeader(token: string | null): Record<string, string> {
    return token ? { authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(url: string, token: string | null): Promise<T> {
    const response = await fetch(url, {
        headers: { 'content-type': 'application/json', ...authHeader(token) },
    });
    if (!response.ok) throw new Error(`request failed: ${response.status}`);
    return (await response.json()) as T;
}

async function postJson<T>(url: string, body: unknown, token: string | null): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeader(token) },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`request failed: ${response.status}`);
    return (await response.json()) as T;
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
    const url = new URL(`${MARKETPLACE_BASE}/listings`, window.location.origin);
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
    input: { providerId: MarketplaceProviderId; listingId: string; sku?: string; returnUrl?: string },
    token: string | null
): Promise<{ redirectUrl: string; sessionId: string }> {
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
