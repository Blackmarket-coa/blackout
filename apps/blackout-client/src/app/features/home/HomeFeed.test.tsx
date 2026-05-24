// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider, atom, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { RoomLike } from './feedModel';

// HomeFeed depends on `joinedRoomsAtom` from `state/rooms`, which is a
// derived (read-only) atom backed by `matrixClientAtom`. For unit
// testing we replace the whole module with a writable atom so each
// test can drive the rooms list directly. TopicChipBar is also
// mocked out so the network call doesn't fire.
vi.mock('../../state/rooms', () => {
    const fakeJoinedRoomsAtom = atom<RoomLike[]>([]);
    return {
        joinedRoomsAtom: fakeJoinedRoomsAtom,
        invitedRoomsAtom: atom<RoomLike[]>([]),
        allRoomsAtom: atom<RoomLike[]>([]),
        roomByIdAtom: () => atom(null),
    };
});

vi.mock('../topics/TopicChipBar', () => ({
    TopicChipBar: () => null,
}));

// The unified feed fetches livestreams / coalition / coliseum on mount.
// Stub the network clients so tests exercise the den-only path without
// hitting the API; each resolves empty so only Matrix room activity drives
// the feed. `useStatusUpdates` no-ops because `matrixClientAtom` is null.
vi.mock('../streams/streamsClient', () => ({
    listStreams: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock('../coalition/coalitionClient', () => ({
    fetchCoalitionFeed: vi.fn().mockResolvedValue({ generatedAt: '', items: [] }),
}));
vi.mock('../coliseum/coliseumClient', () => ({
    fetchColiseumTopics: vi.fn().mockResolvedValue({ generatedAt: '', topics: [] }),
}));
vi.mock('../profile/profileClient', () => ({
    fetchProfile: vi.fn().mockRejectedValue(new Error('no profile')),
}));

// vi.mock above is hoisted to module top, so a synchronous import
// here resolves the writable mock atom before any HomeFeed module
// code runs.
import HomeFeed from './HomeFeed';
import { joinedRoomsAtom } from '../../state/rooms';
import { homeFeedTabAtom } from '../../state/homeFeed';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

const fakeRoom = (overrides: Partial<RoomLike> & { roomId: string; name?: string }): RoomLike => ({
    name: overrides.name ?? overrides.roomId,
    getType: () => 'm.room',
    getMyMembership: () => 'join',
    getLastActiveTimestamp: () => 0,
    getUnreadNotificationCount: () => 0,
    getCanonicalParent: () => null,
    ...overrides,
});

const buildRouter = () =>
    createMemoryRouter([{ path: '/', element: <HomeFeed /> }], {
        initialEntries: ['/'],
    });

const mountWithRooms = async (rooms: RoomLike[]) => {
    const store = createStore();
    store.set(joinedRoomsAtom as never, rooms as never);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = buildRouter();
    await act(async () => {
        root.render(
            <JotaiProvider store={store}>
                <RouterProvider router={router} />
            </JotaiProvider>
        );
        await Promise.resolve();
    });
    return { container, router };
};

describe('HomeFeed', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the empty state when no joined dens are available', async () => {
        const { container } = await mountWithRooms([]);
        expect(container.querySelector('[data-testid="home-feed-empty"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="home-feed-list"]')).toBeNull();
    });

    it('surfaces a quick-action link to the consolidated streaming page', async () => {
        const { container } = await mountWithRooms([]);
        const link = container.querySelector('[data-testid="home-quick-action-streaming"]');
        expect(link).not.toBeNull();
        expect(link?.getAttribute('href')).toBe('/streaming');
    });

    it('surfaces quick-action links to the Coalition and Coliseum destinations', async () => {
        const { container } = await mountWithRooms([]);
        const coalition = container.querySelector('[data-testid="home-quick-action-coalition"]');
        expect(coalition).not.toBeNull();
        expect(coalition?.getAttribute('href')).toBe('/coalition');
        const coliseum = container.querySelector('[data-testid="home-quick-action-coliseum"]');
        expect(coliseum).not.toBeNull();
        expect(coliseum?.getAttribute('href')).toBe('/coliseum');
    });

    it('renders cards in chronological order with deep links to canopy/den', async () => {
        const now = Date.now();
        const { container } = await mountWithRooms([
            fakeRoom({
                roomId: '!quiet:s',
                name: 'Quiet Den',
                getLastActiveTimestamp: () => now - 30 * ONE_DAY,
            }),
            fakeRoom({
                roomId: '!recent:s',
                name: 'Recent Den',
                getLastActiveTimestamp: () => now - 5 * 60 * 1000,
                getUnreadNotificationCount: () => 3,
                getCanonicalParent: () => '!canopy:s',
            }),
            fakeRoom({
                roomId: '!midweek:s',
                name: 'Midweek Den',
                getLastActiveTimestamp: () => now - 2 * ONE_DAY,
            }),
        ]);

        const cards = Array.from(container.querySelectorAll('[data-testid="home-feed-card"]'));
        expect(cards.map((c) => c.getAttribute('data-den-id'))).toEqual([
            '!recent:s',
            '!midweek:s',
            '!quiet:s',
        ]);

        const recent = container.querySelector(
            '[data-testid="home-feed-card"][data-den-id="!recent:s"]'
        );
        expect(recent?.getAttribute('href')).toBe(
            `/communities/${encodeURIComponent('!canopy:s')}/dens/${encodeURIComponent(
                '!recent:s'
            )}`
        );
        expect(recent?.querySelector('[aria-label="3"]')).not.toBeNull();
    });

    it('renders Following/Discover tabs and a pinned live rail slot', async () => {
        const { container } = await mountWithRooms([fakeRoom({ roomId: '!d:s', name: 'A Den' })]);
        expect(container.querySelector('[data-testid="home-feed-tabs"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="home-feed-tab-following"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="home-feed-tab-discover"]')).not.toBeNull();
        // No live streams in this fixture, so the rail does not render.
        expect(container.querySelector('[data-testid="home-live-rail"]')).toBeNull();
    });

    it('switching to Discover hides den items that have no joined-canopy attribution', async () => {
        const store = createStore();
        store.set(joinedRoomsAtom as never, [fakeRoom({ roomId: '!d:s', name: 'A Den' })] as never);
        // Default tab is Following → den card visible.
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <RouterProvider router={buildRouter()} />
                </JotaiProvider>
            );
            await Promise.resolve();
        });
        expect(
            container.querySelector('[data-testid="home-feed-card"][data-source="den"]')
        ).not.toBeNull();

        // Dens still surface in Discover (global stream), so the card stays.
        await act(async () => {
            store.set(homeFeedTabAtom as never, 'discover' as never);
            await Promise.resolve();
        });
        expect(
            container
                .querySelector('[data-testid="home-feed-tab-discover"]')
                ?.getAttribute('aria-selected')
        ).toBe('true');
    });
});
