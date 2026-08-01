// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { Bounty } from '@blackout/core';

const applyToBounty = vi.fn();
const fetchBountyApplications = vi.fn();
const acceptBountyApplication = vi.fn();
vi.mock('../bounty/bountyClient', () => ({
    applyToBounty: (...args: unknown[]) => applyToBounty(...args),
    fetchBountyApplications: (...args: unknown[]) => fetchBountyApplications(...args),
    acceptBountyApplication: (...args: unknown[]) => acceptBountyApplication(...args),
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
        fetchBountyApplications.mockReset();
        acceptBountyApplication.mockReset();
    });

    it('renders the activation empty state with a post-first CTA when there are no bounties', async () => {
        const container = await render(React.createElement(BountyBoard, { items: [] }));
        // The card board is absent, but the empty-state surface invites the first post.
        expect(container.querySelector('[data-testid="home-bounty-board"]')).toBeNull();
        expect(container.querySelector('[data-testid="home-bounty-board-empty"]')).not.toBeNull();
        const cta = container.querySelector('[data-testid="home-bounty-post-first"]');
        expect(cta).not.toBeNull();
        expect(cta?.getAttribute('href')).toBe('/create');
    });

    it('renders a card per bounty with its category and reward', async () => {
        const container = await render(
            React.createElement(BountyBoard, {
                items: [
                    bounty(),
                    bounty({ id: 'b2', category: 'tester', rewardSummary: '1 theme' }),
                ],
            })
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
        const container = await render(React.createElement(BountyBoard, { items: [bounty()] }));
        const button = container.querySelector(
            '[data-testid="home-bounty-apply"]'
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

    it('opens the detail panel from a card and shows the apply action for a non-poster', async () => {
        // Non-poster: the poster-only applicants fetch rejects → applicant mode.
        fetchBountyApplications.mockRejectedValue(new Error('403'));
        const container = await render(React.createElement(BountyBoard, { items: [bounty()] }));
        expect(container.querySelector('[data-testid="bounty-detail-overlay"]')).toBeNull();
        const details = container.querySelector(
            '[data-testid="home-bounty-details"]'
        ) as HTMLButtonElement;
        await act(async () => {
            details.click();
            await flush();
        });
        expect(fetchBountyApplications).toHaveBeenCalledWith('b1');
        expect(container.querySelector('[data-testid="bounty-detail-panel"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="bounty-detail-apply"]')).not.toBeNull();
        // Close via backdrop.
        const backdrop = container.querySelector(
            '[data-testid="bounty-detail-backdrop"]'
        ) as HTMLElement;
        await act(async () => {
            backdrop.click();
            await flush();
        });
        expect(container.querySelector('[data-testid="bounty-detail-overlay"]')).toBeNull();
    });
});
