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

// --- Creator-authored quests -----------------------------------------

export interface CreateCreatorQuestInput {
    title: string;
    description: string;
    rewardKind: QuestRewardKind;
    rewardCents: number;
    endsAt?: string | null;
}

/** A quest the caller authored, annotated with how many users completed it. */
export interface MyQuestRecord extends QuestDefinitionRecord {
    completions: number;
}

/**
 * Wraps `POST /v1/growth/quests` for creators. The server forces
 * `sourceKind: 'creator'` and stamps `sourceRef` with the caller, so this
 * only carries the fields a creator can actually set.
 */
export const createCreatorQuest = (
    input: CreateCreatorQuestInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ quest: QuestDefinitionRecord }> =>
    callJson('POST', `${GROWTH_BASE}/quests`, { sourceKind: 'creator', ...input }, token);

/** Wraps `GET /v1/growth/quests/mine` — own quests with completion counts. */
export const fetchMyQuests = (
    token: string | null = readBlackoutApiToken()
): Promise<{ items: MyQuestRecord[] }> =>
    callJson('GET', `${GROWTH_BASE}/quests/mine`, undefined, token);

/** Wraps `POST /v1/growth/quests/:id/end` — end one of the caller's quests now. */
export const endQuest = (
    questId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ quest: QuestDefinitionRecord }> =>
    callJson('POST', `${GROWTH_BASE}/quests/${encodeURIComponent(questId)}/end`, undefined, token);

// --- Migration credits (PR 7) ---------------------------------------

export type MigrationCreditSourceKind =
    | 'discord_migration'
    | 'twitch_migration'
    | 'creator_invite'
    | 'campaign';

export interface MigrationCreditRecord {
    id: string;
    userId: string;
    fbmCreditId: string | null;
    sourceKind: MigrationCreditSourceKind;
    sourceHandle: string | null;
    valueCents: number;
    currency: string;
    grantedAt: string;
    redeemedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export const issueMigrationCredit = (
    input: {
        sourceKind: MigrationCreditSourceKind;
        valueCents: number;
        sourceHandle?: string;
        currency?: string;
    },
    token: string | null = readBlackoutApiToken()
): Promise<{ credit: MigrationCreditRecord }> =>
    callJson('POST', `${GROWTH_BASE}/migration-credits`, input, token);

export const fetchMyMigrationCredits = (
    token: string | null = readBlackoutApiToken()
): Promise<{ items: MigrationCreditRecord[] }> =>
    callJson('GET', `${GROWTH_BASE}/migration-credits/me`, undefined, token);

export const redeemMigrationCredit = (
    id: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ credit: MigrationCreditRecord }> =>
    callJson(
        'POST',
        `${GROWTH_BASE}/migration-credits/${encodeURIComponent(id)}/redeem`,
        undefined,
        token
    );

// ---------------------------------------------------------------- Creator-driven sales (KPI)

export type CreatorDrivenAttributionKind =
    | 'referral_bonus'
    | 'ambassador_commission'
    | 'quest_reward'
    | 'bounty_reward';

export interface CreatorDrivenSalesBucket {
    count: number;
    gmvCents: number;
    feeCents: number;
    netCents: number;
}

export interface CreatorDrivenSalesSummary {
    beneficiaryUserId: string;
    total: CreatorDrivenSalesBucket;
    byKind: Record<CreatorDrivenAttributionKind, CreatorDrivenSalesBucket>;
    sinceIso: string | null;
    generatedAt: string;
}

/**
 * The single KPI for the signed-in creator: sales that happened because they
 * referred, ambassador-drove, quest, or won a bounty. The endpoint returns the
 * summary object directly (count + GMV + fee + net, total and by attribution
 * kind). Optional `sinceIso` scopes to a window (e.g. month-to-date).
 */
export const fetchCreatorDrivenSales = (
    options: { sinceIso?: string } = {},
    token: string | null = readBlackoutApiToken()
): Promise<CreatorDrivenSalesSummary> => {
    const query = options.sinceIso ? `?since=${encodeURIComponent(options.sinceIso)}` : '';
    return callJson('GET', `${GROWTH_BASE}/creator-driven-sales${query}`, undefined, token);
};
