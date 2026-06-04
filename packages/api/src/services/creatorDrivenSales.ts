/**
 * Creator-driven sales — the single KPI.
 *
 * "How many sales happened because a creator, coalition, bounty, or referral
 * generated them?" Operationally: captured tips whose context kind is one of the
 * growth-attribution kinds (referral / ambassador / quest / bounty reward). Each
 * such captured tip is a settled creator-attributed economic event carrying GMV
 * (grossCents), platform revenue (feeCents), and the creator's take (netCents).
 *
 * This reads only durable state (the persisted tip ledger), so the number is
 * stable across restarts — which is the whole point of persisting the growth
 * ledger. The per-creator summary powers the Creator Hub panel; the
 * platform-wide aggregate is exported as Prometheus counters incremented at
 * settlement time (see telemetry/metrics.ts + services/marketplaceWebhook.ts).
 */

import { listTipsReceivedBy } from './tips';
import type { TipContextKind } from '../db/types';

export const CREATOR_DRIVEN_ATTRIBUTION_KINDS = [
    'referral_bonus',
    'ambassador_commission',
    'quest_reward',
    'bounty_reward',
] as const satisfies readonly TipContextKind[];

export type CreatorDrivenAttributionKind = (typeof CREATOR_DRIVEN_ATTRIBUTION_KINDS)[number];

const ATTRIBUTION_KIND_SET = new Set<string>(CREATOR_DRIVEN_ATTRIBUTION_KINDS);

export function isCreatorDrivenAttributionKind(
    kind: string,
): kind is CreatorDrivenAttributionKind {
    return ATTRIBUTION_KIND_SET.has(kind);
}

export interface CreatorDrivenSalesBucket {
    /** Number of settled creator-attributed sales. */
    count: number;
    /** Gross merchandise value, in cents (sum of tip grossCents). */
    gmvCents: number;
    /** Platform revenue, in cents (sum of tip feeCents). */
    feeCents: number;
    /** Paid through to the creator, in cents (sum of tip netCents). */
    netCents: number;
}

export interface CreatorDrivenSalesSummary {
    beneficiaryUserId: string;
    total: CreatorDrivenSalesBucket;
    byKind: Record<CreatorDrivenAttributionKind, CreatorDrivenSalesBucket>;
    /** Inclusive lower bound applied to the tip capture time, if any. */
    sinceIso: string | null;
    generatedAt: string;
}

function emptyBucket(): CreatorDrivenSalesBucket {
    return { count: 0, gmvCents: 0, feeCents: 0, netCents: 0 };
}

function addToBucket(bucket: CreatorDrivenSalesBucket, gross: number, fee: number, net: number): void {
    bucket.count += 1;
    bucket.gmvCents += gross;
    bucket.feeCents += fee;
    bucket.netCents += net;
}

/**
 * Summarises the creator-driven sales attributed to `beneficiaryUserId`. Only
 * captured tips count (pending/refunded are excluded — a refund is not a sale).
 * Pass `sinceIso` to scope to a window (e.g. month-to-date).
 */
export function summarizeCreatorDrivenSalesFor(
    beneficiaryUserId: string,
    options: { sinceIso?: string; limit?: number } = {},
): CreatorDrivenSalesSummary {
    const sinceMs = options.sinceIso ? Date.parse(options.sinceIso) : undefined;
    const tips = listTipsReceivedBy(beneficiaryUserId, options.limit ?? 1000);

    const byKind = {
        referral_bonus: emptyBucket(),
        ambassador_commission: emptyBucket(),
        quest_reward: emptyBucket(),
        bounty_reward: emptyBucket(),
    } satisfies Record<CreatorDrivenAttributionKind, CreatorDrivenSalesBucket>;
    const total = emptyBucket();

    for (const tip of tips) {
        if (tip.status !== 'captured') continue;
        if (!isCreatorDrivenAttributionKind(tip.contextKind)) continue;
        if (sinceMs !== undefined) {
            const when = tip.capturedAt ?? tip.createdAt;
            if (Date.parse(when) < sinceMs) continue;
        }
        addToBucket(byKind[tip.contextKind], tip.grossCents, tip.feeCents, tip.netCents);
        addToBucket(total, tip.grossCents, tip.feeCents, tip.netCents);
    }

    return {
        beneficiaryUserId,
        total,
        byKind,
        sinceIso: options.sinceIso ?? null,
        generatedAt: new Date().toISOString(),
    };
}
