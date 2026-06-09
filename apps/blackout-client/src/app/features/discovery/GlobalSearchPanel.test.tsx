// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { GlobalSearchResult } from '@blackout/core';

const globalSearch = vi.fn();
const globalTrending = vi.fn();
const globalRecommended = vi.fn();
vi.mock('./globalSearchClient', () => ({
    globalSearch: (...args: unknown[]) => globalSearch(...args),
    globalTrending: (...args: unknown[]) => globalTrending(...args),
    globalRecommended: (...args: unknown[]) => globalRecommended(...args),
}));

import { GlobalSearchPanel } from './GlobalSearchPanel';

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

const result = (over: Partial<GlobalSearchResult> = {}): GlobalSearchResult => ({
    type: 'coalition',
    id: 'c1',
    title: 'Compost Coalition',
    score: 1000,
    ...over,
});

describe('GlobalSearchPanel', () => {
    beforeEach(() => {
        globalSearch.mockReset();
        globalTrending.mockReset();
        globalRecommended.mockReset();
    });

    it('loads cross-entity trending on mount', async () => {
        globalTrending.mockResolvedValue({
            results: [result(), result({ type: 'bounty', id: 'b1', title: 'Compost video' })],
        });
        const container = await render(React.createElement(GlobalSearchPanel));
        expect(globalTrending).toHaveBeenCalledTimes(1);
        const rows = container.querySelectorAll('[data-testid="global-search-result"]');
        expect(rows.length).toBe(2);
        expect(rows[1]?.getAttribute('data-result-type')).toBe('bounty');
    });

    it('switches to personalized recommendations on the "For you" tab', async () => {
        globalTrending.mockResolvedValue({ results: [result()] });
        globalRecommended.mockResolvedValue({
            results: [result({ id: 'rec1', title: 'Recommended Coalition' })],
        });
        const container = await render(
            <GlobalSearchPanel interestTags={['permaculture']} excludeIds={['c1']} />,
        );
        expect(globalTrending).toHaveBeenCalledTimes(1);

        const forYou = container.querySelector(
            '[data-testid="global-search-foryou-tab"]',
        ) as HTMLButtonElement;
        await act(async () => {
            forYou.click();
            await flush();
        });

        expect(globalRecommended).toHaveBeenCalledWith(['permaculture'], ['c1']);
        const rows = container.querySelectorAll('[data-testid="global-search-result"]');
        expect(rows.length).toBe(1);
        expect(rows[0]?.textContent).toContain('Recommended Coalition');
    });
});
