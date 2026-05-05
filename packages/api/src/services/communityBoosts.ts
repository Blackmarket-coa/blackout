import crypto from 'node:crypto';
import { computePlatformCommission, type MarketplaceProviderId } from '@blackout/core';
import { db } from '../db/store';
import type {
    CommunityBoostPledgeRecord,
    CommunityBoostPledgeStatus,
    MarketplaceProviderIdString,
} from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { incrementCounter, logEvent } from './marketplaceObservability';

const DEFAULT_PROVIDER: MarketplaceProviderId = 'freeblackmarket';
const MIN_PLEDGE_CENTS = 199;
const MAX_PLEDGE_CENTS = 100_000;
const DEFAULT_PERIOD_DAYS = 30;

// Boost level thresholds — number of active pledges required to unlock
// each level. Mirrors Discord's tiered model with three rungs. Tweakable
// per-community in a future PR by writing into communities.boost_perks.
const BOOST_LEVEL_THRESHOLDS = [2, 7, 14] as const;

export class CommunityBoostError extends Error {
    constructor(
        public readonly code:
            | 'amount_out_of_range'
            | 'invalid_currency'
            | 'community_unknown'
            | 'pledger_unknown'
            | 'already_pledged'
            | 'pledge_not_found'
            | 'forbidden',
        message: string
    ) {
        super(message);
        this.name = 'CommunityBoostError';
    }
}

export interface PledgeView {
    id: string;
    communityId: string;
    pledgerUserId: string;
    monthlyCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    providerId: MarketplaceProviderId;
    fbmSubscriptionId: string | null;
    status: CommunityBoostPledgeStatus;
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

function nowIso(): string {
    return new Date().toISOString();
}

function periodEnd(fromIso: string, days = DEFAULT_PERIOD_DAYS): string {
    return new Date(new Date(fromIso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function toView(record: CommunityBoostPledgeRecord): PledgeView {
    return {
        id: record.id,
        communityId: record.communityId,
        pledgerUserId: record.pledgerUserId,
        monthlyCents: record.monthlyCents,
        feeCents: record.feeCents,
        netCents: record.netCents,
        currency: record.currency,
        providerId: record.providerId as MarketplaceProviderId,
        fbmSubscriptionId: record.fbmSubscriptionId,
        status: record.status,
        startedAt: record.startedAt,
        currentPeriodEndsAt: record.currentPeriodEndsAt,
        canceledAt: record.canceledAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

function levelFor(activeCount: number): number {
    let level = 0;
    for (const threshold of BOOST_LEVEL_THRESHOLDS) {
        if (activeCount >= threshold) level += 1;
    }
    return level;
}

function nextThreshold(activeCount: number): { next: number | null; remaining: number | null } {
    for (const threshold of BOOST_LEVEL_THRESHOLDS) {
        if (activeCount < threshold) {
            return { next: threshold, remaining: threshold - activeCount };
        }
    }
    return { next: null, remaining: null };
}

export interface PledgeBoostInput {
    communityId: string;
    pledgerUserId: string;
    monthlyCents: number;
    currency: string;
    providerId?: MarketplaceProviderId;
}

// Records a pending boost pledge with the 3% split. Captured by the
// marketplace webhook when FBM confirms the recurring purchase.
export function pledgeBoost(input: PledgeBoostInput): PledgeView {
    if (
        !Number.isInteger(input.monthlyCents) ||
        input.monthlyCents < MIN_PLEDGE_CENTS ||
        input.monthlyCents > MAX_PLEDGE_CENTS
    ) {
        throw new CommunityBoostError(
            'amount_out_of_range',
            `monthlyCents must be between ${MIN_PLEDGE_CENTS} and ${MAX_PLEDGE_CENTS}`
        );
    }
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3,8}$/.test(currency)) {
        throw new CommunityBoostError('invalid_currency', 'currency must be a 3–8 letter code');
    }
    if (!db.getUserById(input.pledgerUserId)) {
        throw new CommunityBoostError('pledger_unknown', 'pledger user does not exist');
    }
    if (db.findActiveBoostPledgeForUser(input.communityId, input.pledgerUserId)) {
        throw new CommunityBoostError(
            'already_pledged',
            'You already have an active boost pledge for this community'
        );
    }

    const providerId = (input.providerId ?? DEFAULT_PROVIDER) as MarketplaceProviderIdString;
    const split = computePlatformCommission(
        input.monthlyCents,
        providerId as MarketplaceProviderId
    );

    const ts = nowIso();
    const record: CommunityBoostPledgeRecord = {
        id: crypto.randomUUID(),
        communityId: input.communityId,
        pledgerUserId: input.pledgerUserId,
        monthlyCents: split.grossCents,
        feeCents: split.feeCents,
        netCents: split.netCents,
        currency,
        providerId,
        fbmSubscriptionId: null,
        status: 'pending',
        startedAt: null,
        currentPeriodEndsAt: null,
        canceledAt: null,
        createdAt: ts,
        updatedAt: ts,
    };
    db.insertCommunityBoostPledge(record);
    incrementCounter('community_boost_pledged_total', { providerId });
    logEvent('community_boost.pledge.created', {
        pledgeId: record.id,
        communityId: record.communityId,
        pledgerUserId: record.pledgerUserId,
        monthlyCents: record.monthlyCents,
    });
    return toView(record);
}

// Webhook hook — activates a pending pledge or extends an active one's
// period. Idempotent: if currentPeriodEndsAt is already past `effectiveAt
// + days`, leave it alone.
export function captureBoostPledge(
    pledgeId: string,
    detail: {
        fbmSubscriptionId?: string | null;
        periodDays?: number;
        effectiveAt?: string;
    } = {}
): PledgeView | undefined {
    const existing = db.getCommunityBoostPledge(pledgeId);
    if (!existing) return undefined;
    if (existing.status === 'refunded' || existing.status === 'expired') {
        return toView(existing);
    }
    const effectiveAt = detail.effectiveAt ?? nowIso();
    const days = detail.periodDays ?? DEFAULT_PERIOD_DAYS;
    const newPeriodEnd = periodEnd(effectiveAt, days);
    const becameActive = existing.status !== 'active';
    const updated: CommunityBoostPledgeRecord = {
        ...existing,
        status: 'active',
        startedAt: existing.startedAt ?? effectiveAt,
        currentPeriodEndsAt:
            existing.currentPeriodEndsAt && existing.currentPeriodEndsAt > newPeriodEnd
                ? existing.currentPeriodEndsAt
                : newPeriodEnd,
        fbmSubscriptionId: detail.fbmSubscriptionId ?? existing.fbmSubscriptionId,
        canceledAt: null,
        updatedAt: nowIso(),
    };
    db.updateCommunityBoostPledge(updated);
    incrementCounter('community_boost_captured_total', {
        providerId: updated.providerId,
        renewal: becameActive ? 'no' : 'yes',
    });
    emitDomainEvent({
        module: 'monetization',
        type: becameActive ? 'community_boost.activated' : 'community_boost.renewed',
        payload: {
            pledgeId: updated.id,
            communityId: updated.communityId,
            pledgerUserId: updated.pledgerUserId,
            currentPeriodEndsAt: updated.currentPeriodEndsAt,
            boostLevel: getCommunityBoostState(updated.communityId).boostLevel,
        },
    });
    return toView(updated);
}

export function cancelBoostPledge(
    pledgeId: string,
    actorUserId: string
): PledgeView | undefined {
    const existing = db.getCommunityBoostPledge(pledgeId);
    if (!existing) return undefined;
    if (existing.pledgerUserId !== actorUserId) {
        throw new CommunityBoostError('forbidden', 'only the pledger can cancel');
    }
    if (existing.status === 'canceled' || existing.status === 'refunded' || existing.status === 'expired') {
        return toView(existing);
    }
    const updated: CommunityBoostPledgeRecord = {
        ...existing,
        status: 'canceled',
        canceledAt: nowIso(),
        updatedAt: nowIso(),
    };
    db.updateCommunityBoostPledge(updated);
    emitDomainEvent({
        module: 'monetization',
        type: 'community_boost.canceled',
        payload: {
            pledgeId: updated.id,
            communityId: updated.communityId,
            pledgerUserId: updated.pledgerUserId,
            boostLevel: getCommunityBoostState(updated.communityId).boostLevel,
        },
    });
    return toView(updated);
}

export function refundBoostPledge(pledgeId: string): PledgeView | undefined {
    const existing = db.getCommunityBoostPledge(pledgeId);
    if (!existing) return undefined;
    if (existing.status === 'refunded') return toView(existing);
    const updated: CommunityBoostPledgeRecord = {
        ...existing,
        status: 'refunded',
        canceledAt: existing.canceledAt ?? nowIso(),
        updatedAt: nowIso(),
    };
    db.updateCommunityBoostPledge(updated);
    emitDomainEvent({
        module: 'monetization',
        type: 'community_boost.refunded',
        payload: {
            pledgeId: updated.id,
            communityId: updated.communityId,
            pledgerUserId: updated.pledgerUserId,
            boostLevel: getCommunityBoostState(updated.communityId).boostLevel,
        },
    });
    return toView(updated);
}

// Read-side aggregator. Computes boost level from the count of active
// pledges with non-expired current_period_ends_at. Cheap because pledge
// volume per community is small; cache via communities.boost_level if
// hot path needs it later.
export function getCommunityBoostState(
    communityId: string,
    nowMillis: number = Date.now()
): CommunityBoostState {
    const pledges = db.listBoostPledgesForCommunity(communityId);
    let activeCount = 0;
    let monthlyGross = 0;
    let monthlyNet = 0;
    for (const p of pledges) {
        if (p.status !== 'active') continue;
        if (!p.currentPeriodEndsAt) continue;
        if (new Date(p.currentPeriodEndsAt).getTime() <= nowMillis) continue;
        activeCount += 1;
        monthlyGross += p.monthlyCents;
        monthlyNet += p.netCents;
    }
    const { next, remaining } = nextThreshold(activeCount);
    return {
        communityId,
        activePledgeCount: activeCount,
        boostLevel: levelFor(activeCount),
        nextThreshold: next,
        pledgesUntilNextLevel: remaining,
        monthlyGrossCents: monthlyGross,
        monthlyNetCents: monthlyNet,
    };
}

export function listPledgesForCommunity(communityId: string): PledgeView[] {
    return db.listBoostPledgesForCommunity(communityId).map(toView);
}

export function listPledgesForUser(pledgerUserId: string): PledgeView[] {
    return db.listBoostPledgesByUser(pledgerUserId).map(toView);
}

export function getPledge(pledgeId: string): PledgeView | undefined {
    const record = db.getCommunityBoostPledge(pledgeId);
    return record ? toView(record) : undefined;
}

export function resetCommunityBoostsForTest(): void {
    db.resetCommunityBoostsForTest();
}

export const COMMUNITY_BOOST_LIMITS = {
    minPledgeCents: MIN_PLEDGE_CENTS,
    maxPledgeCents: MAX_PLEDGE_CENTS,
    defaultPeriodDays: DEFAULT_PERIOD_DAYS,
    levelThresholds: BOOST_LEVEL_THRESHOLDS,
} as const;
