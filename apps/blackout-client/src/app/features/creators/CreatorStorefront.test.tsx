// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

const fetchPublicProfileMock = vi.fn();
const fetchCreatorTiersMock = vi.fn();
const listStreamsMock = vi.fn();

vi.mock('./creatorClient', () => ({
    fetchPublicProfile: (...args: unknown[]) => fetchPublicProfileMock(...args),
    fetchCreatorTiers: (...args: unknown[]) => fetchCreatorTiersMock(...args),
    fetchCreatorProviders: vi.fn(),
    fetchMyCreatorListings: vi.fn(),
    createCreatorListing: vi.fn(),
    publishCreatorListing: vi.fn(),
    archiveCreatorListing: vi.fn(),
    startCreatorPayoutOnboarding: vi.fn(),
}));

vi.mock('../streams/streamsClient', () => ({
    listStreams: (...args: unknown[]) => listStreamsMock(...args),
    fetchStream: vi.fn(),
    fetchOwncastOrigin: vi.fn(),
    buildOwncastPlaylistUrl: vi.fn(),
}));

import CreatorStorefront from './CreatorStorefront';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const mountStorefront = async (userId: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter(
        [{ path: '/creators/:userId', element: <CreatorStorefront /> }],
        { initialEntries: [`/creators/${encodeURIComponent(userId)}`] }
    );
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await flush();
    });
    return { container, router };
};

describe('CreatorStorefront', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchPublicProfileMock.mockReset();
        fetchCreatorTiersMock.mockReset();
        listStreamsMock.mockReset();
    });

    it('renders the profile header + tiers section by default', async () => {
        fetchPublicProfileMock.mockResolvedValue({
            userId: 'creator-1',
            handle: 'alpha',
            displayName: 'Alpha Forge',
            bio: 'Mutual-aid creator',
        });
        fetchCreatorTiersMock.mockResolvedValue({
            tiers: [
                { id: 't1', name: 'Supporter', priceCents: 199, currency: 'USD' },
                { id: 't2', name: 'Co-op', priceCents: 999, currency: 'USD' },
            ],
        });
        listStreamsMock.mockResolvedValue({ items: [] });

        const { container } = await mountStorefront('creator-1');
        expect(container.textContent).toContain('Alpha Forge');
        expect(container.textContent).toContain('@alpha');
        expect(container.querySelectorAll('[data-testid="storefront-tier-card"]').length).toBe(2);
    });

    it('hides individual sections gracefully when their fetcher rejects', async () => {
        fetchPublicProfileMock.mockRejectedValue(new Error('profile down'));
        fetchCreatorTiersMock.mockResolvedValue({ tiers: [] });
        listStreamsMock.mockResolvedValue({ items: [] });
        const { container } = await mountStorefront('creator-2');
        // The tab strip should still render even if no profile data.
        expect(container.querySelectorAll('[data-testid="storefront-tab"]').length).toBe(3);
        expect(container.textContent).toContain('No subscription tiers');
    });

    it('switches to the streams tab and renders live cards', async () => {
        fetchPublicProfileMock.mockResolvedValue({ userId: 'creator-3' });
        fetchCreatorTiersMock.mockResolvedValue({ tiers: [] });
        listStreamsMock.mockResolvedValue({
            items: [
                {
                    id: 's-live',
                    creatorId: 'creator-3',
                    state: 'live',
                    title: 'Aid drive',
                    tags: [],
                    visibility: 'public',
                    latencyProfile: 'normal',
                    updatedAt: '2025-02-01T00:00:00Z',
                },
                {
                    id: 's-replay',
                    creatorId: 'creator-3',
                    state: 'offline',
                    title: 'Past stream',
                    tags: [],
                    visibility: 'public',
                    latencyProfile: 'normal',
                    updatedAt: '2025-01-20T00:00:00Z',
                    replayPointer: 'r1',
                },
            ],
        });
        const { container } = await mountStorefront('creator-3');

        const streamsTab = container.querySelector(
            '[data-testid="storefront-tab"][data-tab-id="streams"]'
        ) as HTMLButtonElement | null;
        expect(streamsTab).not.toBeNull();
        await act(async () => {
            streamsTab!.click();
            await flush();
        });

        expect(container.querySelectorAll('[data-testid="storefront-live-card"]').length).toBe(1);
    });
});
