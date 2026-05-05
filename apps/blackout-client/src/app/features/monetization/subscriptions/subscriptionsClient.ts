import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';

const SUBS_BASE = '/v1/subscriptions';

export type SubscriptionTier = 'free' | 'sprout' | 'canopy_pro';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface SubscriptionSummary {
    userId: string;
    tier: SubscriptionTier;
    planCode: string;
    status: SubscriptionStatus;
    comped: boolean;
    entitlementActive: boolean;
    currentPeriodEndsAt: string | null;
}

export type GiftStatus = 'pending' | 'claimed' | 'forwarded' | 'expired';

export interface GiftSummary {
    id: string;
    donorUserId: string;
    donorPlanCode: string;
    donorTier: 'sprout' | 'canopy_pro';
    status: GiftStatus;
    claimedByUserId: string | null;
    claimedAt: string | null;
    forwardedToGiftId: string | null;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    rootGiftId: string;
    chainDepth: number;
}

async function getJson<T>(path: string): Promise<T> {
    return createAuthorizedApiClient(readBlackoutApiToken())({ method: 'GET', path });
}

async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
    return createAuthorizedApiClient(readBlackoutApiToken())({ method: 'POST', path, body });
}

export async function fetchMySubscription(): Promise<SubscriptionSummary> {
    const response = await getJson<{ subscription: SubscriptionSummary }>(`${SUBS_BASE}/me`);
    return response.subscription;
}

export async function fetchAvailableGifts(limit = 25): Promise<GiftSummary[]> {
    const response = await getJson<{ gifts: GiftSummary[] }>(`${SUBS_BASE}/forward/available?limit=${limit}`);
    return response.gifts;
}

export async function fetchMyGifts(): Promise<{ donated: GiftSummary[]; received: GiftSummary[] }> {
    return getJson<{ donated: GiftSummary[]; received: GiftSummary[] }>(`${SUBS_BASE}/forward/me`);
}

export async function donateForward(): Promise<GiftSummary> {
    const response = await postJson<{ ok: boolean; gift: GiftSummary }>(`${SUBS_BASE}/forward`);
    return response.gift;
}

export async function claimGift(giftId: string): Promise<{ gift: GiftSummary; subscription: SubscriptionSummary }> {
    const response = await postJson<{ ok: boolean; gift: GiftSummary; subscription: SubscriptionSummary }>(
        `${SUBS_BASE}/forward/${encodeURIComponent(giftId)}/claim`,
    );
    return { gift: response.gift, subscription: response.subscription };
}

export async function passGift(giftId: string): Promise<{ previous: GiftSummary; next: GiftSummary }> {
    const response = await postJson<{ ok: boolean; previous: GiftSummary; next: GiftSummary }>(
        `${SUBS_BASE}/forward/${encodeURIComponent(giftId)}/pass`,
    );
    return { previous: response.previous, next: response.next };
}
