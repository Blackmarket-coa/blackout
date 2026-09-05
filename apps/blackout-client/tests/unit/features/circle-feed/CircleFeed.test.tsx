// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCircleFeed = vi.fn();
const fetchMyRelays = vi.fn();
const fetchIllumination = vi.fn();

vi.mock('../../../../src/app/features/circle-feed/circleFeedClient', () => ({
    fetchCircleFeed: (...a: unknown[]) => fetchCircleFeed(...a),
    fetchMyRelays: (...a: unknown[]) => fetchMyRelays(...a),
    fetchIllumination: (...a: unknown[]) => fetchIllumination(...a),
    // Pulled in transitively by CircleFeedCard.
    relayItem: vi.fn(),
    withdrawRelay: vi.fn(),
}));

// The voice-room shelf makes its own API call and is not what these cases are
// about; stub it to nothing so it stays out of the way.
vi.mock('../../../../src/app/features/circle-feed/OpenVoiceRooms', () => ({
    default: () => null,
    OpenVoiceRooms: () => null,
}));

const { default: CircleFeed } = await import('../../../../src/app/features/circle-feed/CircleFeed');

const feedItem = {
    key: 'coalition_feed:item-1',
    ring: 'reach' as const,
    at: '2026-09-01T00:00:00.000Z',
    subject: {
        source: 'coalition_feed',
        id: 'item-1',
        title: 'Produce share',
        body: 'Saturday morning.',
        authorId: '@author:s',
        createdAt: '2026-09-01T00:00:00.000Z',
        mediaUrl: null,
        tags: [],
    },
    path: {
        hops: [
            {
                relayId: 'relay-1',
                userId: '@alice:s',
                note: null,
                active: true,
                at: '2026-09-01T00:00:00.000Z',
            },
        ],
        originAuthorId: '@author:s',
        length: 1,
    },
    alsoRelayedBy: [],
};

const renderFeed = async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => {
        ReactDOM.createRoot(host).render(React.createElement(CircleFeed, { viewerId: '@you:s' }));
    });
    // Let the two chained effects (feed load, then illumination) settle.
    await act(async () => {
        await Promise.resolve();
    });
    return host;
};

describe('CircleFeed', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
        fetchIllumination.mockRejectedValue(new Error('no illumination'));
        fetchCircleFeed.mockResolvedValue({
            generatedAt: '2026-09-01T00:00:00.000Z',
            circleSize: 3,
            items: [feedItem],
        });
        fetchMyRelays.mockResolvedValue({ relays: [] });
    });

    it('renders the feed the server sent', async () => {
        const host = await renderFeed();
        expect(host.textContent).toContain('Produce share');
        expect(host.querySelectorAll('[data-testid="circle-feed-card"]').length).toBe(1);
    });

    // Found by rendering the feed in a real browser: an unexpected body from
    // the optional `mine` call threw inside the load try-block and painted a
    // raw `Cannot read properties of undefined (reading 'filter')` over a feed
    // that had loaded perfectly well. Boost state is an enrichment; it must
    // never be able to fail the feed.
    it('still renders when the relay-state call returns an unexpected body', async () => {
        fetchMyRelays.mockResolvedValue({ notRelays: true } as never);

        const host = await renderFeed();

        expect(host.textContent).toContain('Produce share');
        expect(host.textContent).not.toContain('reading');
        expect(host.textContent).not.toContain('undefined');
    });

    it('still renders when the relay-state call rejects outright', async () => {
        fetchMyRelays.mockRejectedValue(new Error('offline'));

        const host = await renderFeed();

        expect(host.textContent).toContain('Produce share');
        expect(host.textContent).not.toContain('offline');
    });

    // The feed's own failure is different: that one the viewer does need told.
    it('reports a genuine feed failure', async () => {
        fetchCircleFeed.mockRejectedValue(new Error('feed exploded'));

        const host = await renderFeed();

        expect(host.textContent).toContain('feed exploded');
    });
});
