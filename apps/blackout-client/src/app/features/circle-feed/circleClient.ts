/**
 * API client for the Circle graph. Kept separate from `circleFeedClient.ts` so
 * the graph and the feed that reads it stay independently testable.
 */
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const CIRCLE_BASE = '/v1/circle';

export interface CircleMember {
    userId: string;
    username: string;
    /** Null when the id could not be resolved to a Matrix user. */
    matrixUserId: string | null;
}

export function fetchCircleFollowing(
    token: string | null = readBlackoutApiToken()
): Promise<CircleMember[]> {
    return (
        createAuthorizedApiClient(token)({
            method: 'GET',
            path: `${CIRCLE_BASE}/following`,
        }) as Promise<{ following: CircleMember[] }>
    ).then((result) => result.following);
}

/**
 * Put someone in your Circle. Idempotent server-side, so a retry after a partial
 * migration re-follows without duplicating an edge.
 */
export function followInCircle(
    followeeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: boolean; created: boolean; overlaps: boolean }> {
    return createAuthorizedApiClient(token)({
        method: 'POST',
        path: CIRCLE_BASE,
        body: { followeeId },
    }) as Promise<{ ok: boolean; created: boolean; overlaps: boolean }>;
}

export function unfollowInCircle(
    followeeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: boolean; removed: boolean }> {
    return createAuthorizedApiClient(token)({
        method: 'DELETE',
        path: `${CIRCLE_BASE}/${encodeURIComponent(followeeId)}`,
    }) as Promise<{ ok: boolean; removed: boolean }>;
}
