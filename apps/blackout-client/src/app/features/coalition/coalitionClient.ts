import type {
    AidPost,
    CoalitionFeedItem,
    CoalitionRankingModel,
    CoalitionTask,
    SellerLocation,
    SpatialFeedItem,
    TaskStatus,
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

/** Viewer-centred radius filter shared by mutual-aid + seller-location queries. */
export interface NearbyQuery {
    lat: number;
    lng: number;
    radiusKm: number;
}

function nearbyParams(nearby?: NearbyQuery): Record<string, string | undefined> {
    if (!nearby) return {};
    return {
        lat: String(nearby.lat),
        lng: String(nearby.lng),
        radiusKm: String(nearby.radiusKm),
    };
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

function patchJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'PATCH', path, body }) as Promise<T>;
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
    nearby?: NearbyQuery,
    token: string | null = readBlackoutApiToken(),
): Promise<MutualAidResponse> {
    const path = appendQuery(`${COALITION_BASE}/mutual-aid`, {
        denId: scope.denId,
        ...nearbyParams(nearby),
    });
    return getJson<MutualAidResponse>(path, token);
}

export function fetchSellerLocations(
    nearby?: NearbyQuery,
    token: string | null = readBlackoutApiToken(),
): Promise<SellerLocationsResponse> {
    const path = appendQuery(`${COALITION_BASE}/seller-locations`, nearbyParams(nearby));
    return getJson<SellerLocationsResponse>(path, token);
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

export interface TasksResponse {
    tasks: CoalitionTask[];
}

export function fetchCoalitionTasks(
    scope: CoalitionScopeQuery,
    token: string | null = readBlackoutApiToken(),
): Promise<TasksResponse> {
    const path = appendQuery(`${COALITION_BASE}/tasks`, { denId: scope.denId });
    return getJson<TasksResponse>(path, token);
}

export interface CreateTaskInput {
    denId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    proposalEventId?: string;
}

export function createCoalitionTask(
    input: CreateTaskInput,
    token: string | null = readBlackoutApiToken(),
): Promise<{ task: CoalitionTask }> {
    return postJson<{ task: CoalitionTask }>(`${COALITION_BASE}/tasks`, input, token);
}

export function updateCoalitionTaskStatus(
    id: string,
    status: TaskStatus,
    token: string | null = readBlackoutApiToken(),
): Promise<{ task: CoalitionTask }> {
    return patchJson<{ task: CoalitionTask }>(
        `${COALITION_BASE}/tasks/${encodeURIComponent(id)}`,
        { status },
        token,
    );
}
