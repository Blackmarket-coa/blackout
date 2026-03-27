/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    BOOST_TIER_POLICIES,
    BoostThrottler,
    RevenueShareLedger,
    buildBoostDashboardSnapshot,
} from "../../../src/steganography/boosts/FederationBoosts";

describe("FederationBoosts", () => {
    it("defines monotonic boost tier policies", () => {
        expect(BOOST_TIER_POLICIES.none.retryPriority).toBeLessThan(BOOST_TIER_POLICIES.plus.retryPriority);
        expect(BOOST_TIER_POLICIES.plus.retryPriority).toBeLessThan(BOOST_TIER_POLICIES.pro.retryPriority);
        expect(BOOST_TIER_POLICIES.none.bandwidthEnvelopeBytesPerMinute).toBeLessThan(
            BOOST_TIER_POLICIES.plus.bandwidthEnvelopeBytesPerMinute,
        );
    });

    it("records platform and homeserver revenue share entries", () => {
        const ledger = new RevenueShareLedger(0.25);
        const entry = ledger.recordBoostRevenue({ homeserverId: "hs-1", periodKey: "2026-01", grossCredits: 100 });

        expect(entry).toEqual({
            homeserverId: "hs-1",
            periodKey: "2026-01",
            grossCredits: 100,
            platformCredits: 25,
            homeserverCredits: 75,
        });
        expect(ledger.list()).toHaveLength(1);
    });

    it("applies metadata-only throttling and abuse caps", () => {
        const throttler = new BoostThrottler(120);

        expect(throttler.evaluate({ tier: "plus", bytesPerMinute: 60_000, eventsPerMinute: 50 })).toEqual({
            allowed: true,
            reason: "ok",
        });

        expect(
            throttler.evaluate({
                tier: "none",
                bytesPerMinute: BOOST_TIER_POLICIES.none.bandwidthEnvelopeBytesPerMinute + 1,
                eventsPerMinute: 10,
            }),
        ).toEqual({ allowed: false, reason: "tier_bandwidth_exceeded" });

        expect(throttler.evaluate({ tier: "pro", bytesPerMinute: 50_000, eventsPerMinute: 121 })).toEqual({
            allowed: false,
            reason: "abuse_rate_exceeded",
        });
    });

    it("builds transparent dashboard aggregates by tier", () => {
        const snapshot = buildBoostDashboardSnapshot(
            [
                {
                    accountId: "acct-1",
                    homeserverId: "hs-1",
                    tier: "plus",
                    bytesRouted: 1000,
                    retriesUsed: 3,
                    relaysUsed: 2,
                    timestamp: 1,
                },
                {
                    accountId: "acct-2",
                    homeserverId: "hs-1",
                    tier: "plus",
                    bytesRouted: 2000,
                    retriesUsed: 4,
                    relaysUsed: 3,
                    timestamp: 2,
                },
                {
                    accountId: "acct-2",
                    homeserverId: "hs-1",
                    tier: "plus",
                    bytesRouted: 100,
                    retriesUsed: 1,
                    relaysUsed: 1,
                    timestamp: 3,
                },
            ],
            [
                {
                    homeserverId: "hs-1",
                    periodKey: "2026-01",
                    grossCredits: 20,
                    platformCredits: 6,
                    homeserverCredits: 14,
                },
            ],
            500,
        );

        expect(snapshot.generatedAt).toBe(500);
        expect(snapshot.totalsByTier.plus).toEqual({
            accounts: 2,
            bytesRouted: 3100,
            retriesUsed: 8,
            relaysUsed: 6,
        });
        expect(snapshot.revenueShare).toHaveLength(1);
    });
});
