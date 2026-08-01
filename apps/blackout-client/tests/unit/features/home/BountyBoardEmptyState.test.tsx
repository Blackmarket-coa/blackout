// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { Bounty } from '@blackout/core';

// The board card imports the bounty client for its Apply action; stub it so the
// empty-state render path has no network surface.
vi.mock('../../../../src/app/features/bounty/bountyClient', () => ({
    applyToBounty: vi.fn(),
    fetchBountyApplications: vi.fn(),
    acceptBountyApplication: vi.fn(),
}));

import { BountyBoard } from '../../../../src/app/features/home/BountyBoard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

const bounty = (over: Partial<Bounty> = {}): Bounty => ({
    id: 'b1',
    category: 'creator',
    title: 'Need a launch trailer',
    description: 'd',
    creatorId: '@poster:bmc',
    rewardType: 'cash',
    rewardSummary: '$40',
    requirements: [],
    deliverables: [],
    status: 'open',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    ...over,
});

describe('BountyBoard activation empty state', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('shows a "Post the first bounty" CTA to /create when empty', async () => {
        const container = await render(React.createElement(BountyBoard, { items: [] }));
        expect(container.querySelector('[data-testid="home-bounty-board"]')).toBeNull();
        const empty = container.querySelector('[data-testid="home-bounty-board-empty"]');
        expect(empty).not.toBeNull();
        const cta = container.querySelector(
            '[data-testid="home-bounty-post-first"]'
        ) as HTMLAnchorElement | null;
        expect(cta).not.toBeNull();
        expect(cta?.getAttribute('href')).toBe('/create');
    });

    it('renders the card board (not the empty state) when there are bounties', async () => {
        const container = await render(React.createElement(BountyBoard, { items: [bounty()] }));
        expect(container.querySelector('[data-testid="home-bounty-board-empty"]')).toBeNull();
        expect(container.querySelector('[data-testid="home-bounty-board"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="home-bounty-card"]')).not.toBeNull();
    });
});
