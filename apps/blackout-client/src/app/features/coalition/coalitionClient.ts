import type {
    AidPost,
    CoalitionFeedItem,
    CoalitionRankingModel,
    SellerLocation,
    SpatialFeedItem,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const COALITION_BASE = '/v1/coalition';

export interface CoalitionScopeQuery {
    canopyId?: string;
    denId?: string;
}

export interface CoalitionFeedResponse {
    generatedAt: string;
    items: CoalitionFeedItem[];
}

export interface SpatialFeedResponse {
    generatedAt: string;
    layers: string[];
    items: SpatialFeedItem[];
}

export interface MutualAidResponse {
    posts: AidPost[];
}

export interface SellerLocationsResponse {
    locations: SellerLocation[];
}

function appendQuery(path: string, params: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            search.set(key, value);
        }
    }
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
}

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

export function fetchCoalitionFeed(
    scope: CoalitionScopeQuery,
    options: {
        kind?: CoalitionFeedItem['kind'];
        model?: CoalitionRankingModel;
        limit?: number;
    } = {},
    token: string | null = readBlackoutApiToken(),
): Promise<CoalitionFeedResponse> {
    const path = appendQuery(`${COALITION_BASE}/feed`, {
        canopyId: scope.canopyId,
        denId: scope.denId,
        kind: options.kind,
        model: options.model,
        limit: options.limit !== undefined ? String(options.limit) : undefined,
    });
    return getJson<CoalitionFeedResponse>(path, token);
}

export function fetchSpatialFeed(
    scope: CoalitionScopeQuery,
    layers?: string[],
    token: string | null = readBlackoutApiToken(),
): Promise<SpatialFeedResponse> {
    const path = appendQuery(`${COALITION_BASE}/spatial-feed`, {
        canopyId: scope.canopyId,
        layers: layers && layers.length > 0 ? layers.join(',') : undefined,
    });
    return getJson<SpatialFeedResponse>(path, token);
}

export function fetchMutualAid(
    scope: CoalitionScopeQuery,
    token: string | null = readBlackoutApiToken(),
): Promise<MutualAidResponse> {
    const path = appendQuery(`${COALITION_BASE}/mutual-aid`, { denId: scope.denId });
    return getJson<MutualAidResponse>(path, token);
}

export function fetchSellerLocations(
    token: string | null = readBlackoutApiToken(),
): Promise<SellerLocationsResponse> {
    return getJson<SellerLocationsResponse>(`${COALITION_BASE}/seller-locations`, token);
}

export interface CreateAidPostInput {
    type: AidPost['type'];
    category: AidPost['category'];
    title: string;
    description: string;
    location: AidPost['location'];
    displayRadiusMeters?: number;
    urgency?: AidPost['urgency'];
    expiresAt?: string;
    denId?: string;
}

export function createCoalitionAidPost(
    input: CreateAidPostInput,
    token: string | null = readBlackoutApiToken(),
): Promise<{ post: AidPost }> {
    return postJson<{ post: AidPost }>(`${COALITION_BASE}/mutual-aid`, input, token);
}
