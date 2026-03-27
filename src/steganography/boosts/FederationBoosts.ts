/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

export type BoostTier = "none" | "plus" | "pro";

export interface BoostTierPolicy {
    retryPriority: number;
    relayRedundancy: number;
    bandwidthEnvelopeBytesPerMinute: number;
}

export const BOOST_TIER_POLICIES: Record<BoostTier, BoostTierPolicy> = {
    none: {
        retryPriority: 1,
        relayRedundancy: 1,
        bandwidthEnvelopeBytesPerMinute: 32_000,
    },
    plus: {
        retryPriority: 2,
        relayRedundancy: 2,
        bandwidthEnvelopeBytesPerMinute: 96_000,
    },
    pro: {
        retryPriority: 3,
        relayRedundancy: 3,
        bandwidthEnvelopeBytesPerMinute: 192_000,
    },
};

export interface BoostUsageRecord {
    accountId: string;
    homeserverId: string;
    tier: BoostTier;
    bytesRouted: number;
    retriesUsed: number;
    relaysUsed: number;
    timestamp: number;
}

export interface RevenueShareEntry {
    homeserverId: string;
    periodKey: string;
    grossCredits: number;
    platformCredits: number;
    homeserverCredits: number;
}

export class RevenueShareLedger {
    public constructor(
        private readonly platformShare: number = 0.3,
        private readonly records: RevenueShareEntry[] = [],
    ) {}

    public recordBoostRevenue(input: {
        homeserverId: string;
        periodKey: string;
        grossCredits: number;
    }): RevenueShareEntry {
        const platformCredits = round2(input.grossCredits * this.platformShare);
        const homeserverCredits = round2(input.grossCredits - platformCredits);
        const entry: RevenueShareEntry = {
            homeserverId: input.homeserverId,
            periodKey: input.periodKey,
            grossCredits: round2(input.grossCredits),
            platformCredits,
            homeserverCredits,
        };
        this.records.push(entry);
        return entry;
    }

    public list(): readonly RevenueShareEntry[] {
        return this.records;
    }
}

export interface BoostThrottleInput {
    tier: BoostTier;
    bytesPerMinute: number;
    eventsPerMinute: number;
}

export interface BoostThrottleDecision {
    allowed: boolean;
    reason: "ok" | "tier_bandwidth_exceeded" | "abuse_rate_exceeded";
}

export class BoostThrottler {
    public constructor(private readonly abuseEventsPerMinuteCap = 200) {}

    public evaluate(input: BoostThrottleInput): BoostThrottleDecision {
        const policy = BOOST_TIER_POLICIES[input.tier];
        if (input.bytesPerMinute > policy.bandwidthEnvelopeBytesPerMinute) {
            return { allowed: false, reason: "tier_bandwidth_exceeded" };
        }

        if (input.eventsPerMinute > this.abuseEventsPerMinuteCap) {
            return { allowed: false, reason: "abuse_rate_exceeded" };
        }

        return { allowed: true, reason: "ok" };
    }
}

export interface BoostDashboardSnapshot {
    generatedAt: number;
    totalsByTier: Record<BoostTier, { accounts: number; bytesRouted: number; retriesUsed: number; relaysUsed: number }>;
    revenueShare: readonly RevenueShareEntry[];
}

export function buildBoostDashboardSnapshot(
    usageRecords: readonly BoostUsageRecord[],
    revenueShare: readonly RevenueShareEntry[],
    generatedAt = Date.now(),
): BoostDashboardSnapshot {
    const totals: BoostDashboardSnapshot["totalsByTier"] = {
        none: { accounts: 0, bytesRouted: 0, retriesUsed: 0, relaysUsed: 0 },
        plus: { accounts: 0, bytesRouted: 0, retriesUsed: 0, relaysUsed: 0 },
        pro: { accounts: 0, bytesRouted: 0, retriesUsed: 0, relaysUsed: 0 },
    };

    const seenAccountsByTier: Record<BoostTier, Set<string>> = {
        none: new Set(),
        plus: new Set(),
        pro: new Set(),
    };

    for (const record of usageRecords) {
        const row = totals[record.tier];
        row.bytesRouted += record.bytesRouted;
        row.retriesUsed += record.retriesUsed;
        row.relaysUsed += record.relaysUsed;
        seenAccountsByTier[record.tier].add(record.accountId);
    }

    totals.none.accounts = seenAccountsByTier.none.size;
    totals.plus.accounts = seenAccountsByTier.plus.size;
    totals.pro.accounts = seenAccountsByTier.pro.size;

    return {
        generatedAt,
        totalsByTier: totals,
        revenueShare,
    };
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}
