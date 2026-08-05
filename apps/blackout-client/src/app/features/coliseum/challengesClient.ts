import type {
    ChallengeEntry,
    ChallengeStatus,
    ColiseumChallenge,
    LeaderboardCategory,
    LeaderboardEntry,
    RankedChallengeEntry,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const BASE = '/v1/coliseum';

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}
function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}
function patchJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'PATCH', path, body }) as Promise<T>;
}

export interface ChallengesResponse {
    challenges: ColiseumChallenge[];
}

export function fetchChallenges(
    status?: ChallengeStatus,
    token: string | null = readBlackoutApiToken()
): Promise<ChallengesResponse> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return getJson<ChallengesResponse>(`${BASE}/challenges${qs}`, token);
}

export interface ChallengeDetailResponse {
    challenge: ColiseumChallenge;
    entries: RankedChallengeEntry[];
}

export function fetchChallenge(
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<ChallengeDetailResponse> {
    return getJson<ChallengeDetailResponse>(`${BASE}/challenges/${encodeURIComponent(id)}`, token);
}

export function createChallenge(
    input: { title: string; description?: string; category: string },
    token: string | null = readBlackoutApiToken()
): Promise<{ challenge: ColiseumChallenge }> {
    return postJson<{ challenge: ColiseumChallenge }>(`${BASE}/challenges`, input, token);
}

export function updateChallengeStatus(
    id: string,
    status: ChallengeStatus,
    token: string | null = readBlackoutApiToken()
): Promise<{ challenge: ColiseumChallenge }> {
    return patchJson<{ challenge: ColiseumChallenge }>(
        `${BASE}/challenges/${encodeURIComponent(id)}`,
        { status },
        token
    );
}

export function submitEntry(
    challengeId: string,
    input: { title: string; body?: string; mediaUrl?: string },
    token: string | null = readBlackoutApiToken()
): Promise<{ entry: RankedChallengeEntry }> {
    return postJson(`${BASE}/challenges/${encodeURIComponent(challengeId)}/entries`, input, token);
}

export function voteForEntry(
    entryId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ entries: RankedChallengeEntry[] }> {
    return postJson(`${BASE}/challenges/entries/${encodeURIComponent(entryId)}/vote`, {}, token);
}

/**
 * Register the canopy den backing an entry's discussion. Idempotent and
 * first-writer-wins — `created: false` means someone else linked a den first
 * and the returned entry carries theirs.
 */
export function linkChallengeEntryDen(
    entryId: string,
    denRoomId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ entry: ChallengeEntry; created: boolean }> {
    return postJson(
        `${BASE}/challenges/entries/${encodeURIComponent(entryId)}/den`,
        { denRoomId },
        token
    );
}

export interface LeaderboardResponse {
    category: LeaderboardCategory;
    entries: LeaderboardEntry[];
}

export function fetchLeaderboard(
    category: LeaderboardCategory,
    token: string | null = readBlackoutApiToken()
): Promise<LeaderboardResponse> {
    return getJson<LeaderboardResponse>(
        `${BASE}/leaderboards?category=${encodeURIComponent(category)}`,
        token
    );
}
