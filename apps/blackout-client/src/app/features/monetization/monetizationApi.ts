// Single client wrapper for every Phase-1–4 monetization endpoint.
// Mirrors the marketplaceClient.ts pattern so the rest of the UI has one
// import per concern and a consistent shape across earning surfaces.

import type { MarketplaceProviderId } from '@blackout/core';
import { createAuthorizedApiClient } from '../../sdk/client';

const TIPS_BASE = '/v1/tips';
const GIFTS_BASE = '/v1/gifts';
const CREATOR_SUBS_BASE = '/v1/creator-subs';
const COMMUNITY_BOOSTS_BASE = '/v1/community-boosts';
const AID_POOLS_BASE = '/v1/aid-pools';
const AD_REVENUE_BASE = '/v1/ad-revenue';
const ROLES_BASE = '/v1/roles';
const CHANNEL_ACCESS_BASE = '/v1/channel-access';
const STREAMING_BASE = '/v1/streaming';
const ENTITLEMENTS_BASE = '/v1/entitlements';

function get<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'GET', path });
}

function post<T>(path: string, body: unknown, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'POST', path, body });
}

function del<T>(path: string, token: string | null): Promise<T> {
    return createAuthorizedApiClient(token)({ method: 'DELETE', path });
}

// =============================================================================
// Tips
// =============================================================================

export type TipContextKind = 'profile' | 'stream' | 'post' | 'channel_message' | 'aid_pool';
export type TipStatus = 'pending' | 'captured' | 'refunded' | 'failed';

export interface Tip {
    id: string;
    senderUserId: string;
    recipientUserId: string;
    contextKind: TipContextKind;
    contextRef: string | null;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    providerId: MarketplaceProviderId;
    fbmOrderId: string | null;
    status: TipStatus;
    note: string | null;
    giftSku: string | null;
    createdAt: string;
    capturedAt: string | null;
    refundedAt: string | null;
}

export interface CreateTipInput {
    recipientUserId: string;
    contextKind: TipContextKind;
    contextRef?: string;
    grossCents: number;
    currency: string;
    note?: string;
}

export const tipsApi = {
    create(input: CreateTipInput, token: string | null): Promise<{ tip: Tip }> {
        return post(TIPS_BASE, input, token);
    },
    listReceived(token: string | null, limit?: number): Promise<{ tips: Tip[] }> {
        const suffix = limit ? `?limit=${limit}` : '';
        return get(`${TIPS_BASE}/received${suffix}`, token);
    },
    listSent(token: string | null, limit?: number): Promise<{ tips: Tip[] }> {
        const suffix = limit ? `?limit=${limit}` : '';
        return get(`${TIPS_BASE}/sent${suffix}`, token);
    },
    getById(id: string, token: string | null): Promise<{ tip: Tip }> {
        return get(`${TIPS_BASE}/${id}`, token);
    },
};

// =============================================================================
// Gifts
// =============================================================================

export interface Gift {
    sku: string;
    label: string;
    priceCents: number;
    currency: 'USD';
    sprite: string;
}

export interface SendGiftInput {
    recipientUserId: string;
    sku: string;
    contextKind: 'profile' | 'stream' | 'post' | 'channel_message';
    contextRef?: string;
    note?: string;
}

export const giftsApi = {
    catalog(token: string | null): Promise<{ gifts: Gift[] }> {
        return get(`${GIFTS_BASE}/catalog`, token);
    },
    send(input: SendGiftInput, token: string | null): Promise<{ tip: Tip; gift: Gift }> {
        return post(GIFTS_BASE, input, token);
    },
};

// =============================================================================
// Creator subscriptions
// =============================================================================

export type CreatorTierStatus = 'draft' | 'active' | 'archived';
export type CreatorSubStatus =
    | 'pending'
    | 'active'
    | 'canceled'
    | 'refunded'
    | 'expired';

export interface CreatorTier {
    id: string;
    creatorUserId: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    providerId: MarketplaceProviderId;
    fbmListingId: string | null;
    status: CreatorTierStatus;
    feeCents: number;
    netCents: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreatorSubscription {
    id: string;
    subscriberUserId: string;
    creatorUserId: string;
    tierId: string;
    providerId: MarketplaceProviderId;
    fbmSubscriptionId: string | null;
    status: CreatorSubStatus;
    startedAt: string | null;
    currentPeriodEndsAt: string | null;
    canceledAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateTierInput {
    name: string;
    description?: string;
    priceCents: number;
    currency: string;
}

export const creatorSubsApi = {
    listMyTiers(token: string | null): Promise<{ tiers: CreatorTier[] }> {
        return get(`${CREATOR_SUBS_BASE}/me/tiers`, token);
    },
    createTier(input: CreateTierInput, token: string | null): Promise<{ tier: CreatorTier }> {
        return post(`${CREATOR_SUBS_BASE}/me/tiers`, input, token);
    },
    archiveTier(tierId: string, token: string | null): Promise<{ tier: CreatorTier }> {
        return del(`${CREATOR_SUBS_BASE}/me/tiers/${tierId}`, token);
    },
    listCreatorTiers(creatorUserId: string, token: string | null): Promise<{ tiers: CreatorTier[] }> {
        return get(`${CREATOR_SUBS_BASE}/creators/${creatorUserId}/tiers`, token);
    },
    subscribe(tierId: string, token: string | null): Promise<{ subscription: CreatorSubscription }> {
        return post(`${CREATOR_SUBS_BASE}/subscribe`, { tierId }, token);
    },
    listMySubscriptions(token: string | null): Promise<{ subscriptions: CreatorSubscription[] }> {
        return get(`${CREATOR_SUBS_BASE}/subscriptions/me`, token);
    },
    listMySubscribers(token: string | null): Promise<{ subscriptions: CreatorSubscription[] }> {
        return get(`${CREATOR_SUBS_BASE}/me/subscribers`, token);
    },
    cancel(subscriptionId: string, token: string | null): Promise<{ subscription: CreatorSubscription }> {
        return post(`${CREATOR_SUBS_BASE}/subscriptions/${subscriptionId}/cancel`, {}, token);
    },
};

// =============================================================================
// Community boosts
// =============================================================================

export type BoostPledgeStatus = 'pending' | 'active' | 'canceled' | 'refunded' | 'expired';

export interface BoostPledge {
    id: string;
    communityId: string;
    pledgerUserId: string;
    monthlyCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    providerId: MarketplaceProviderId;
    fbmSubscriptionId: string | null;
    status: BoostPledgeStatus;
    startedAt: string | null;
    currentPeriodEndsAt: string | null;
    canceledAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CommunityBoostState {
    communityId: string;
    activePledgeCount: number;
    boostLevel: number;
    nextThreshold: number | null;
    pledgesUntilNextLevel: number | null;
    monthlyGrossCents: number;
    monthlyNetCents: number;
}

export const communityBoostsApi = {
    pledge(
        communityId: string,
        monthlyCents: number,
        currency: string,
        token: string | null
    ): Promise<{ pledge: BoostPledge }> {
        return post(`${COMMUNITY_BOOSTS_BASE}/pledge`, { communityId, monthlyCents, currency }, token);
    },
    state(communityId: string, token: string | null): Promise<CommunityBoostState> {
        return get(`${COMMUNITY_BOOSTS_BASE}/communities/${communityId}/state`, token);
    },
    listForCommunity(
        communityId: string,
        token: string | null
    ): Promise<CommunityBoostState & { pledges: BoostPledge[] }> {
        return get(`${COMMUNITY_BOOSTS_BASE}/communities/${communityId}`, token);
    },
    listMine(token: string | null): Promise<{ pledges: BoostPledge[] }> {
        return get(`${COMMUNITY_BOOSTS_BASE}/me`, token);
    },
    cancel(pledgeId: string, token: string | null): Promise<{ pledge: BoostPledge }> {
        return post(`${COMMUNITY_BOOSTS_BASE}/pledges/${pledgeId}/cancel`, {}, token);
    },
};

// =============================================================================
// Aid pools
// =============================================================================

export type AidPoolStatus = 'open' | 'fulfilled' | 'closed';

export interface AidPool {
    id: string;
    organizerUserId: string;
    title: string;
    description: string | null;
    goalCents: number;
    currency: string;
    status: AidPoolStatus;
    raisedCents: number;
    feeCents: number;
    netCents: number;
    contributionCount: number;
    uniqueContributorCount: number;
    percent: number;
    createdAt: string;
    fulfilledAt: string | null;
    closedAt: string | null;
}

export interface CreateAidPoolInput {
    title: string;
    description?: string;
    goalCents: number;
    currency: string;
}

export const aidPoolsApi = {
    list(token: string | null): Promise<{ pools: AidPool[] }> {
        return get(`${AID_POOLS_BASE}`, token);
    },
    listMine(token: string | null): Promise<{ pools: AidPool[] }> {
        return get(`${AID_POOLS_BASE}/me`, token);
    },
    getById(id: string, token: string | null): Promise<{ pool: AidPool }> {
        return get(`${AID_POOLS_BASE}/${id}`, token);
    },
    create(input: CreateAidPoolInput, token: string | null): Promise<{ pool: AidPool }> {
        return post(`${AID_POOLS_BASE}`, input, token);
    },
    contribute(
        id: string,
        amountCents: number,
        note: string | undefined,
        token: string | null
    ): Promise<{ tip: Tip; pool: AidPool }> {
        return post(`${AID_POOLS_BASE}/${id}/contribute`, { amountCents, note }, token);
    },
    fulfill(id: string, token: string | null): Promise<{ pool: AidPool }> {
        return post(`${AID_POOLS_BASE}/${id}/fulfill`, {}, token);
    },
    close(id: string, token: string | null): Promise<{ pool: AidPool }> {
        return post(`${AID_POOLS_BASE}/${id}/close`, {}, token);
    },
};

// =============================================================================
// Ad revenue
// =============================================================================

export type AdRevenueShareStatus = 'pending_payout' | 'paid' | 'voided';

export interface AdRevenueShare {
    id: string;
    periodId: string;
    creatorUserId: string;
    grossCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    providerId: MarketplaceProviderId;
    fbmPayoutId: string | null;
    status: AdRevenueShareStatus;
    computedAt: string;
    paidAt: string | null;
}

export const adRevenueApi = {
    listMine(token: string | null): Promise<{ shares: AdRevenueShare[] }> {
        return get(`${AD_REVENUE_BASE}/me`, token);
    },
};

// =============================================================================
// Roles + channel access (entitlement-backed)
// =============================================================================

export interface RoleGrant {
    entitlementId: string;
    userId: string;
    providerId: MarketplaceProviderId;
    listingId: string;
    roleId: string | null;
    communityId: string | null;
    grantedAt: string;
    expiresAt: string | null;
}

export interface ChannelAccessGrant {
    entitlementId: string;
    userId: string;
    providerId: MarketplaceProviderId;
    listingId: string;
    channelId: string | null;
    grantedAt: string;
    expiresAt: string | null;
}

export const rolesApi = {
    listMine(token: string | null): Promise<{ roles: RoleGrant[] }> {
        return get(`${ROLES_BASE}/me`, token);
    },
    hasRole(
        roleId: string,
        communityId: string | null,
        token: string | null
    ): Promise<{ roleId: string; communityId: string | null; hasRole: boolean }> {
        const suffix = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
        return get(`${ROLES_BASE}/me/has/${encodeURIComponent(roleId)}${suffix}`, token);
    },
};

export const channelAccessApi = {
    listMine(token: string | null): Promise<{ access: ChannelAccessGrant[] }> {
        return get(`${CHANNEL_ACCESS_BASE}/me`, token);
    },
    forChannel(
        channelId: string,
        token: string | null
    ): Promise<{ channelId: string; canAccess: boolean }> {
        return get(`${CHANNEL_ACCESS_BASE}/${encodeURIComponent(channelId)}`, token);
    },
};

// =============================================================================
// Stream revenue / goals
// =============================================================================

export interface StreamRevenueBreakdown {
    streamId: string;
    creatorUserId: string | null;
    grossCents: number;
    feeCents: number;
    netCents: number;
    tipCount: number;
    giftCount: number;
    byCurrency: Record<
        string,
        { grossCents: number; feeCents: number; netCents: number; count: number }
    >;
    uniqueSenderCount: number;
    computedAt: string;
}

export interface StreamGoalProgress {
    streamId: string;
    targetCents: number;
    currency: string;
    achievedCents: number;
    percent: number;
    metAt: string | null;
}

export const streamRevenueApi = {
    revenue(streamId: string, token: string | null): Promise<StreamRevenueBreakdown> {
        return get(`${STREAMING_BASE}/streams/${streamId}/revenue`, token);
    },
    goal(
        streamId: string,
        targetCents: number,
        currency: string,
        token: string | null
    ): Promise<StreamGoalProgress> {
        return get(
            `${STREAMING_BASE}/streams/${streamId}/goal?targetCents=${targetCents}&currency=${encodeURIComponent(currency)}`,
            token
        );
    },
};

// =============================================================================
// Paywall / event-ticket access gate
// =============================================================================

export interface ListingEntitlementGate {
    canAccess: boolean;
    kind: string | null;
    entitlementId: string | null;
    status: string | null;
}

export const paywallApi = {
    forListing(
        providerId: MarketplaceProviderId,
        providerListingId: string,
        sku: string | null,
        token: string | null
    ): Promise<ListingEntitlementGate> {
        const suffix = sku ? `?sku=${encodeURIComponent(sku)}` : '';
        return get(
            `${ENTITLEMENTS_BASE}/listings/${providerId}/${encodeURIComponent(providerListingId)}${suffix}`,
            token
        );
    },
};

// =============================================================================
// Helpers
// =============================================================================

export function formatCents(cents: number, currency = 'USD'): string {
    if (currency === 'USD') {
        const dollars = Math.floor(cents / 100);
        const remainder = (cents % 100).toString().padStart(2, '0');
        return `$${dollars}.${remainder}`;
    }
    return `${(cents / 100).toFixed(2)} ${currency}`;
}
