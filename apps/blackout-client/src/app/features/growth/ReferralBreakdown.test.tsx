// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { ReferralRecord } from './growthClient';

const fetchMyReferrals = vi.fn();
vi.mock('./growthClient', () => ({
    fetchMyReferrals: (...a: unknown[]) => fetchMyReferrals(...a),
}));

import { ReferralBreakdown } from './ReferralBreakdown';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await flush();
    });
    return container;
};

const ref = (over: Partial<ReferralRecord> = {}): ReferralRecord => ({
    id: 'r1',
    referrerUserId: '@me:bmc',
    refereeUserId: '@a:bmc',
    sourceKind: 'invite_link',
    sourceRef: null,
    status: 'settled',
    rewardTipId: null,
    rewardCents: 500,
    attributedAt: '2026-06-03T00:00:00.000Z',
    settledAt: '2026-06-03T00:00:00.000Z',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    ...over,
});

describe('ReferralBreakdown', () => {
    beforeEach(() => fetchMyReferrals.mockReset());

    it('groups by source kind and sums attributed/settled earnings', async () => {
        fetchMyReferrals.mockResolvedValue({
            items: [
                ref(),
                ref({ id: 'r2', sourceKind: 'invite_link', rewardCents: 500 }),
                ref({ id: 'r3', sourceKind: 'creator_invite', rewardCents: 1000 }),
                ref({ id: 'r4', sourceKind: 'invite_link', status: 'pending', rewardCents: 999 }),
            ],
        });
        const container = await render(React.createElement(ReferralBreakdown));
        expect(fetchMyReferrals).toHaveBeenCalledTimes(1);

        const rows = container.querySelectorAll('[data-testid="referral-breakdown-row"]');
        expect(rows.length).toBe(2); // invite_link + creator_invite

        // pending reward (999) is excluded from earnings: 500 + 500 + 1000 = $20.00
        expect(container.textContent).toContain('$20.00 generated');
        // 4 total referrals
        expect(container.textContent).toContain('4 total');
    });
});
