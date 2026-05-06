// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const listStreamsMock = vi.fn();

vi.mock('./streamsClient', () => ({
    listStreams: (...args: unknown[]) => listStreamsMock(...args),
    fetchStream: vi.fn(),
    fetchOwncastOrigin: vi.fn(),
    buildOwncastPlaylistUrl: (origin: string) => `${origin}/hls/stream.m3u8`,
}));

import LiveDirectory from './LiveDirectory';

const flush = async () => {
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
});
