// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { AidPost } from '@blackout/core';

/**
 * Mutual-aid asks mirrored from FreeBlackMarket arrive with a coarse locality
 * and no coordinates at all — its board publishes a place name and never a pin,
 * because a precise pair describes where a person in need actually lives.
 *
 * Before this, `pinList`'s aid branch read `post.location.latitude` with no
 * guard (unlike the video branch directly above it), so the first such post
 * threw a TypeError while building the pin list and took the whole map down.
 * These pin the two halves of the answer: it stays off the map, and it is still
 * readable underneath it.
 */

const emptyState = { data: null, loading: false, error: null, refetch: vi.fn() };
const state = <T,>(data: T) => ({ data, loading: false, error: null, refetch: vi.fn() });

const aid: { posts: AidPost[] } = { posts: [] };

vi.mock('../../../../src/app/features/coalition/hooks/useCoalitionFeed', () => ({
    useCoalitionFeed: () => state({ generatedAt: '', items: [] }),
    useSpatialFeed: () => emptyState,
    useMutualAid: () => state({ posts: aid.posts }),
    useSellerLocations: () => emptyState,
    useCoalitionNeeds: () => state({ needs: [] }),
    useCoalitionProjects: () => state({ projects: [] }),
    useCoalitionResources: () => state({ resources: [] }),
    useCoalitionVideoEngagement: () => ({
        likes: emptyState,
        comments: emptyState,
        toggleLike: vi.fn(),
        addComment: vi.fn(),
    }),
}));

const mapPins: { current: Array<Record<string, unknown>> } = { current: [] };
vi.mock('../../../../src/app/features/coalition/tabs/CoalitionMap', () => ({
    default: (props: { pins: Array<Record<string, unknown>> }) => {
        mapPins.current = props.pins;
        return <div data-testid="mock-map" />;
    },
}));
vi.mock('../../../../src/app/features/coalition/tabs/mycelium', () => ({
    MyceliumLayer: () => null,
    useMyceliumGraph: () => ({ data: null, loading: false, error: null }),
}));
vi.mock('../../../../src/app/features/coalition/composer/VideoComposer', () => ({
    VideoComposer: () => null,
}));
vi.mock('../../../../src/platform/localVideoVault', () => ({
    localVideoVaultSupported: () => false,
    listLocalVideos: async () => [],
}));
vi.mock('../../../../src/app/features/location/LocationConsentDialog', () => ({
    LocationConsentDialog: () => null,
}));

const MapTab = (await import('../../../../src/app/features/coalition/tabs/MapTab')).default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DETROIT = { latitude: 42.3314, longitude: -83.0458 };

const post = (over: Partial<AidPost> = {}): AidPost => ({
    id: 'aid-local',
    customerId: '@ari:server',
    type: 'need',
    category: 'food',
    title: 'Groceries for a neighbour',
    description: 'A hand carrying groceries up three flights.',
    location: { ...DETROIT },
    displayRadiusMeters: 400,
    urgency: 'medium',
    status: 'open',
    ...over,
});

/** What a mirrored FBM ask actually looks like: a locality, and no pin. */
const mirrored = (over: Partial<AidPost> = {}): AidPost => {
    const { location: _ignored, ...rest } = post({
        id: 'aid-mirrored',
        locality: 'Southwest Detroit',
        displayRadiusMeters: 0,
        source: 'freeblackmarket',
        externalId: 'mar_1',
        // Spread last so an explicit `locality: undefined` actually clears it —
        // `??` would quietly put the default back.
        ...over,
    });
    return rest as AidPost;
};

const mountedRoots: ReactDOM.Root[] = [];

const render = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<MapTab scope={{ canopyId: '!c:server' }} />);
    });
    mountedRoots.push(root);
    return container;
};

const pinFor = (id: string) => mapPins.current.find((pin) => pin.id === id);

/**
 * The unplaced list renders only while the pin list is expanded, and that
 * starts open or closed depending on viewport width — so read the toggle's
 * state rather than assuming a click opens it.
 */
const expandList = async (container: HTMLElement) => {
    const toggle = container.querySelector<HTMLButtonElement>(
        '[data-testid="coalition-map-discovery-count"]'
    );
    expect(toggle).toBeTruthy();
    if (toggle?.getAttribute('aria-expanded') === 'true') return;
    await act(async () => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
};

beforeEach(() => {
    aid.posts = [];
    mapPins.current = [];
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
});

describe('MapTab — asks with a place name and no pin', () => {
    it('renders at all when a mirrored ask is present', async () => {
        // The regression itself: reading `post.location.latitude` off one of
        // these threw before the map ever mounted.
        aid.posts = [mirrored()];
        const container = await render();

        expect(container.querySelector('[data-testid="mock-map"]')).toBeTruthy();
    });

    it('keeps the mirrored ask off the map', async () => {
        aid.posts = [post(), mirrored()];
        await render();

        expect(pinFor('aid-local')).toMatchObject({ layer: 'aid', ...DETROIT });
        expect(pinFor('aid-mirrored')).toBeUndefined();
    });

    it('lists it underneath with the locality it did come with', async () => {
        aid.posts = [mirrored()];
        const container = await render();
        await expandList(container);

        const list = container.querySelector('[data-testid="coalition-map-unplaced-aid"]');
        expect(list?.textContent).toContain('Groceries for a neighbour');
        expect(list?.textContent).toContain('Southwest Detroit');
    });

    it('says so plainly when even the locality is missing', async () => {
        aid.posts = [mirrored({ locality: undefined })];
        const container = await render();
        await expandList(container);

        const list = container.querySelector('[data-testid="coalition-map-unplaced-aid"]');
        expect(list?.textContent).toContain('no location given');
    });

    it('renders no unplaced section when every ask has a pin', async () => {
        aid.posts = [post()];
        const container = await render();
        await expandList(container);

        expect(container.querySelector('[data-testid="coalition-map-unplaced-aid"]')).toBeNull();
    });
});
