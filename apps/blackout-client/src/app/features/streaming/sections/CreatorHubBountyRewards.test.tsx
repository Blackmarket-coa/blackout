// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchMyBountyRewards = vi.fn();
vi.mock('../../bounty/bountyClient', () => ({
    fetchMyBountyRewards: (...a: unknown[]) => fetchMyBountyRewards(...a),
}));

// Local mirror of the reward shape so the test never imports from the mocked
// module (importing a type from a vi.mock'd module can pull the real module in
// alongside the mock and trip an unhandled rejection on the failure path).
interface BountyRewardShape {
    id: string;
    bountyId: string;
    beneficiaryId: string;
    posterId: string;
    rewardType: string;
    rewardSummary: string;
    rewardCents: number | null;
    status: 'earned' | 'settled' | 'voided';
    earnedAt: string;
    settledAt: string | null;
    settledRef: string | null;
}

import { CreatorHubBountyRewards } from './CreatorHubBountyRewards';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(CreatorHubBountyRewards));
        await flush();
    });
    return container;
};

const reward = (over: Partial<BountyRewardShape> = {}): BountyRewardShape => ({
    id: 'r1',
    bountyId: 'b1',
    beneficiaryId: '@me:bmc',
    posterId: '@p:bmc',
    rewardType: 'cash',
    rewardSummary: '$50',
    rewardCents: 5000,
    status: 'earned',
    earnedAt: '2026-06-03T00:00:00.000Z',
    settledAt: null,
    settledRef: null,
    ...over,
});

describe('CreatorHubBountyRewards', () => {
    beforeEach(() => fetchMyBountyRewards.mockReset());

    it('renders the summary totals and per-bounty rows', async () => {
        fetchMyBountyRewards.mockResolvedValue({
            rewards: [reward(), reward({ id: 'r2', rewardSummary: '$25', rewardCents: 2500, status: 'settled' })],
            summary: { count: 2, earnedCents: 7500, settledCents: 2500 },
        });
        const container = await mount();
        expect(container.querySelector('[data-testid="bounty-rewards-count"]')!.textContent).toBe('2');
        expect(container.querySelector('[data-testid="bounty-rewards-earned"]')!.textContent).toBe('$75.00');
        expect(container.querySelector('[data-testid="bounty-rewards-settled"]')!.textContent).toBe('$25.00');
        expect(container.querySelectorAll('[data-testid="bounty-reward-row"]').length).toBe(2);
    });

    it('renders the empty state with zeroed totals when there are no rewards', async () => {
        fetchMyBountyRewards.mockResolvedValue({
            rewards: [],
            summary: { count: 0, earnedCents: 0, settledCents: 0 },
        });
        const container = await mount();
        expect(container.querySelector('[data-testid="bounty-rewards-empty"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="bounty-rewards-earned"]')!.textContent).toBe('$0.00');
    });
});
