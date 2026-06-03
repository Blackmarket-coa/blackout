// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { Bounty } from '@blackout/core';

const fetchBounties = vi.fn();
vi.mock('../bounty/bountyClient', () => ({
    fetchBounties: (...args: unknown[]) => fetchBounties(...args),
}));

import { useBountyBoard } from './hooks/useBountyBoard';

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
};

const renderHook = async <T,>(hook: () => T) => {
    const ref: { current: T | null } = { current: null };
    const Component = () => {
        ref.current = hook();
        return null;
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(React.createElement(Component));
        await flush();
    });
    return ref as { current: T };
};

const bounty = (id: string): Bounty => ({
    id,
    category: 'creator',
    title: `Bounty ${id}`,
    description: 'desc',
    creatorId: '@poster:bmc',
    rewardType: 'cash',
    rewardSummary: '$50',
    requirements: [],
    deliverables: [],
    status: 'open',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
});

describe('useBountyBoard', () => {
    beforeEach(() => {
        fetchBounties.mockReset();
    });

    it('returns an empty board and issues no request when disabled', async () => {
        const result = await renderHook(() => useBountyBoard(false));
        expect(result.current.bounties).toEqual([]);
        expect(result.current.loading).toBe(false);
        expect(fetchBounties).not.toHaveBeenCalled();
    });

    it('maps a successful response into the board', async () => {
        fetchBounties.mockResolvedValue({ bounties: [bounty('a'), bounty('b')] });
        const result = await renderHook(() => useBountyBoard(true));
        expect(fetchBounties).toHaveBeenCalledTimes(1);
        expect(result.current.bounties.map((b) => b.id)).toEqual(['a', 'b']);
        expect(result.current.loading).toBe(false);
    });

    it('swallows a rejected fetch into an empty board (graceful degradation)', async () => {
        fetchBounties.mockRejectedValue(new Error('bounty API down'));
        const result = await renderHook(() => useBountyBoard(true));
        expect(result.current.bounties).toEqual([]);
        expect(result.current.loading).toBe(false);
    });
});
