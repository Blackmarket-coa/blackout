// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { Bounty } from '@blackout/core';

const fetchRecommendedBounties = vi.fn();
const applyToBounty = vi.fn();
vi.mock('../../bounty/bountyClient', () => ({
    fetchRecommendedBounties: (...a: unknown[]) => fetchRecommendedBounties(...a),
    applyToBounty: (...a: unknown[]) => applyToBounty(...a),
}));

import { CreatorHubBounties } from './CreatorHubBounties';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(CreatorHubBounties));
        await flush();
    });
    return container;
};

const bounty = (over: Partial<Bounty> = {}): Bounty => ({
    id: 'b1',
    category: 'creator',
    title: 'Need product photography',
    description: 'd',
    creatorId: '@producer:bmc',
    rewardType: 'cash',
    rewardSummary: '$75',
    requirements: [],
    deliverables: [],
    status: 'open',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    ...over,
});

describe('CreatorHubBounties', () => {
    beforeEach(() => {
        fetchRecommendedBounties.mockReset();
        applyToBounty.mockReset();
    });

    it('renders an empty state when there are no matches', async () => {
        fetchRecommendedBounties.mockResolvedValue({ bounties: [] });
        const container = await mount();
        expect(container.querySelector('[data-testid="creator-hub-bounties-empty"]')).not.toBeNull();
    });

    it('renders matched bounties and applies to one', async () => {
        fetchRecommendedBounties.mockResolvedValue({ bounties: [bounty(), bounty({ id: 'b2' })] });
        applyToBounty.mockResolvedValue({ application: { id: 'a1', status: 'pending' } });
        const container = await mount();
        const rows = container.querySelectorAll('[data-testid="creator-hub-bounty-row"]');
        expect(rows.length).toBe(2);
        const applyBtn = container.querySelector(
            '[data-testid="creator-hub-bounty-apply"]',
        ) as HTMLButtonElement;
        await act(async () => {
            applyBtn.click();
            await flush();
        });
        expect(applyToBounty).toHaveBeenCalledWith('b1');
        expect(applyBtn.textContent).toBe('Applied ✓');
    });

    it('degrades to empty when the recommendations fetch fails', async () => {
        fetchRecommendedBounties.mockRejectedValue(new Error('down'));
        const container = await mount();
        expect(container.querySelector('[data-testid="creator-hub-bounties-empty"]')).not.toBeNull();
    });
});
