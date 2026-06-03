// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { Bounty } from '@blackout/core';

const applyToBounty = vi.fn();
vi.mock('../bounty/bountyClient', () => ({
    applyToBounty: (...args: unknown[]) => applyToBounty(...args),
}));

import { BountyBoard } from './BountyBoard';

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
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

const bounty = (over: Partial<Bounty> = {}): Bounty => ({
    id: 'b1',
    category: 'creator',
    title: 'Need a TikTok campaign',
    description: 'desc',
    creatorId: '@poster:bmc',
    rewardType: 'cash',
    rewardSummary: '$50',
    requirements: [],
    deliverables: [],
    status: 'open',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    ...over,
});

describe('BountyBoard', () => {
    beforeEach(() => {
        applyToBounty.mockReset();
    });

    it('renders nothing when there are no bounties', async () => {
        const container = await render(React.createElement(BountyBoard, { items: [] }));
        expect(container.querySelector('[data-testid="home-bounty-board"]')).toBeNull();
    });

    it('renders a card per bounty with its category and reward', async () => {
        const container = await render(
            React.createElement(BountyBoard, {
                items: [bounty(), bounty({ id: 'b2', category: 'tester', rewardSummary: '1 theme' })],
            }),
        );
        expect(container.querySelector('[data-testid="home-bounty-board"]')).not.toBeNull();
        const cards = container.querySelectorAll('[data-testid="home-bounty-card"]');
        expect(cards.length).toBe(2);
        expect(container.textContent).toContain('Need a TikTok campaign');
        expect(container.textContent).toContain('$50');
        expect(container.querySelector('[data-bounty-category="tester"]')).not.toBeNull();
    });

    it('applies to a bounty and reflects the applied state', async () => {
        applyToBounty.mockResolvedValue({ application: { id: 'a1', status: 'pending' } });
        const container = await render(
            React.createElement(BountyBoard, { items: [bounty()] }),
        );
        const button = container.querySelector(
            '[data-testid="home-bounty-apply"]',
        ) as HTMLButtonElement;
        expect(button.textContent).toBe('Apply');
        await act(async () => {
            button.click();
            await flush();
        });
        expect(applyToBounty).toHaveBeenCalledWith('b1');
        expect(button.textContent).toBe('Applied ✓');
        expect(button.disabled).toBe(true);
    });
});
