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

// vi.mock above is hoisted to module top, so a synchronous import
// here resolves the writable mock atom before any HomeFeed module
// code runs.
import HomeFeed from './HomeFeed';
import { joinedRoomsAtom } from '../../state/rooms';

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
        expect(recent?.querySelector('[aria-label="3 unread"]')).not.toBeNull();
    });

    it('emits sticky-header sections grouped by today/this-week/older', async () => {
        const now = Date.now();
        const { container } = await mountWithRooms([
            fakeRoom({
                roomId: '!t:s',
                name: 'Today',
                getLastActiveTimestamp: () => now - 5 * 60 * 1000,
            }),
            fakeRoom({
                roomId: '!w:s',
                name: 'Week',
                getLastActiveTimestamp: () => now - 3 * ONE_DAY,
            }),
            fakeRoom({
                roomId: '!o:s',
                name: 'Older',
                getLastActiveTimestamp: () => now - 30 * ONE_DAY,
            }),
        ]);

        const buckets = Array.from(container.querySelectorAll('[data-bucket]')).map((el) =>
            el.getAttribute('data-bucket')
        );
        expect(buckets).toEqual(['today', 'this-week', 'older']);
    });
});
