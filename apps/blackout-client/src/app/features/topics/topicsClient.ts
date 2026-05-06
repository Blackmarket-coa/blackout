import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const TOPICS_BASE = '/v1/topics';

export interface TopicSummary {
    tag: string;
    count: number;
}

export interface ListTopicsResponse {
    items: TopicSummary[];
}

export interface TopicCanopySummary {
    id: string;
    name: string;
    bio?: string;
    tags: string[];
    activityScore: number;
    region?: string | null;
}

export interface ListCanopiesByTagResponse {
    tag: string;
    items: TopicCanopySummary[];
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

/**
 * Wraps `GET /v1/topics`. Returns frequency-sorted (descending) unique
 * tags from the discovery service's in-memory index. Capped server-side
 * at 50 by default; pass `limit` to override.
 */
export function listTopics(
    options: { limit?: number } = {},
    token: string | null = readBlackoutApiToken()
): Promise<ListTopicsResponse> {
    const path = appendQuery(TOPICS_BASE, {
        limit: options.limit !== undefined ? String(options.limit) : undefined,
    });
    return getJson<ListTopicsResponse>(path, token);
}

/**
 * Wraps `GET /v1/topics/:tag/canopies`. Returns canopies tagged with
 * `tag` sorted by recency. Reuses the discovery service's existing
 * tag filter; no additional client-side filtering required.
 */
export function listCanopiesByTag(
    tag: string,
    options: { limit?: number; region?: string } = {},
    token: string | null = readBlackoutApiToken()
): Promise<ListCanopiesByTagResponse> {
    const path = appendQuery(`${TOPICS_BASE}/${encodeURIComponent(tag)}/canopies`, {
        limit: options.limit !== undefined ? String(options.limit) : undefined,
        region: options.region,
    });
    return getJson<ListCanopiesByTagResponse>(path, token);
}
