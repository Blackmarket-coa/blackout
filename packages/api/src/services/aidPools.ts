import crypto from 'node:crypto';
import { db } from '../db/store';
import type { AidPoolRecord, AidPoolStatus, TipRecord } from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { incrementCounter, logEvent } from './marketplaceObservability';
import { createTip, TipValidationError, type TipView } from './tips';

const MIN_GOAL_CENTS = 100;
const MAX_GOAL_CENTS = 100_000_000; // $1M ceiling per pool.
const MAX_TITLE_LEN = 255;
const MAX_DESCRIPTION_LEN = 4_000;

export class AidPoolError extends Error {
    constructor(
        public readonly code:
            | 'organizer_unknown'
            | 'goal_out_of_range'
            | 'invalid_currency'
            | 'title_required'
            | 'pool_not_found'
            | 'pool_closed'
            | 'forbidden'
            | 'tip_failed',
        message: string
    ) {
        super(message);
        this.name = 'AidPoolError';
    }
}

export interface AidPoolView {
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

function nowIso(): string {
    return new Date().toISOString();
}

function aggregate(poolId: string, currency: string): {
    raised: number;
    fee: number;
    net: number;
    count: number;
    uniqueSenders: number;
} {
    let raised = 0;
    let fee = 0;
    let net = 0;
    let count = 0;
    const senders = new Set<string>();
    for (const tip of db.tips.values() as IterableIterator<TipRecord>) {
        if (tip.contextKind !== 'aid_pool') continue;
        if (tip.contextRef !== poolId) continue;
        if (tip.status !== 'captured') continue;
        if (tip.currency !== currency) continue;
        raised += tip.grossCents;
        fee += tip.feeCents;
        net += tip.netCents;
        count += 1;
        senders.add(tip.senderUserId);
    }
    return { raised, fee, net, count, uniqueSenders: senders.size };
}

function toView(record: AidPoolRecord): AidPoolView {
    const agg = aggregate(record.id, record.currency);
    const percent =
        record.goalCents <= 0
            ? 100
            : Math.min(100, Math.round((agg.raised / record.goalCents) * 100));
    return {
        id: record.id,
        organizerUserId: record.organizerUserId,
        title: record.title,
        description: record.description,
        goalCents: record.goalCents,
        currency: record.currency,
        status: record.status,
        raisedCents: agg.raised,
        feeCents: agg.fee,
        netCents: agg.net,
        contributionCount: agg.count,
        uniqueContributorCount: agg.uniqueSenders,
        percent,
        createdAt: record.createdAt,
        fulfilledAt: record.fulfilledAt,
        closedAt: record.closedAt,
    };
}

export interface CreateAidPoolInput {
    organizerUserId: string;
    title: string;
    description?: string | null;
    goalCents: number;
    currency: string;
}

export function createAidPool(input: CreateAidPoolInput): AidPoolView {
    if (!db.getUserById(input.organizerUserId)) {
        throw new AidPoolError('organizer_unknown', 'organizer user does not exist');
    }
    if (!input.title || input.title.trim().length === 0 || input.title.length > MAX_TITLE_LEN) {
        throw new AidPoolError('title_required', `title must be 1-${MAX_TITLE_LEN} characters`);
    }
    if (
        !Number.isInteger(input.goalCents) ||
        input.goalCents < MIN_GOAL_CENTS ||
        input.goalCents > MAX_GOAL_CENTS
    ) {
        throw new AidPoolError(
            'goal_out_of_range',
            `goalCents must be between ${MIN_GOAL_CENTS} and ${MAX_GOAL_CENTS}`
        );
    }
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3,8}$/.test(currency)) {
        throw new AidPoolError('invalid_currency', 'currency must be a 3–8 letter code');
    }
    if (input.description && input.description.length > MAX_DESCRIPTION_LEN) {
        throw new AidPoolError(
            'title_required',
            `description must be at most ${MAX_DESCRIPTION_LEN} characters`
        );
    }

    const ts = nowIso();
    const record: AidPoolRecord = {
        id: crypto.randomUUID(),
        organizerUserId: input.organizerUserId,
        title: input.title.trim(),
        description: input.description ?? null,
        goalCents: input.goalCents,
        currency,
        status: 'open',
        createdAt: ts,
        fulfilledAt: null,
        closedAt: null,
    };
    db.insertAidPool(record);
    incrementCounter('aid_pool_created_total', { currency });
    logEvent('aid_pool.created', {
        poolId: record.id,
        organizerUserId: record.organizerUserId,
        goalCents: record.goalCents,
        currency,
    });
    return toView(record);
}

// Contributes to an aid pool by creating a tip with context_kind=aid_pool.
// Tip captures (via FBM webhook) automatically count toward the pool's
// raised total because aggregate() reads the captured rows.
export interface ContributeToAidPoolInput {
    poolId: string;
    contributorUserId: string;
    amountCents: number;
    note?: string | null;
}

export function contributeToAidPool(input: ContributeToAidPoolInput): {
    tip: TipView;
    pool: AidPoolView;
} {
    const record = db.getAidPool(input.poolId);
    if (!record) {
        throw new AidPoolError('pool_not_found', 'no such aid pool');
    }
    if (record.status === 'closed') {
        throw new AidPoolError('pool_closed', 'this aid pool is closed');
    }
    try {
        const tip = createTip({
            senderUserId: input.contributorUserId,
            recipientUserId: record.organizerUserId,
            contextKind: 'aid_pool',
            contextRef: record.id,
            grossCents: input.amountCents,
            currency: record.currency,
            note: input.note,
        });
        return { tip, pool: toView(record) };
    } catch (error) {
        if (error instanceof TipValidationError) {
            throw new AidPoolError('tip_failed', error.message);
        }
        throw error;
    }
}

export function fulfillAidPool(
    poolId: string,
    actorUserId: string
): AidPoolView | undefined {
    const record = db.getAidPool(poolId);
    if (!record) return undefined;
    if (record.organizerUserId !== actorUserId) {
        throw new AidPoolError('forbidden', 'only the organizer can fulfill a pool');
    }
    if (record.status === 'fulfilled' || record.status === 'closed') {
        return toView(record);
    }
    const updated: AidPoolRecord = {
        ...record,
        status: 'fulfilled',
        fulfilledAt: nowIso(),
    };
    db.updateAidPool(updated);
    emitDomainEvent({
        module: 'monetization',
        type: 'aid_pool.fulfilled',
        payload: {
            poolId: updated.id,
            organizerUserId: updated.organizerUserId,
            goalCents: updated.goalCents,
        },
    });
    return toView(updated);
}

export function closeAidPool(poolId: string, actorUserId: string): AidPoolView | undefined {
    const record = db.getAidPool(poolId);
    if (!record) return undefined;
    if (record.organizerUserId !== actorUserId) {
        throw new AidPoolError('forbidden', 'only the organizer can close a pool');
    }
    if (record.status === 'closed') return toView(record);
    const updated: AidPoolRecord = {
        ...record,
        status: 'closed',
        closedAt: nowIso(),
    };
    db.updateAidPool(updated);
    emitDomainEvent({
        module: 'monetization',
        type: 'aid_pool.closed',
        payload: {
            poolId: updated.id,
            organizerUserId: updated.organizerUserId,
        },
    });
    return toView(updated);
}

export function getAidPool(poolId: string): AidPoolView | undefined {
    const record = db.getAidPool(poolId);
    return record ? toView(record) : undefined;
}

export function listAidPools(): AidPoolView[] {
    return db.listAidPools().map(toView);
}

export function listAidPoolsByOrganizer(organizerUserId: string): AidPoolView[] {
    return db.listAidPoolsByOrganizer(organizerUserId).map(toView);
}

export function resetAidPoolsForTest(): void {
    db.resetAidPoolsForTest();
}

export const AID_POOL_LIMITS = {
    minGoalCents: MIN_GOAL_CENTS,
    maxGoalCents: MAX_GOAL_CENTS,
    maxTitleLength: MAX_TITLE_LEN,
    maxDescriptionLength: MAX_DESCRIPTION_LEN,
} as const;
