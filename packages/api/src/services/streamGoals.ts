import { db } from '../db/store';
import type { TipRecord } from '../db/types';
import { dispatchEvent as dispatchOutboundEvent } from './outboundEventWebhooks';
import { log } from '../telemetry/logger';

export interface StreamRevenueBreakdown {
    streamId: string;
    creatorUserId: string | null;
    /** Sum of gross/fee/net across captured tips (including gifts) for this stream. */
    grossCents: number;
    feeCents: number;
    netCents: number;
    /** Total captured tip count (including gifts). */
    tipCount: number;
    /** Of those tips, how many used a gift sku (subset of tipCount). */
    giftCount: number;
    /** Sum of currency keyed by code, in case the stream takes multi-currency tips. */
    byCurrency: Record<string, { grossCents: number; feeCents: number; netCents: number; count: number }>;
    /** Number of distinct senders — useful for hype-train style milestones. */
    uniqueSenderCount: number;
    /** Captured-only — pending and refunded rows are excluded. */
    computedAt: string;
}

// Aggregates captured tips for a streamId. Read-side only; recomputed on
// every call so the dashboard always reflects the latest webhook captures
// without a separate cache. Cheap because tip volume per stream is small.
export function aggregateStreamRevenue(streamId: string): StreamRevenueBreakdown {
    const stream = db.getStream(streamId);
    const creatorUserId = stream?.creatorId ?? null;
    const tips: TipRecord[] = [...db.tips.values()].filter(
        (t) => t.contextKind === 'stream' && t.contextRef === streamId && t.status === 'captured'
    );
    const breakdown: StreamRevenueBreakdown = {
        streamId,
        creatorUserId,
        grossCents: 0,
        feeCents: 0,
        netCents: 0,
        tipCount: 0,
        giftCount: 0,
        byCurrency: {},
        uniqueSenderCount: 0,
        computedAt: new Date().toISOString(),
    };
    const senders = new Set<string>();
    for (const tip of tips) {
        breakdown.grossCents += tip.grossCents;
        breakdown.feeCents += tip.feeCents;
        breakdown.netCents += tip.netCents;
        breakdown.tipCount += 1;
        if (tip.giftSku) breakdown.giftCount += 1;
        senders.add(tip.senderUserId);
        const ccy = breakdown.byCurrency[tip.currency] ?? {
            grossCents: 0,
            feeCents: 0,
            netCents: 0,
            count: 0,
        };
        ccy.grossCents += tip.grossCents;
        ccy.feeCents += tip.feeCents;
        ccy.netCents += tip.netCents;
        ccy.count += 1;
        breakdown.byCurrency[tip.currency] = ccy;
    }
    breakdown.uniqueSenderCount = senders.size;
    return breakdown;
}

// Progress against a target. Exposes how close the stream is to a goal
// the creator advertises in chat (e.g. "$500 → unlock guest segment").
// Goals are not persisted in this PR — clients pass `targetCents` and
// `currency` per call and we compute the percentage.
export interface StreamGoalProgress {
    streamId: string;
    targetCents: number;
    currency: string;
    achievedCents: number;
    percent: number;
    metAt: string | null;
}

/**
 * In-process latch: each (streamId, targetCents, currency) tuple fires
 * exactly one streamgoal.reached event the first time evaluateStreamGoal
 * sees it cross the target, no matter how many times the dashboard polls
 * after that. Resets on process restart (acceptable — a creator who hits
 * 100% twice across a restart gets two events; pollers tolerate that).
 */
const dispatchedGoalKeys = new Set<string>();
const goalKey = (streamId: string, targetCents: number, currency: string): string =>
    `${streamId}|${currency.toUpperCase()}|${targetCents}`;

export function evaluateStreamGoal(
    streamId: string,
    targetCents: number,
    currency: string
): StreamGoalProgress {
    const breakdown = aggregateStreamRevenue(streamId);
    const ccy = breakdown.byCurrency[currency.toUpperCase()];
    const achievedCents = ccy?.grossCents ?? 0;
    const percent =
        targetCents <= 0
            ? 100
            : Math.min(100, Math.round((achievedCents / targetCents) * 100));
    const metAt = achievedCents >= targetCents ? new Date().toISOString() : null;
    const progress: StreamGoalProgress = {
        streamId,
        targetCents,
        currency: currency.toUpperCase(),
        achievedCents,
        percent,
        metAt,
    };
    if (metAt && breakdown.creatorUserId) {
        const key = goalKey(streamId, targetCents, currency);
        if (!dispatchedGoalKeys.has(key)) {
            dispatchedGoalKeys.add(key);
            void dispatchOutboundEvent({
                type: 'streamgoal.reached',
                blackoutUserId: breakdown.creatorUserId,
                data: {
                    streamId,
                    targetCents,
                    currency: currency.toUpperCase(),
                    achievedCents,
                    metAt,
                },
                occurredAt: metAt,
            }).catch((err) =>
                log.warn('streamgoal_outbound_dispatch_threw', {
                    streamId,
                    error: String(err),
                }),
            );
        }
    }
    return progress;
}

export const __test__ = {
    /** Tests reset the in-process latch between assertions. */
    resetDispatchedGoals: () => dispatchedGoalKeys.clear(),
};
