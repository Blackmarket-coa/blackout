// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { Bounty } from '@blackout/core';
import { BountyBoard } from './BountyBoard';

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
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
});
