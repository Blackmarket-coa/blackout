/**
 * In-memory growth-engine ledger primitives — referrals, ambassador
 * tiers, quests. Mirrors the precedent set by `services/discovery.ts`:
 * data lives in-process, no `db/store.ts` extension. PR 5 ships only
 * the read/write surfaces; tip-attribution / commission settlement /
 * webhook dispatcher integration is deferred to a follow-up so the
 * client surfaces have a stable ledger to integrate against.
 */

const nowIso = (): string => new Date().toISOString();

const randomId = (prefix: string): string =>
    `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

// ---------------------------------------------------------------- Referrals

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
    /** Optional context — campaign id, ambassador id, etc. */
    sourceRef: string | null;
    status: ReferralStatus;
    /** Settled tip id (set when the reward fires; deferred to PR 5b). */
    rewardTipId: string | null;
    rewardCents: number | null;
    attributedAt: string;
    settledAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateReferralInput {
    referrerUserId: string;
    refereeUserId: string;
    sourceKind?: ReferralSourceKind;
    sourceRef?: string | null;
}

export class ReferralValidationError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

class ReferralService {
    private records = new Map<string, ReferralRecord>();

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
        for (const existing of this.records.values()) {
            if (existing.refereeUserId === input.refereeUserId) {
                return existing;
            }
        }
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
        this.records.set(record.id, record);
        return record;
    }

    get(id: string): ReferralRecord | undefined {
        return this.records.get(id);
    }

    listForReferrer(userId: string): ReferralRecord[] {
        return [...this.records.values()].filter(
            (record) => record.referrerUserId === userId,
        );
    }

    findByReferee(userId: string): ReferralRecord | undefined {
        for (const record of this.records.values()) {
            if (record.refereeUserId === userId) return record;
        }
        return undefined;
    }

    /** Test-only reset; matches the hook every other in-memory service exposes. */
    resetForTest(): void {
        this.records.clear();
    }
}

export const referralService = new ReferralService();

// ---------------------------------------------------------------- Ambassadors

export type AmbassadorTier = 'seedling' | 'sapling' | 'canopy' | 'elder';
export type AmbassadorStatus = 'pending' | 'active' | 'paused' | 'archived';

export interface AmbassadorRecord {
    id: string;
    userId: string;
    tier: AmbassadorTier;
    /** Commission percentage (basis points; 300 = 3%). */
    commissionBps: number;
    quotaCanopiesActive: number;
    status: AmbassadorStatus;
    startedAt: string;
    lastReviewedAt: string;
    createdAt: string;
    updatedAt: string;
}

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
    private records = new Map<string, AmbassadorRecord>();
    private byUserId = new Map<string, string>();

    apply(input: ApplyAmbassadorInput): AmbassadorRecord {
        if (!input.userId) {
            throw new ReferralValidationError('invalid_user', 'userId is required');
        }
        const existingId = this.byUserId.get(input.userId);
        if (existingId) {
            const existing = this.records.get(existingId);
            if (existing) return existing;
        }
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
        this.records.set(record.id, record);
        this.byUserId.set(record.userId, record.id);
        return record;
    }

    get(id: string): AmbassadorRecord | undefined {
        return this.records.get(id);
    }

    findByUser(userId: string): AmbassadorRecord | undefined {
        const id = this.byUserId.get(userId);
        if (!id) return undefined;
        return this.records.get(id);
    }

    /** Promotes an ambassador to a new tier; returns the updated record. */
    promote(userId: string, tier: AmbassadorTier): AmbassadorRecord | undefined {
        const record = this.findByUser(userId);
        if (!record) return undefined;
        const updated: AmbassadorRecord = {
            ...record,
            tier,
            commissionBps: DEFAULT_TIER_COMMISSION_BPS[tier],
            lastReviewedAt: nowIso(),
            updatedAt: nowIso(),
        };
        this.records.set(record.id, updated);
        return updated;
    }

    resetForTest(): void {
        this.records.clear();
        this.byUserId.clear();
    }
}

export const ambassadorService = new AmbassadorService();

// ---------------------------------------------------------------- Quests

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
    /** Free-form, opaque criteria payload — interpreted by callers. */
    criteria: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

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

export interface QuestCompletionRecord {
    id: string;
    questId: string;
    userId: string;
    /** Set when the reward tip is recorded; deferred to PR 5b. */
    rewardTipId: string | null;
    completedAt: string;
}

class QuestsService {
    private definitions = new Map<string, QuestDefinitionRecord>();
    private completions = new Map<string, QuestCompletionRecord>();

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
        this.definitions.set(record.id, record);
        return record;
    }

    get(id: string): QuestDefinitionRecord | undefined {
        return this.definitions.get(id);
    }

    list(filter: { sourceKind?: QuestSourceKind; activeAt?: Date } = {}): QuestDefinitionRecord[] {
        const activeAtMs = filter.activeAt?.getTime();
        return [...this.definitions.values()].filter((quest) => {
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
        const definition = this.definitions.get(questId);
        if (!definition) {
            throw new ReferralValidationError('quest_not_found', 'quest not found');
        }
        const compositeKey = `${questId}:${userId}`;
        const existing = this.completions.get(compositeKey);
        if (existing) return existing;
        const record: QuestCompletionRecord = {
            id: randomId('cmp'),
            questId,
            userId,
            rewardTipId: null,
            completedAt: nowIso(),
        };
        this.completions.set(compositeKey, record);
        return record;
    }

    listCompletionsForUser(userId: string): QuestCompletionRecord[] {
        return [...this.completions.values()].filter((c) => c.userId === userId);
    }

    resetForTest(): void {
        this.definitions.clear();
        this.completions.clear();
    }
}

export const questsService = new QuestsService();

// ---------------------------------------------------------------- Migration credits

export type MigrationCreditSourceKind =
    | 'discord_migration'
    | 'twitch_migration'
    | 'creator_invite'
    | 'campaign';

export interface MigrationCreditRecord {
    id: string;
    userId: string;
    /** FBM coupon id once issued (deferred — null until webhook lands). */
    fbmCreditId: string | null;
    sourceKind: MigrationCreditSourceKind;
    /** Optional handle on the source platform. */
    sourceHandle: string | null;
    /** Credit value in cents. */
    valueCents: number;
    currency: string;
    grantedAt: string;
    redeemedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface IssueMigrationCreditInput {
    userId: string;
    sourceKind: MigrationCreditSourceKind;
    sourceHandle?: string;
    valueCents: number;
    currency?: string;
}

class MigrationCreditService {
    private records = new Map<string, MigrationCreditRecord>();

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
        for (const existing of this.records.values()) {
            if (
                existing.userId === input.userId &&
                existing.sourceKind === input.sourceKind &&
                existing.sourceHandle === handle
            ) {
                return existing;
            }
        }
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
        this.records.set(record.id, record);
        return record;
    }

    redeem(id: string, userId: string): MigrationCreditRecord {
        const record = this.records.get(id);
        if (!record || record.userId !== userId) {
            throw new ReferralValidationError(
                'credit_not_found',
                'migration credit not found',
            );
        }
        if (record.redeemedAt) return record;
        const updated: MigrationCreditRecord = {
            ...record,
            redeemedAt: nowIso(),
            updatedAt: nowIso(),
        };
        this.records.set(record.id, updated);
        return updated;
    }

    listForUser(userId: string): MigrationCreditRecord[] {
        return [...this.records.values()].filter((record) => record.userId === userId);
    }

    resetForTest(): void {
        this.records.clear();
    }
}

export const migrationCreditService = new MigrationCreditService();

/** Convenience aggregator used by `module-bootstrap.integration.test.ts`. */
export const resetGrowthForTest = (): void => {
    referralService.resetForTest();
    ambassadorService.resetForTest();
    questsService.resetForTest();
    migrationCreditService.resetForTest();
};
