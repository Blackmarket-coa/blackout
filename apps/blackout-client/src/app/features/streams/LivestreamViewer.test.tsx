// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const fetchStreamMock = vi.fn();
const fetchOwncastOriginMock = vi.fn();

vi.mock('./streamsClient', () => ({
    listStreams: vi.fn(),
    fetchStream: (...args: unknown[]) => fetchStreamMock(...args),
    fetchOwncastOrigin: (...args: unknown[]) => fetchOwncastOriginMock(...args),
    buildOwncastPlaylistUrl: (origin: string) => `${origin}/hls/stream.m3u8`,
}));

vi.mock('../monetization/components/TipButton', () => ({
    TipButton: (props: { contextRef?: string }) => (
        <button data-testid="tip-button" data-context-ref={props.contextRef}>
            tip
        </button>
    ),
}));

import LivestreamViewer from './LivestreamViewer';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const mountViewer = async (streamId: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter(
        [{ path: '/live/:streamId', element: <LivestreamViewer /> }],
        { initialEntries: [`/live/${encodeURIComponent(streamId)}`] }
    );
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await flush();
    });
    return { container, router };
};

describe('LivestreamViewer', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchStreamMock.mockReset();
        fetchOwncastOriginMock.mockReset();
    });

    it('renders the stream title, live badge, and tip context bound to the stream id', async () => {
        fetchStreamMock.mockResolvedValue({
            id: 'stream-x',
            creatorId: 'creator-x',
            state: 'live',
            title: 'Aid drive',
            tags: ['mutual-aid'],
            visibility: 'public',
            latencyProfile: 'normal',
            updatedAt: '2025-02-01T00:00:00Z',
        });
        fetchOwncastOriginMock.mockResolvedValue({ origin: 'https://owncast.example.com' });

        const { container } = await mountViewer('stream-x');
        expect(container.textContent).toContain('Aid drive');
        expect(container.textContent).toContain('● LIVE');
        expect(
            container.querySelector('[data-testid="tip-button"]')?.getAttribute('data-context-ref')
        ).toBe('stream-x');
        expect(
            container.querySelector('[data-testid="livestream-player-iframe"]')?.getAttribute('src')
        ).toBe('https://owncast.example.com/embed/video');
    });

    it('renders an offline pane when the stream is offline and has no replay pointer', async () => {
        fetchStreamMock.mockResolvedValue({
            id: 'stream-q',
            creatorId: 'creator-q',
            state: 'offline',
            title: 'Quiet',
            tags: [],
            visibility: 'public',
            latencyProfile: 'normal',
            updatedAt: '2025-01-01T00:00:00Z',
        });
        fetchOwncastOriginMock.mockResolvedValue(null);

        const { container } = await mountViewer('stream-q');
        expect(container.querySelector('[data-testid="livestream-player-offline"]')).not.toBeNull();
    });

    it('surfaces a "Join den chat" link when the stream is associated with a den', async () => {
        fetchStreamMock.mockResolvedValue({
            id: 'stream-d',
            creatorId: 'creator-d',
            state: 'live',
            title: 'Den-bound',
            tags: [],
            visibility: 'public',
            latencyProfile: 'normal',
            denId: '!den:blackout.coop',
            updatedAt: '2025-02-02T00:00:00Z',
        });
        fetchOwncastOriginMock.mockResolvedValue({ origin: 'https://owncast.example.com' });

        const { container } = await mountViewer('stream-d');
        const link = container.querySelector<HTMLAnchorElement>(
            '[data-testid="livestream-den-chat-link"]'
        );
        expect(link).not.toBeNull();
        expect(link?.getAttribute('data-den-id')).toBe('!den:blackout.coop');
        expect(link?.getAttribute('href')).toContain(
            encodeURIComponent('!den:blackout.coop')
        );
    });

    it('omits the den chat link when the stream has no den association', async () => {
        fetchStreamMock.mockResolvedValue({
            id: 'stream-no-den',
            creatorId: 'creator-x',
            state: 'live',
            title: 'Lone',
            tags: [],
            visibility: 'public',
            latencyProfile: 'normal',
            updatedAt: '2025-02-03T00:00:00Z',
        });
        fetchOwncastOriginMock.mockResolvedValue({ origin: 'https://owncast.example.com' });

        const { container } = await mountViewer('stream-no-den');
        expect(
            container.querySelector('[data-testid="livestream-den-chat-link"]')
        ).toBeNull();
    });

    it('shows the error region with a link back to the directory on fetch failure', async () => {
        fetchStreamMock.mockRejectedValue(new Error('not_found'));
        // The component calls fetchOwncastOrigin() in parallel; mock it
        // explicitly so the synchronous `.catch(() => null)` chain
        // resolves (mockReset clears the prior mockResolvedValue).
        fetchOwncastOriginMock.mockResolvedValue(null);
        const { container } = await mountViewer('missing');
        expect(
            container.querySelector('[data-testid="livestream-viewer-error"]')?.textContent
        ).toContain('not_found');
    });
});
