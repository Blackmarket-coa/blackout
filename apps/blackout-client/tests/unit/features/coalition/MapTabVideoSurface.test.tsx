// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { CoalitionFeedItem } from '@blackout/core';

/**
 * The map is the Coalition's only live video surface — these tests pin the
 * creation entry point (Post video → VideoComposer) and the full-feed
 * Stories reel (which must include videos posted without a location, since
 * those never surface as pins).
 */

const feedItems: { items: CoalitionFeedItem[] } = { items: [] };

const emptyState = { data: null, loading: false, error: null, refetch: vi.fn() };

vi.mock('../../../../src/app/features/coalition/hooks/useCoalitionFeed', () => ({
    useCoalitionFeed: () => ({
        data: { generatedAt: '', items: feedItems.items },
        loading: false,
        error: null,
        refetch: vi.fn(),
    }),
    useSpatialFeed: () => emptyState,
    useMutualAid: () => emptyState,
    useSellerLocations: () => emptyState,
    useCoalitionVideoEngagement: () => ({
        likes: { data: null, loading: false, error: null, refetch: vi.fn() },
        comments: { data: null, loading: false, error: null, refetch: vi.fn() },
        toggleLike: vi.fn(),
        addComment: vi.fn(),
    }),
}));
vi.mock('../../../../src/app/features/coalition/tabs/CoalitionMap', () => ({
    default: () => <div data-testid="mock-map" />,
    CoalitionMap: () => <div data-testid="mock-map" />,
}));
vi.mock('../../../../src/app/features/coalition/tabs/mycelium', () => ({
    MyceliumLayer: () => null,
    useMyceliumGraph: () => ({ data: null, loading: false, error: null }),
}));
const composerProps: { initialVaultEntryId?: string }[] = [];
vi.mock('../../../../src/app/features/coalition/composer/VideoComposer', () => ({
    VideoComposer: (props: { initialVaultEntryId?: string }) => {
        composerProps.push(props);
        return <div data-testid="mock-video-composer" />;
    },
}));
const vaultEntries: { current: Array<Record<string, unknown>> } = { current: [] };
vi.mock('../../../../src/platform/localVideoVault', () => ({
    localVideoVaultSupported: () => true,
    listLocalVideos: async () => vaultEntries.current,
}));
vi.mock('../../../../src/app/features/location/LocationConsentDialog', () => ({
    LocationConsentDialog: () => null,
}));
vi.mock('../../../../src/app/features/location/locationConsent', () => ({
    coarsenCoordinate: (value: number) => value,
    useLocationConsentFlow: () => ({
        state: 'off',
        disclosureOpen: false,
        requestEnable: vi.fn(),
        confirmEnable: vi.fn(),
        cancelEnable: vi.fn(),
    }),
}));

import MapTab from '../../../../src/app/features/coalition/tabs/MapTab';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const video = (id: string, geotagged: boolean): CoalitionFeedItem => ({
    id,
    kind: 'video',
    title: `Video ${id}`,
    createdAt: '2026-07-21T00:00:00.000Z',
    mediaUrl: `https://cdn.test/${id}.mp4`,
    ...(geotagged ? { latitude: 45.5, longitude: -122.6 } : {}),
    importance: 0.5,
    impact: 0.5,
    socialImpact: 0.5,
    score: 0.5,
});

describe('MapTab video surface', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        feedItems.items = [];
        vaultEntries.current = [];
        composerProps.length = 0;
    });

    const mount = async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(<MapTab scope={{ canopyId: 'canopy-1' }} />);
            await flush();
        });
        return container;
    };

    const click = async (el: Element) => {
        await act(async () => {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await flush();
        });
    };

    const query = (container: HTMLElement, testid: string): HTMLElement | null =>
        container.querySelector(`[data-testid="${testid}"]`);

    it('exposes a Post video control that opens the composer', async () => {
        const container = await mount();
        const button = query(container, 'coalition-map-post-video');
        expect(button).not.toBeNull();
        expect(query(container, 'mock-video-composer')).toBeNull();

        await click(button!);
        expect(query(container, 'mock-video-composer')).not.toBeNull();

        await click(query(container, 'coalition-map-post-video')!);
        expect(query(container, 'mock-video-composer')).toBeNull();
    });

    it('hides the Stories control when there are no videos', async () => {
        const container = await mount();
        expect(query(container, 'coalition-map-stories')).toBeNull();
    });

    it('opens the full reel from Stories, including non-geotagged videos', async () => {
        feedItems.items = [video('geo', true), video('nogeo', false)];
        const container = await mount();

        const stories = query(container, 'coalition-map-stories');
        expect(stories).not.toBeNull();
        await click(stories!);

        const reel = query(container, 'coalition-video-reel');
        expect(reel).not.toBeNull();
        // Both stories play — the non-geotagged one has no pin, so the full
        // reel is its only route to viewers.
        expect(reel!.textContent).toContain('Video geo');
        expect(reel!.textContent).toContain('Video nogeo');

        await click(query(container, 'coalition-map-reel-close')!);
        expect(query(container, 'coalition-video-reel')).toBeNull();
    });

    it('offers repost-from-device for an expired story backed by the vault', async () => {
        feedItems.items = [video('mine', false)];
        vaultEntries.current = [
            {
                id: 'vault-42',
                title: 'Video mine',
                filename: 'mine.mp4',
                contentType: 'video/mp4',
                sizeBytes: 1024,
                savedAt: '2026-07-01T00:00:00.000Z',
                lastPostedAt: '2026-07-01T00:00:00.000Z',
                lastPostedFeedItemId: 'mine',
            },
        ];
        const container = await mount();
        await click(query(container, 'coalition-map-stories')!);

        // Simulate the server copy having expired: the media element errors.
        const media = container.querySelector('[data-testid="coalition-video-reel"] video');
        expect(media).not.toBeNull();
        await act(async () => {
            media!.dispatchEvent(new Event('error'));
            await flush();
        });

        expect(query(container, 'coalition-video-unavailable-mine')).not.toBeNull();
        const repost = query(container, 'coalition-video-repost-mine');
        expect(repost).not.toBeNull();

        // Repost closes the reel and reopens the composer preloaded with the original.
        await click(repost!);
        expect(query(container, 'coalition-video-reel')).toBeNull();
        expect(query(container, 'mock-video-composer')).not.toBeNull();
        expect(composerProps.at(-1)?.initialVaultEntryId).toBe('vault-42');
    });
});
