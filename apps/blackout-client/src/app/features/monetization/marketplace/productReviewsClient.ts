import type { ProductRatingSummary, ProductReview, ProductVersion } from '@blackout/core';
import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from './useMarketplaceAuth';

const base = (providerId: string, listingId: string) =>
    `/v1/marketplace/listings/${encodeURIComponent(providerId)}/${encodeURIComponent(listingId)}`;

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}
function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

export interface ReviewsResponse {
    reviews: ProductReview[];
    summary: ProductRatingSummary;
}

export function fetchProductReviews(
    providerId: string,
    listingId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<ReviewsResponse> {
    return getJson<ReviewsResponse>(`${base(providerId, listingId)}/reviews`, token);
}

export function postProductReview(
    providerId: string,
    listingId: string,
    rating: number,
    body: string | undefined,
    token: string | null = readBlackoutApiToken(),
): Promise<{ review: ProductReview; summary: ProductRatingSummary }> {
    return postJson(`${base(providerId, listingId)}/reviews`, { rating, body }, token);
}

export interface VersionsResponse {
    versions: ProductVersion[];
}

export function fetchProductVersions(
    providerId: string,
    listingId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<VersionsResponse> {
    return getJson<VersionsResponse>(`${base(providerId, listingId)}/versions`, token);
}
