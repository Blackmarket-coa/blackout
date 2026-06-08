import type { GlobalSearchResult, GlobalSearchType } from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const SEARCH_BASE = '/v1/search';

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

export interface GlobalSearchResponse {
    results: GlobalSearchResult[];
}

/** Cross-entity search over coalitions, creators, bounties, and projects. */
export function globalSearch(
    query: string,
    types?: GlobalSearchType[],
    token: string | null = readBlackoutApiToken(),
): Promise<GlobalSearchResponse> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (types && types.length > 0) params.set('types', types.join(','));
    const qs = params.toString();
    return getJson<GlobalSearchResponse>(`${SEARCH_BASE}${qs ? `?${qs}` : ''}`, token);
}

/** Cross-entity trending list (active creators/coalitions + recent bounties/projects). */
export function globalTrending(
    token: string | null = readBlackoutApiToken(),
): Promise<GlobalSearchResponse> {
    return getJson<GlobalSearchResponse>(`${SEARCH_BASE}/trending`, token);
}

/**
 * Personalized recommendations (communities/creators/projects/knowledge).
 * `interestTags` boost entities sharing them; `excludeIds` are entities the
 * viewer already follows/joined and should not be re-suggested.
 */
export function globalRecommended(
    interestTags?: string[],
    excludeIds?: string[],
    token: string | null = readBlackoutApiToken(),
): Promise<GlobalSearchResponse> {
    const params = new URLSearchParams();
    if (interestTags && interestTags.length > 0) params.set('tags', interestTags.join(','));
    if (excludeIds && excludeIds.length > 0) params.set('exclude', excludeIds.join(','));
    const qs = params.toString();
    return getJson<GlobalSearchResponse>(`${SEARCH_BASE}/recommended${qs ? `?${qs}` : ''}`, token);
}
