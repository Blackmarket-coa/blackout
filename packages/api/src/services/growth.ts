/**
 * Growth-engine ledger — referrals, ambassador tiers, quests, migration
 * credits, and bounty rewards.
 *
 * Storage is now durable: every primitive persists through `db/store.ts`
 * exactly like `services/tips.ts` (file-backed by default, write-through to
 * Postgres when `BLACKOUT_DB_MODE=postgres`). This is the attribution backbone
 * behind the creator-driven-sales KPI, so it must survive a restart.
 *
 * The settlement hooks (`markSettled` / `markCompletionSettled` / `settle`)
 * are fired from the tip-capture path in `services/marketplaceWebhook.ts` once
 * the reward tip is captured; they remain idempotent so webhook retries are
 * safe. The record/union types live in `db/types.ts` and are re-exported here
 * so existing importers (`modules/growth.ts`, `services/marketplaceWebhook.ts`,
 * `routes/bounties.ts`) are unaffected.
 */

import type { BountyRewardType } from '@blackout/core';
import { db } from '../db/store';
import type {
    ReferralRecord,
    ReferralSourceKind,
    ReferralStatus,
    AmbassadorRecord,
    AmbassadorTier,
    AmbassadorStatus,
    QuestDefinitionRecord,
    QuestCompletionRecord,
    QuestSourceKind,
    QuestRewardKind,
    MigrationCreditRecord,
    MigrationCreditSourceKind,
    BountyRewardRecord,
    BountyRewardStatus,
} from '../db/types';

export type {
    ReferralRecord,
    ReferralSourceKind,
    ReferralStatus,
    AmbassadorRecord,
    AmbassadorTier,
    AmbassadorStatus,
    QuestDefinitionRecord,
    QuestCompletionRecord,
    QuestSourceKind,
    QuestRewardKind,
    MigrationCreditRecord,
    MigrationCreditSourceKind,
    BountyRewardRecord,
    BountyRewardStatus,
};

const nowIso = (): string => new Date().toISOString();

const randomId = (prefix: string): string =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export class ReferralValidationError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

// ---------------------------------------------------------------- Referrals

export interface CreateReferralInput {
    referrerUserId: string;
    refereeUserId: string;
    sourceKind?: ReferralSourceKind;
    sourceRef?: string | null;
}

class ReferralService {
    create(input: CreateReferralInput): ReferralRecord {
        if (!input.referrerUserId || !input.refereeUserId) {
            throw new ReferralValidationError(
                'invalid_referral',
                'referrer and referee user ids are required',
            );
        }
        if (input.referrerUserId === input.refereeUserId) {
            throw new ReferralValidationError('self_referral', 'self-referrals are not allowed');
        }
        // Each referee can only be referred once. We enforce here so
        // re-clicked invite links don't double-credit.
        const existing = db.findReferralByReferee(input.refereeUserId);
        if (existing) return existing;
        const ts = nowIso();
        const record: ReferralRecord = {
            id: randomId('ref'),
            referrerUserId: input.referrerUserId,
            refereeUserId: input.refereeUserId,
            sourceKind: input.sourceKind ?? 'invite_link',
            sourceRef: input.sourceRef ?? null,
            status: 'pending',
            rewardTipId: null,
            rewardCents: null,
            attributedAt: ts,
            settledAt: null,
            createdAt: ts,
            updatedAt: ts,
        };
        return db.insertReferral(record);
    }

    get(id: string): ReferralRecord | undefined {
        return db.getReferral(id);
    }

    listForReferrer(userId: string): ReferralRecord[] {
        return db.listReferralsByReferrer(userId);
    }

    findByReferee(userId: string): ReferralRecord | undefined {
        return db.findReferralByReferee(userId);
    }

    /**
     * Settles a referral once the marketplace webhook reports the
     * reward tip captured. Idempotent: a referral already in `settled`
     * is returned unchanged so webhook retries are safe.
     */
    markSettled(
        referralId: string,
        params: { rewardTipId: string; rewardCents?: number | null; settledAt?: string },
    ): ReferralRecord | undefined {
        const record = db.getReferral(referralId);
        if (!record) return undefined;
        if (record.status === 'settled') return record;
        const ts = nowIso();
        const updated: ReferralRecord = {
            ...record,
            status: 'settled',
            rewardTipId: params.rewardTipId,
            rewardCents: params.rewardCents ?? record.rewardCents,
            settledAt: params.settledAt ?? ts,
            updatedAt: ts,
        };
        return db.updateReferral(updated);
    }

    /** Test-only reset; matches the hook every other ledger service exposes. */
    resetForTest(): void {
        db.resetReferralsForTest();
    }
}

export const referralService = new ReferralService();

// ---------------------------------------------------------------- Ambassadors

export interface ApplyAmbassadorInput {
    userId: string;
    tier?: AmbassadorTier;
}

const DEFAULT_TIER_COMMISSION_BPS: Record<AmbassadorTier, number> = {
    seedling: 100,
    sapling: 200,
    canopy: 300,
    elder: 500,
};

class AmbassadorService {
    apply(input: ApplyAmbassadorInput): AmbassadorRecord {
        if (!input.userId) {
            throw new ReferralValidationError('invalid_user', 'userId is required');
        }
        const existing = db.findAmbassadorByUser(input.userId);
        if (existing) return existing;
        const tier = input.tier ?? 'seedling';
        const ts = nowIso();
        const record: AmbassadorRecord = {
            id: randomId('amb'),
            userId: input.userId,
            tier,
            commissionBps: DEFAULT_TIER_COMMISSION_BPS[tier],
            quotaCanopiesActive: 0,
            status: 'pending',
            startedAt: ts,
            lastReviewedAt: ts,
            createdAt: ts,
            updatedAt: ts,
        };
        return db.insertAmbassador(record);
    }

    get(id: string): AmbassadorRecord | undefined {
        return db.getAmbassador(id);
    }

    findByUser(userId: string): AmbassadorRecord | undefined {
        return db.findAmbassadorByUser(userId);
    }

    /** Promotes an ambassador to a new tier; returns the updated record. */
    promote(userId: string, tier: AmbassadorTier): AmbassadorRecord | undefined {
        const record = db.findAmbassadorByUser(userId);
        if (!record) return undefined;
        const ts = nowIso();
        const updated: AmbassadorRecord = {
            ...record,
            tier,
            commissionBps: DEFAULT_TIER_COMMISSION_BPS[tier],
            lastReviewedAt: ts,
            updatedAt: ts,
        };
        return db.updateAmbassador(updated);
    }

    resetForTest(): void {
        db.resetAmbassadorsForTest();
    }
}

export const ambassadorService = new AmbassadorService();

// ---------------------------------------------------------------- Quests

export interface CreateQuestInput {
    sourceKind: QuestSourceKind;
    sourceRef?: string | null;
    title: string;
    description: string;
    rewardKind: QuestRewardKind;
    rewardCents: number;
    startsAt?: string | null;
    endsAt?: string | null;
    criteria?: Record<string, unknown>;
}

class QuestsService {
    create(input: CreateQuestInput): QuestDefinitionRecord {
        if (!input.title || !input.description) {
            throw new ReferralValidationError(
                'invalid_quest',
                'title and description are required',
            );
        }
        if (!Number.isFinite(input.rewardCents) || input.rewardCents < 0) {
            throw new ReferralValidationError(
                'invalid_reward',
                'rewardCents must be a non-negative integer',
            );
        }
        const ts = nowIso();
        const record: QuestDefinitionRecord = {
            id: randomId('qst'),
            sourceKind: input.sourceKind,
            sourceRef: input.sourceRef ?? null,
            title: input.title,
            description: input.description,
            rewardKind: input.rewardKind,
            rewardCents: Math.floor(input.rewardCents),
            startsAt: input.startsAt ?? null,
            endsAt: input.endsAt ?? null,
            criteria: input.criteria ?? {},
            createdAt: ts,
            updatedAt: ts,
        };
        return db.insertQuest(record);
    }

    get(id: string): QuestDefinitionRecord | undefined {
        return db.getQuest(id);
    }

    list(filter: { sourceKind?: QuestSourceKind; activeAt?: Date } = {}): QuestDefinitionRecord[] {
        const activeAtMs = filter.activeAt?.getTime();
        return db.listQuests().filter((quest) => {
            if (filter.sourceKind && quest.sourceKind !== filter.sourceKind) return false;
            if (activeAtMs !== undefined) {
                if (quest.startsAt && Date.parse(quest.startsAt) > activeAtMs) return false;
                if (quest.endsAt && Date.parse(quest.endsAt) < activeAtMs) return false;
            }
            return true;
        });
    }

    /**
     * Records that a user completed a quest. Each user can complete a
     * given quest at most once until the tip-settlement integration
     * lands and we get richer state (cooldowns, tiers, etc.). Returns
     * the existing completion if already claimed.
     */
    complete(questId: string, userId: string): QuestCompletionRecord {
        const definition = db.getQuest(questId);
        if (!definition) {
            throw new ReferralValidationError('quest_not_found', 'quest not found');
        }
        const existing = db.getQuestCompletion(questId, userId);
        if (existing) return existing;
        const record: QuestCompletionRecord = {
            id: randomId('cmp'),
            questId,
            userId,
            rewardTipId: null,
            completedAt: nowIso(),
        };
        return db.insertQuestCompletion(record);
    }

    listCompletionsForUser(userId: string): QuestCompletionRecord[] {
        return db.listQuestCompletionsByUser(userId);
    }

    /**
     * Records the reward tip id on a completion once the marketplace
     * webhook reports the reward settled. Idempotent: a completion that
     * already has a `rewardTipId` is returned unchanged.
     */
    markCompletionSettled(
        completionId: string,
        params: { rewardTipId: string },
    ): QuestCompletionRecord | undefined {
        const record = db.getQuestCompletionById(completionId);
        if (!record) return undefined;
        if (record.rewardTipId) return record;
        const updated: QuestCompletionRecord = {
            ...record,
            rewardTipId: params.rewardTipId,
        };
        return db.updateQuestCompletion(updated);
    }

    resetForTest(): void {
        db.resetQuestsForTest();
    }
}

export const questsService = new QuestsService();

// ---------------------------------------------------------------- Migration credits

export interface IssueMigrationCreditInput {
    userId: string;
    sourceKind: MigrationCreditSourceKind;
    sourceHandle?: string;
    valueCents: number;
    currency?: string;
}

class MigrationCreditService {
    /**
     * Issues a migration credit. Idempotent on (userId, sourceKind,
     * sourceHandle): re-importing the same Discord/Twitch handle for
     * the same user returns the existing credit.
     */
    issue(input: IssueMigrationCreditInput): MigrationCreditRecord {
        if (!input.userId) {
            throw new ReferralValidationError('invalid_user', 'userId is required');
        }
        if (!Number.isFinite(input.valueCents) || input.valueCents < 0) {
            throw new ReferralValidationError(
                'invalid_value',
                'valueCents must be a non-negative integer',
            );
        }
        const handle = input.sourceHandle?.trim() || null;
        const existing = db.findMigrationCredit(input.userId, input.sourceKind, handle);
        if (existing) return existing;
        const ts = nowIso();
        const record: MigrationCreditRecord = {
            id: randomId('mig'),
            userId: input.userId,
            fbmCreditId: null,
            sourceKind: input.sourceKind,
            sourceHandle: handle,
            valueCents: Math.floor(input.valueCents),
            currency: (input.currency ?? 'USD').toUpperCase(),
            grantedAt: ts,
            redeemedAt: null,
            createdAt: ts,
            updatedAt: ts,
        };
        return db.insertMigrationCredit(record);
    }

    redeem(id: string, userId: string): MigrationCreditRecord {
        const record = db.getMigrationCredit(id);
        if (!record || record.userId !== userId) {
            throw new ReferralValidationError(
                'credit_not_found',
                'migration credit not found',
            );
        }
        if (record.redeemedAt) return record;
        const ts = nowIso();
        const updated: MigrationCreditRecord = {
            ...record,
            redeemedAt: ts,
            updatedAt: ts,
        };
        return db.updateMigrationCredit(updated);
    }

    listForUser(userId: string): MigrationCreditRecord[] {
        return db.listMigrationCreditsByUser(userId);
    }

    resetForTest(): void {
        db.resetMigrationCreditsForTest();
    }
}

export const migrationCreditService = new MigrationCreditService();

// ---------------------------------------------------------------- Bounty rewards

export interface RecordBountyRewardInput {
    bountyId: string;
    beneficiaryId: string;
    posterId: string;
    rewardType: BountyRewardType;
    rewardSummary: string;
    rewardCents?: number | null;
}

export interface BountyRewardSummary {
    count: number;
    earnedCents: number;
    settledCents: number;
}

/**
 * Append-only ledger of bounty rewards earned on completion. Keyed by bounty id
 * (one reward per bounty) so marking a bounty completed twice never
 * double-credits. Records the economic truth (who earned what for which bounty);
 * the actual payout settlement (tip / FBM credit) flips `status` to `settled`
 * via `settle`, exactly as `referralService.markSettled` does.
 */
class BountyRewardService {
    record(input: RecordBountyRewardInput): BountyRewardRecord {
        const existing = db.getBountyRewardByBounty(input.bountyId);
        if (existing) return existing;
        const record: BountyRewardRecord = {
            id: randomId('brw'),
            bountyId: input.bountyId,
            beneficiaryId: input.beneficiaryId,
            posterId: input.posterId,
            rewardType: input.rewardType,
            rewardSummary: input.rewardSummary,
            rewardCents: input.rewardCents ?? null,
            status: 'earned',
            earnedAt: nowIso(),
            settledAt: null,
            settledRef: null,
        };
        return db.insertBountyReward(record);
    }

    get(bountyId: string): BountyRewardRecord | undefined {
        return db.getBountyRewardByBounty(bountyId);
    }

    listForBeneficiary(userId: string): BountyRewardRecord[] {
        return db.listBountyRewardsByBeneficiary(userId);
    }

    summaryForBeneficiary(userId: string): BountyRewardSummary {
        let count = 0;
        let earnedCents = 0;
        let settledCents = 0;
        for (const record of db.listBountyRewardsByBeneficiary(userId)) {
            if (record.status === 'voided') continue;
            count += 1;
            const cents = record.rewardCents ?? 0;
            earnedCents += cents;
            if (record.status === 'settled') settledCents += cents;
        }
        return { count, earnedCents, settledCents };
    }

    /** Idempotent settlement hook (mirrors `referralService.markSettled`). */
    settle(
        bountyId: string,
        params: { ref: string; settledAt?: string },
    ): BountyRewardRecord | undefined {
        const record = db.getBountyRewardByBounty(bountyId);
        if (!record) return undefined;
        if (record.status === 'settled') return record;
        const updated: BountyRewardRecord = {
            ...record,
            status: 'settled',
            settledRef: params.ref,
            settledAt: params.settledAt ?? nowIso(),
        };
        return db.updateBountyReward(updated);
    }

    resetForTest(): void {
        db.resetBountyRewardsForTest();
    }
}

export const bountyRewardService = new BountyRewardService();

/** Convenience aggregator used across the integration suite. */
export const resetGrowthForTest = (): void => {
    referralService.resetForTest();
    ambassadorService.resetForTest();
    questsService.resetForTest();
    migrationCreditService.resetForTest();
    bountyRewardService.resetForTest();
};
