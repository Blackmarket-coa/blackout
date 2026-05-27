import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/channel-points — the native engagement economy.
 * Mirrors packages/api/src/routes/channelPoints.ts. A "channel" is a creator
 * (channelId = the creator's user id). Viewers read their balance and redeem
 * rewards; creators define rewards, grant points, and review redemptions.
 */

export interface ChannelPointsReward {
    id: string;
    creatorId: string;
    title: string;
    cost: number;
    prompt?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface BalanceResponse {
    channelId: string;
    userId: string;
    balance: number;
}

export interface ListRewardsResponse {
    rewards: ChannelPointsReward[];
}

export interface RedeemResponse {
    redemptionId: string;
    rewardId: string;
    balance: number;
}

export interface Redemption {
    id: string;
    userId: string;
    rewardId?: string;
    rewardTitle?: string;
    cost: number;
    userInput?: string;
    createdAt: string;
}

export interface ListRedemptionsResponse {
    items: Redemption[];
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/channel-points';
const ch = (channelId: string) => `${BASE}/channels/${encodeURIComponent(channelId)}`;

export const fetchBalance = (channelId: string, options?: ApiCallOptions): Promise<BalanceResponse> =>
    client(options)({ method: 'GET', path: `${ch(channelId)}/balance` }) as Promise<BalanceResponse>;

export const listRewards = (
    channelId: string,
    options?: ApiCallOptions,
): Promise<ListRewardsResponse> =>
    client(options)({ method: 'GET', path: `${ch(channelId)}/rewards` }) as Promise<ListRewardsResponse>;

export const grantPoints = (
    channelId: string,
    body: { userId: string; points: number },
    options?: ApiCallOptions,
): Promise<{ channelId: string; userId: string; balance: number }> =>
    client(options)({ method: 'POST', path: `${ch(channelId)}/grant`, body }) as Promise<{
        channelId: string;
        userId: string;
        balance: number;
    }>;

export const redeemReward = (
    channelId: string,
    body: { rewardId: string; userInput?: string },
    options?: ApiCallOptions,
): Promise<RedeemResponse> =>
    client(options)({ method: 'POST', path: `${ch(channelId)}/redeem`, body }) as Promise<RedeemResponse>;

export const listRedemptions = (
    channelId: string,
    options?: ApiCallOptions,
): Promise<ListRedemptionsResponse> =>
    client(options)({
        method: 'GET',
        path: `${ch(channelId)}/redemptions`,
    }) as Promise<ListRedemptionsResponse>;

export const createReward = (
    body: { title: string; cost: number; prompt?: string },
    options?: ApiCallOptions,
): Promise<ChannelPointsReward> =>
    client(options)({ method: 'POST', path: `${BASE}/rewards`, body }) as Promise<ChannelPointsReward>;

export const updateReward = (
    id: string,
    body: { title?: string; cost?: number; prompt?: string; isActive?: boolean },
    options?: ApiCallOptions,
): Promise<ChannelPointsReward> =>
    client(options)({
        method: 'PATCH',
        path: `${BASE}/rewards/${encodeURIComponent(id)}`,
        body,
    }) as Promise<ChannelPointsReward>;

export const deleteReward = (id: string, options?: ApiCallOptions): Promise<{ ok: boolean }> =>
    client(options)({
        method: 'DELETE',
        path: `${BASE}/rewards/${encodeURIComponent(id)}`,
    }) as Promise<{ ok: boolean }>;

// ----------------------------- input validators -----------------------------

export const isValidRewardTitle = (raw: string): boolean => {
    const t = raw.trim();
    return t.length > 0 && t.length <= 120;
};

export const isValidCost = (cost: number): boolean =>
    Number.isInteger(cost) && cost > 0 && cost <= 10_000_000;

/**
 * A creator's channel id is their own Blackout user id, which is the JWT `sub`.
 * Decode it from the bearer so the creator surface can address its own
 * channel-scoped endpoints (grant / redemptions). Returns null if the token is
 * missing or unparseable.
 */
export const decodeBlackoutUserId = (
    token: string | null = readBlackoutApiToken()
): string | null => {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const payload = JSON.parse(
            atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
        ) as { sub?: unknown };
        return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
        return null;
    }
};
