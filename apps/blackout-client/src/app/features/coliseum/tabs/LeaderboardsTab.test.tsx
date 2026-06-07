// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { LeaderboardEntry } from '@blackout/core';

const fetchLeaderboard = vi.fn();
vi.mock('../challengesClient', () => ({
    fetchLeaderboard: (...a: unknown[]) => fetchLeaderboard(...a),
}));

import { LeaderboardsTab } from './LeaderboardsTab';

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

const entry = (over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
    category: 'creators',
    id: 'c1',
    title: 'Compost King',
    score: 42,
    rank: 1,
    ...over,
});

describe('LeaderboardsTab', () => {
    beforeEach(() => fetchLeaderboard.mockReset());

    it('loads the creators leaderboard on mount and renders ranked rows', async () => {
        fetchLeaderboard.mockResolvedValue({
            category: 'creators',
            entries: [entry(), entry({ id: 'c2', title: 'Seed Saver', rank: 2, score: 30 })],
        });
        const container = await render(React.createElement(LeaderboardsTab));
        expect(fetchLeaderboard).toHaveBeenCalledWith('creators');
        const rows = container.querySelectorAll('[data-testid="coliseum-leaderboard-row"]');
        expect(rows.length).toBe(2);
    });
});
