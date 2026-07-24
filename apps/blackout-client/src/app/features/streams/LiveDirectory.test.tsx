// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

const listStreamsMock = vi.fn();
const fetchCategoriesMock = vi.fn();

vi.mock('./streamsClient', () => ({
    listStreams: (...args: unknown[]) => listStreamsMock(...args),
    fetchStreamCategories: (...args: unknown[]) => fetchCategoriesMock(...args),
    fetchStream: vi.fn(),
    fetchOwncastOrigin: vi.fn(),
    buildOwncastPlaylistUrl: (origin: string) => `${origin}/hls/stream.m3u8`,
}));

import LiveDirectory from './LiveDirectory';

// The list fetch runs behind a setTimeout (0ms when no search term), so the
// flush must drain a macrotask in addition to microtasks.
const flush = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await Promise.resolve();
};

const mountDirectory = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter([{ path: '/live', element: <LiveDirectory /> }], {
        initialEntries: ['/live'],
    });
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await flush();
    });
    return { container, router };
};

describe('LiveDirectory', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        listStreamsMock.mockReset();
        fetchCategoriesMock.mockReset();
        fetchCategoriesMock.mockResolvedValue({ categories: [] });
    });

    it('shows the empty state when no streams are returned', async () => {
        listStreamsMock.mockResolvedValue({ items: [] });
        const { container } = await mountDirectory();
        expect(container.querySelector('[data-testid="live-directory-empty"]')).not.toBeNull();
    });

    it('renders one card per stream and links to the viewer route', async () => {
        listStreamsMock.mockResolvedValue({
            items: [
                {
                    id: 'stream-A',
                    creatorId: 'creator-1',
                    state: 'live',
                    title: 'Live A',
                    tags: ['safety'],
                    visibility: 'public',
                    latencyProfile: 'normal',
                    updatedAt: '2025-02-01T00:00:00Z',
                },
                {
                    id: 'stream-B',
                    creatorId: 'creator-2',
                    state: 'offline',
                    title: 'Replay B',
                    tags: [],
                    visibility: 'public',
                    latencyProfile: 'normal',
                    updatedAt: '2025-01-20T00:00:00Z',
                    replayPointer: 'r1',
                },
            ],
        });

        const { container } = await mountDirectory();
        const cards = Array.from(container.querySelectorAll('[data-testid="live-directory-card"]'));
        expect(cards.map((c) => c.getAttribute('data-stream-id'))).toEqual([
            'stream-A',
            'stream-B',
        ]);
        expect(cards[0]?.getAttribute('href')).toBe(`/live/${encodeURIComponent('stream-A')}`);
    });

    it('surfaces fetch errors in the error region', async () => {
        listStreamsMock.mockRejectedValue(new Error('upstream down'));
        const { container } = await mountDirectory();
        expect(
            container.querySelector('[data-testid="live-directory-error"]')?.textContent
        ).toContain('upstream down');
    });

    it('shows a graceful permission state on 403 instead of the raw error', async () => {
        const forbiddenError = Object.assign(new Error('Request failed (403)'), { status: 403 });
        listStreamsMock.mockRejectedValue(forbiddenError);
        fetchCategoriesMock.mockResolvedValue({ categories: [] });
        const { container } = await mountDirectory();
        expect(container.querySelector('[data-testid="live-directory-forbidden"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="live-directory-error"]')).toBeNull();
    });

    it('requests live-first sort by default and renders category chips', async () => {
        listStreamsMock.mockResolvedValue({ items: [] });
        fetchCategoriesMock.mockResolvedValue({
            categories: [
                { name: 'Gaming', total: 3, live: 2 },
                { name: 'Music', total: 1, live: 0 },
            ],
        });
        const { container } = await mountDirectory();
        // Default fetch uses sort 'live' with no category/search.
        expect(listStreamsMock).toHaveBeenCalledWith(
            expect.objectContaining({ sort: 'live', category: undefined, search: undefined })
        );
        const chips = container.querySelectorAll('[data-testid="live-directory-category"]');
        expect(chips.length).toBe(2);
        expect(chips[0]?.getAttribute('data-category')).toBe('Gaming');
    });

    it('refetches scoped to a category when a chip is clicked', async () => {
        listStreamsMock.mockResolvedValue({ items: [] });
        fetchCategoriesMock.mockResolvedValue({
            categories: [{ name: 'Gaming', total: 3, live: 2 }],
        });
        const { container } = await mountDirectory();
        const chip = container.querySelector(
            '[data-testid="live-directory-category"]'
        ) as HTMLButtonElement;
        await act(async () => {
            chip.click();
            await flush();
        });
        expect(listStreamsMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ category: 'Gaming' })
        );
    });
});
