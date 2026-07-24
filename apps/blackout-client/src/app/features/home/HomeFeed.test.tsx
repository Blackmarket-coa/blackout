// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider, atom, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router';
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

// The Bounty Board fetches open bounties on mount. Stub the hook so the
// existing feed tests exercise the bounty-free path; an empty board renders
// nothing.
vi.mock('./hooks/useBountyBoard', () => ({
    useBountyBoard: () => ({ bounties: [], loading: false }),
}));

// The unified feed fetches livestreams / coalition / coliseum on mount.
// Stub the network clients so tests exercise the den-only path without
// hitting the API; each resolves empty so only Matrix room activity drives
// the feed. `useFollowedActivity` no-ops because `matrixClientAtom` is null.
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
    fetchWall: vi.fn().mockResolvedValue({ userId: '', posts: [] }),
    fetchFollowing: vi.fn().mockResolvedValue({ following: [] }),
    fetchFollowers: vi.fn().mockResolvedValue({ followers: [] }),
    saveProfile: vi.fn().mockResolvedValue({}),
    postWall: vi.fn().mockResolvedValue({}),
    followUser: vi.fn().mockResolvedValue({ ok: true, following: true, created: true }),
    unfollowUser: vi.fn().mockResolvedValue({ ok: true, following: false, removed: true }),
}));
vi.mock('../invitations/invitationsClient', () => ({
    getPersonalInviteLink: vi.fn().mockResolvedValue({
        invitation: {},
        url: 'https://x/invite/t',
        shareUrl: 'https://x/i/t',
    }),
}));

// vi.mock above is hoisted to module top, so a synchronous import
// here resolves the writable mock atom before any HomeFeed module
// code runs.
import HomeFeed from './HomeFeed';
import { fetchCoalitionFeed } from '../coalition/coalitionClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import { __resetStreakStateForTests } from './streakState';

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
        runtimeFeatureFlags.homeFeedSegments = false;
        runtimeFeatureFlags.homeStreak = false;
        window.localStorage.clear();
        __resetStreakStateForTests();
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
        expect(recent?.querySelector('[aria-label="3"]')).not.toBeNull();
    });

    it('renders the context/spatial-awareness sidebar', async () => {
        const { container } = await mountWithRooms([]);
        expect(container.querySelector('[data-shell-region="home-context"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="home-context-sidebar"]')).not.toBeNull();
        // Ecosystem pulse is derived from the live feed (not mocked).
        expect(container.querySelector('[data-testid="home-context-pulse"]')).not.toBeNull();
    });

    it('renders the Following section and a pinned live rail slot', async () => {
        const { container } = await mountWithRooms([fakeRoom({ roomId: '!d:s', name: 'A Den' })]);
        expect(container.querySelector('[data-testid="home-following-section"]')).not.toBeNull();
        // The den is attributed to the viewer, so it lands in Following.
        expect(
            container.querySelector('[data-testid="home-feed-card"][data-source="den"]')
        ).not.toBeNull();
        // No live streams in this fixture, so the rail does not render.
        expect(container.querySelector('[data-testid="home-live-rail"]')).toBeNull();
    });

    it('surfaces Discover-only content in a section below Following without duplicating it', async () => {
        // A coalition item with no joined-canopy attribution is Discover-only.
        vi.mocked(fetchCoalitionFeed).mockResolvedValueOnce({
            generatedAt: '',
            items: [
                {
                    id: 'cf1',
                    kind: 'announcement',
                    title: 'Coalition Bulletin',
                    createdAt: new Date().toISOString(),
                    score: 0.9,
                    canopyId: null,
                    denId: null,
                    tags: [],
                },
            ],
        } as never);

        // Following only surfaces dens with unread activity.
        const { container } = await mountWithRooms([
            fakeRoom({ roomId: '!d:s', name: 'A Den', getUnreadNotificationCount: () => 2 }),
        ]);

        // The den lives in Following; the coalition bulletin lives in Discover.
        const discover = container.querySelector('[data-testid="home-discover-section"]');
        expect(discover).not.toBeNull();
        expect(discover?.textContent).toContain('Coalition Bulletin');

        // The den card appears once (in Following), never duplicated into Discover.
        const denCards = container.querySelectorAll(
            '[data-testid="home-feed-card"][data-source="den"]'
        );
        expect(denCards.length).toBe(1);
        const following = container.querySelector('[data-testid="home-following-section"]');
        expect(following?.contains(denCards[0])).toBe(true);
    });

    it('renders For You / Following + sort controls and switches segments when homeFeedSegments is on', async () => {
        runtimeFeatureFlags.homeFeedSegments = true;
        vi.mocked(fetchCoalitionFeed).mockResolvedValueOnce({
            generatedAt: '',
            items: [
                {
                    id: 'cf1',
                    kind: 'announcement',
                    title: 'Coalition Bulletin',
                    createdAt: new Date().toISOString(),
                    score: 0.9,
                    canopyId: null,
                    denId: null,
                    tags: [],
                },
            ],
        } as never);

        // Following only surfaces dens with unread activity.
        const { container } = await mountWithRooms([
            fakeRoom({ roomId: '!d:s', name: 'A Den', getUnreadNotificationCount: () => 2 }),
        ]);

        // Segmented controls render; the stacked sections do not.
        expect(container.querySelector('[data-testid="home-feed-controls"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="home-feed-sort-hot"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="home-following-section"]')).toBeNull();
        expect(container.querySelector('[data-testid="home-discover-section"]')).toBeNull();

        // For You (default) surfaces the Discover-only coalition bulletin.
        const section = container.querySelector('[data-testid="home-feed-segment-section"]');
        expect(section?.textContent).toContain('Coalition Bulletin');

        // Switching to Following drops the unattributed bulletin but keeps the den.
        const followingBtn = container.querySelector(
            '[data-testid="home-feed-segment-following"]'
        ) as HTMLButtonElement;
        await act(async () => {
            followingBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        const after = container.querySelector('[data-testid="home-feed-segment-section"]');
        expect(after?.textContent).not.toContain('Coalition Bulletin');
        expect(
            container.querySelector('[data-testid="home-feed-card"][data-source="den"]')
        ).not.toBeNull();

        runtimeFeatureFlags.homeFeedSegments = false;
    });

    it('shows a daily streak chip starting at one day when homeStreak is on', async () => {
        runtimeFeatureFlags.homeStreak = true;
        const { container } = await mountWithRooms([]);
        const chip = container.querySelector('[data-testid="home-streak-chip"]');
        expect(chip).not.toBeNull();
        expect(chip?.textContent).toContain('1-day streak');
        runtimeFeatureFlags.homeStreak = false;
    });

    it('hides the streak chip when homeStreak is off', async () => {
        const { container } = await mountWithRooms([]);
        expect(container.querySelector('[data-testid="home-streak-chip"]')).toBeNull();
    });
});
