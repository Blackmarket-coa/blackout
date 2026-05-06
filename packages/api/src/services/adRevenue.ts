import crypto from 'node:crypto';
import { computePlatformCommission, type MarketplaceProviderId } from '@blackout/core';
import { db } from '../db/store';
import type {
    AdRevenuePeriodRecord,
    AdRevenuePeriodStatus,
    AdRevenueShareRecord,
    AdRevenueShareStatus,
    MarketplaceProviderIdString,
} from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { incrementCounter, logEvent } from './marketplaceObservability';

const DEFAULT_PROVIDER: MarketplaceProviderId = 'freeblackmarket';
const MAX_NOTES_LEN = 2_000;

export class AdRevenueError extends Error {
    constructor(
        public readonly code:
            | 'period_not_found'
            | 'period_window_invalid'
            | 'invalid_currency'
            | 'amount_negative'
            | 'creator_unknown'
            | 'duplicate_creator'
            | 'period_already_allocated'
            | 'totals_exceed_period'
            | 'share_not_found'
            | 'share_not_pending',
        message: string
    ) {
        super(message);
        this.name = 'AdRevenueError';
    }
}

export interface PeriodView {
    id: string;
    periodStart: string;
    periodEnd: string;
    totalCents: number;
    currency: string;
    status: AdRevenuePeriodStatus;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    shareCount: number;
    allocatedGrossCents: number;
    allocatedNetCents: number;
}

export interface ShareView {
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

function nowIso(): string {
    return new Date().toISOString();
}

function toShareView(record: AdRevenueShareRecord): ShareView {
    return {
        id: record.id,
        periodId: record.periodId,
        creatorUserId: record.creatorUserId,
        grossCents: record.grossCents,
        feeCents: record.feeCents,
        netCents: record.netCents,
        currency: record.currency,
        providerId: record.providerId as MarketplaceProviderId,
        fbmPayoutId: record.fbmPayoutId,
        status: record.status,
        computedAt: record.computedAt,
        paidAt: record.paidAt,
    };
}

function toPeriodView(record: AdRevenuePeriodRecord): PeriodView {
    const shares = db.listAdRevenueSharesForPeriod(record.id);
    let gross = 0;
    let net = 0;
    for (const share of shares) {
        gross += share.grossCents;
        net += share.netCents;
    }
    return {
        id: record.id,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        totalCents: record.totalCents,
        currency: record.currency,
        status: record.status,
        notes: record.notes,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        shareCount: shares.length,
        allocatedGrossCents: gross,
        allocatedNetCents: net,
    };
}

export interface CreatePeriodInput {
    periodStart: string;
    periodEnd: string;
    totalCents: number;
    currency: string;
    notes?: string | null;
}

export function createPeriod(input: CreatePeriodInput): PeriodView {
    const start = new Date(input.periodStart).getTime();
    const end = new Date(input.periodEnd).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        throw new AdRevenueError(
            'period_window_invalid',
            'periodEnd must be a valid ISO timestamp after periodStart'
        );
    }
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3,8}$/.test(currency)) {
        throw new AdRevenueError('invalid_currency', 'currency must be a 3–8 letter code');
    }
    if (!Number.isInteger(input.totalCents) || input.totalCents < 0) {
        throw new AdRevenueError('amount_negative', 'totalCents must be a non-negative integer');
    }
    if (input.notes && input.notes.length > MAX_NOTES_LEN) {
        throw new AdRevenueError('amount_negative', `notes must be <= ${MAX_NOTES_LEN} chars`);
    }

    const ts = nowIso();
    const record: AdRevenuePeriodRecord = {
        id: crypto.randomUUID(),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        totalCents: input.totalCents,
        currency,
        status: 'draft',
        notes: input.notes ?? null,
        createdAt: ts,
        updatedAt: ts,
    };
    db.insertAdRevenuePeriod(record);
    incrementCounter('ad_revenue_period_created_total', { currency });
    logEvent('ad_revenue.period.created', {
        periodId: record.id,
        totalCents: record.totalCents,
        currency,
    });
    return toPeriodView(record);
}

export interface AllocationEntry {
    creatorUserId: string;
    grossCents: number;
}

// Allocates the period across creators. Each entry's grossCents passes
// through computePlatformCommission so the 3% fee is recorded per row.
// Idempotency is enforced at the (period_id, creator_user_id) level by
// the unique index — re-running allocate is a deliberate operation that
// throws if the period is no longer 'draft'.
export function allocateShares(
    periodId: string,
    entries: AllocationEntry[],
    providerId: MarketplaceProviderId = DEFAULT_PROVIDER
): { period: PeriodView; shares: ShareView[] } {
    const period = db.getAdRevenuePeriod(periodId);
    if (!period) {
        throw new AdRevenueError('period_not_found', 'no such ad-revenue period');
    }
    if (period.status !== 'draft') {
        throw new AdRevenueError(
            'period_already_allocated',
            'period must be in `draft` to allocate shares'
        );
    }
    const seen = new Set<string>();
    let allocatedGross = 0;
    for (const entry of entries) {
        if (!Number.isInteger(entry.grossCents) || entry.grossCents < 0) {
            throw new AdRevenueError('amount_negative', 'grossCents must be a non-negative integer');
        }
        if (!db.getUserById(entry.creatorUserId)) {
            throw new AdRevenueError('creator_unknown', `creator ${entry.creatorUserId} does not exist`);
        }
        if (seen.has(entry.creatorUserId)) {
            throw new AdRevenueError(
                'duplicate_creator',
                `creator ${entry.creatorUserId} appears twice in the allocation`
            );
        }
        seen.add(entry.creatorUserId);
        allocatedGross += entry.grossCents;
    }
    if (allocatedGross > period.totalCents) {
        throw new AdRevenueError(
            'totals_exceed_period',
            `allocated gross ${allocatedGross} exceeds period total ${period.totalCents}`
        );
    }

    const ts = nowIso();
    const shares: AdRevenueShareRecord[] = [];
    for (const entry of entries) {
        const split = computePlatformCommission(entry.grossCents, providerId);
        const share: AdRevenueShareRecord = {
            id: crypto.randomUUID(),
            periodId,
            creatorUserId: entry.creatorUserId,
            grossCents: split.grossCents,
            feeCents: split.feeCents,
            netCents: split.netCents,
            currency: period.currency,
            providerId: providerId as MarketplaceProviderIdString,
            fbmPayoutId: null,
            status: 'pending_payout',
            computedAt: ts,
            paidAt: null,
        };
        db.insertAdRevenueShare(share);
        shares.push(share);
    }
    const updatedPeriod: AdRevenuePeriodRecord = {
        ...period,
        status: 'allocated',
        updatedAt: ts,
    };
    db.updateAdRevenuePeriod(updatedPeriod);
    incrementCounter('ad_revenue_shares_allocated_total', {
        currency: period.currency,
        count: String(shares.length),
    });
    emitDomainEvent({
        module: 'monetization',
        type: 'ad_revenue.allocated',
        payload: {
            periodId,
            shareCount: shares.length,
            allocatedGross,
        },
    });
    return {
        period: toPeriodView(updatedPeriod),
        shares: shares.map(toShareView),
    };
}

// Marks a share as paid and records the FBM payout id. Flips the parent
// period to `paid` once all shares are paid.
export function markSharePaid(shareId: string, fbmPayoutId: string): ShareView | undefined {
    const share = db.getAdRevenueShare(shareId);
    if (!share) {
        throw new AdRevenueError('share_not_found', 'no such share');
    }
    if (share.status !== 'pending_payout') {
        throw new AdRevenueError('share_not_pending', `share is in ${share.status}`);
    }
    const ts = nowIso();
    const updated: AdRevenueShareRecord = {
        ...share,
        status: 'paid',
        fbmPayoutId,
        paidAt: ts,
    };
    db.updateAdRevenueShare(updated);
    incrementCounter('ad_revenue_share_paid_total', { providerId: updated.providerId });
    emitDomainEvent({
        module: 'monetization',
        type: 'ad_revenue.share.paid',
        payload: {
            shareId: updated.id,
            periodId: updated.periodId,
            creatorUserId: updated.creatorUserId,
            netCents: updated.netCents,
            fbmPayoutId,
        },
    });

    // Roll the period forward if every share is paid.
    const peers = db.listAdRevenueSharesForPeriod(updated.periodId);
    if (peers.every((s) => s.status === 'paid')) {
        const period = db.getAdRevenuePeriod(updated.periodId);
        if (period && period.status === 'allocated') {
            db.updateAdRevenuePeriod({ ...period, status: 'paid', updatedAt: ts });
        }
    }
    return toShareView(updated);
}

export function voidShare(shareId: string): ShareView | undefined {
    const share = db.getAdRevenueShare(shareId);
    if (!share) {
        throw new AdRevenueError('share_not_found', 'no such share');
    }
    if (share.status === 'voided') return toShareView(share);
    const updated: AdRevenueShareRecord = {
        ...share,
        status: 'voided',
        paidAt: share.paidAt,
    };
    db.updateAdRevenueShare(updated);
    return toShareView(updated);
}

export function getPeriod(periodId: string): PeriodView | undefined {
    const record = db.getAdRevenuePeriod(periodId);
    return record ? toPeriodView(record) : undefined;
}

export function listPeriods(): PeriodView[] {
    return db.listAdRevenuePeriods().map(toPeriodView);
}

export function listSharesForPeriod(periodId: string): ShareView[] {
    return db.listAdRevenueSharesForPeriod(periodId).map(toShareView);
}

export function listSharesForCreator(creatorUserId: string): ShareView[] {
    return db.listAdRevenueSharesForCreator(creatorUserId).map(toShareView);
}

export function getShare(shareId: string): ShareView | undefined {
    const record = db.getAdRevenueShare(shareId);
    return record ? toShareView(record) : undefined;
}

export function resetAdRevenueForTest(): void {
    db.resetAdRevenueForTest();
}
