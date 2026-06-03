import type {
    Bounty,
    BountyApplication,
    BountyCategory,
    BountyRewardType,
    BountyStatus,
} from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const BOUNTY_BASE = '/v1/bounties';

function getJson<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path }) as Promise<T>;
}

function postJson<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body }) as Promise<T>;
}

export interface BountiesQuery {
    category?: BountyCategory;
    status?: BountyStatus;
    coalitionId?: string;
}

export interface BountiesResponse {
    bounties: Bounty[];
}

export function fetchBounties(
    query: BountiesQuery = {},
    token: string | null = readBlackoutApiToken(),
): Promise<BountiesResponse> {
    const params = new URLSearchParams();
    if (query.category) params.set('category', query.category);
    if (query.status) params.set('status', query.status);
    if (query.coalitionId) params.set('coalitionId', query.coalitionId);
    const qs = params.toString();
    return getJson<BountiesResponse>(`${BOUNTY_BASE}${qs ? `?${qs}` : ''}`, token);
}

/** Auto-matched open bounties for the signed-in creator (Creator Hub growth panel). */
export function fetchRecommendedBounties(
    token: string | null = readBlackoutApiToken(),
): Promise<BountiesResponse> {
    return getJson<BountiesResponse>(`${BOUNTY_BASE}/recommended`, token);
}

export interface CreateBountyInput {
    category: BountyCategory;
    title: string;
    description: string;
    rewardType: BountyRewardType;
    rewardSummary: string;
    rewardAmountCents?: number;
    requirements?: string[];
    deliverables?: string[];
    coalitionId?: string;
}

export function createBounty(
    input: CreateBountyInput,
    token: string | null = readBlackoutApiToken(),
): Promise<{ bounty: Bounty }> {
    return postJson<{ bounty: Bounty }>(BOUNTY_BASE, input, token);
}

export function claimBounty(
    id: string,
    token: string | null = readBlackoutApiToken(),
): Promise<{ bounty: Bounty }> {
    return postJson<{ bounty: Bounty }>(
        `${BOUNTY_BASE}/${encodeURIComponent(id)}/claim`,
        {},
        token,
    );
}

// --- applications (producer ↔ creator matching) ---

export function applyToBounty(
    id: string,
    message?: string,
    token: string | null = readBlackoutApiToken(),
): Promise<{ application: BountyApplication }> {
    return postJson<{ application: BountyApplication }>(
        `${BOUNTY_BASE}/${encodeURIComponent(id)}/applications`,
        message ? { message } : {},
        token,
    );
}

export function fetchBountyApplications(
    id: string,
    token: string | null = readBlackoutApiToken(),
): Promise<{ applications: BountyApplication[] }> {
    return getJson<{ applications: BountyApplication[] }>(
        `${BOUNTY_BASE}/${encodeURIComponent(id)}/applications`,
        token,
    );
}

export function acceptBountyApplication(
    id: string,
    applicantId: string,
    token: string | null = readBlackoutApiToken(),
): Promise<{ bounty: Bounty; application: BountyApplication }> {
    return postJson<{ bounty: Bounty; application: BountyApplication }>(
        `${BOUNTY_BASE}/${encodeURIComponent(id)}/applications/${encodeURIComponent(
            applicantId,
        )}/accept`,
        {},
        token,
    );
}
