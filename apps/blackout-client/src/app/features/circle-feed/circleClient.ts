/**
 * API client for the Circle graph. Kept separate from `circleFeedClient.ts` so
 * the graph and the feed that reads it stay independently testable.
 */
import { deleteJson, getJson, postJson } from '../../sdk/json';
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
    return getJson<{ following: CircleMember[] }>(`${CIRCLE_BASE}/following`, token).then(
        (result) => result.following
    );
}

/**
 * Put someone in your Circle. Idempotent server-side, so a retry after a partial
 * migration re-follows without duplicating an edge.
 */
export function followInCircle(
    followeeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: boolean; created: boolean; overlaps: boolean }> {
    return postJson<{ ok: boolean; created: boolean; overlaps: boolean }>(
        CIRCLE_BASE,
        { followeeId },
        token
    );
}

export function unfollowInCircle(
    followeeId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: boolean; removed: boolean }> {
    return deleteJson<{ ok: boolean; removed: boolean }>(
        `${CIRCLE_BASE}/${encodeURIComponent(followeeId)}`,
        token
    );
}
