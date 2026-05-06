import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const GROWTH_BASE = '/v1/growth';

export type ReferralSourceKind =
    | 'invite_link'
    | 'ambassador'
    | 'migration_campaign'
    | 'creator_invite';

export type ReferralStatus = 'pending' | 'attributed' | 'settled' | 'voided';

export interface ReferralRecord {
    id: string;
    referrerUserId: string;
    refereeUserId: string;
    sourceKind: ReferralSourceKind;
    sourceRef: string | null;
    status: ReferralStatus;
    rewardTipId: string | null;
    rewardCents: number | null;
    attributedAt: string;
    settledAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export type AmbassadorTier = 'seedling' | 'sapling' | 'canopy' | 'elder';

export interface AmbassadorRecord {
    id: string;
    userId: string;
    tier: AmbassadorTier;
    commissionBps: number;
    quotaCanopiesActive: number;
    status: 'pending' | 'active' | 'paused' | 'archived';
    startedAt: string;
    lastReviewedAt: string;
    createdAt: string;
    updatedAt: string;
}

export type QuestSourceKind = 'system' | 'canopy' | 'creator';
export type QuestRewardKind = 'tip' | 'fbm_credit';

export interface QuestDefinitionRecord {
    id: string;
    sourceKind: QuestSourceKind;
    sourceRef: string | null;
    title: string;
    description: string;
    rewardKind: QuestRewardKind;
    rewardCents: number;
    startsAt: string | null;
    endsAt: string | null;
    criteria: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface QuestCompletionRecord {
    id: string;
    questId: string;
    userId: string;
    rewardTipId: string | null;
    completedAt: string;
}

const callJson = <T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    token: string | null
): Promise<T> => createAuthorizedApiClient(token)({ method, path, body }) as Promise<T>;

export const recordReferral = (
    refereeUserId: string,
    options: { sourceKind?: ReferralSourceKind; sourceRef?: string } = {},
    token: string | null = readBlackoutApiToken()
): Promise<{ referral: ReferralRecord }> =>
    callJson(
        'POST',
        `${GROWTH_BASE}/referrals`,
        { refereeUserId, sourceKind: options.sourceKind, sourceRef: options.sourceRef ?? null },
        token
    );

export const fetchMyReferrals = (
    token: string | null = readBlackoutApiToken()
): Promise<{ items: ReferralRecord[] }> =>
    callJson('GET', `${GROWTH_BASE}/referrals/me`, undefined, token);

export const applyAsAmbassador = (
    options: { tier?: AmbassadorTier } = {},
    token: string | null = readBlackoutApiToken()
): Promise<{ ambassador: AmbassadorRecord }> =>
    callJson('POST', `${GROWTH_BASE}/ambassadors/apply`, { tier: options.tier }, token);

export const fetchMyAmbassador = (
    token: string | null = readBlackoutApiToken()
): Promise<{ ambassador: AmbassadorRecord | null }> =>
    callJson('GET', `${GROWTH_BASE}/ambassadors/me`, undefined, token);

export const fetchActiveQuests = (
    options: { sourceKind?: QuestSourceKind } = {},
    token: string | null = readBlackoutApiToken()
): Promise<{ items: QuestDefinitionRecord[] }> => {
    const path = options.sourceKind
        ? `${GROWTH_BASE}/quests?sourceKind=${encodeURIComponent(options.sourceKind)}`
        : `${GROWTH_BASE}/quests`;
    return callJson('GET', path, undefined, token);
};

export const completeQuest = (
    questId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ completion: QuestCompletionRecord }> =>
    callJson(
        'POST',
        `${GROWTH_BASE}/quests/${encodeURIComponent(questId)}/complete`,
        undefined,
        token
    );

export const fetchMyQuestCompletions = (
    token: string | null = readBlackoutApiToken()
): Promise<{ items: QuestCompletionRecord[] }> =>
    callJson('GET', `${GROWTH_BASE}/quests/me/completions`, undefined, token);
