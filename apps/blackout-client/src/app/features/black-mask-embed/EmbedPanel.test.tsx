// @vitest-environment jsdom
/**
 * The Black Mask chat panel's scoping, end to end through its real route
 * table: only canopies, text dens and DMs render; nothing links into the rest
 * of the app; out-of-scope links open a new top-level tab instead of
 * navigating the frame; unread indicators show by default.
 *
 * The room timeline and composer are stubbed (they need a live Matrix
 * client); the stub timeline renders the kinds of links a real message can
 * carry, so the link rule is exercised on content the panel did not author.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Room } from 'matrix-js-sdk';

vi.mock('../room/RoomTimeline', () => ({
    default: ({ roomId }: { roomId: string }) => (
        <div data-testid="stub-timeline" data-room-id={roomId}>
            <a href="/coliseum" data-testid="msg-link-coliseum">
                coliseum
            </a>
            <a href="https://evil.example/login" data-testid="msg-link-external">
                external
            </a>
            <a href="/communities/canopy-a/dens/den-general" data-testid="msg-link-den">
                another den
            </a>
            <a
                href="blob:https://chat.example.org/x"
                download="f.txt"
                data-testid="msg-link-download"
            >
                file
            </a>
        </div>
    ),
}));
vi.mock('../room/MessageComposer', () => ({
    default: ({ roomId }: { roomId: string }) => (
        <div data-testid="stub-composer" data-room-id={roomId} />
    ),
}));

import { embedRoutes } from './embedRoutes';
import { EmbedApp } from './EmbedApp';
import { allRoomsBaseAtom } from '../../state/rooms';
import { mDirectAtom } from '../../state/mDirectList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { authStateAtom } from '../../state/auth';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import type { MatrixClient } from 'matrix-js-sdk';

type FakeRoomSpec = {
    roomId: string;
    name: string;
    membership?: string;
    createType?: string;
    denKind?: string;
};

const fakeRoom = ({ roomId, name, membership = 'join', createType, denKind }: FakeRoomSpec) =>
    ({
        roomId,
        name,
        getMyMembership: () => membership,
        getType: () => createType,
        currentState: {
            getStateEvents: (type: string) => {
                if (type === 'm.room.create') {
                    return { getContent: () => (createType ? { type: createType } : {}) };
                }
                if (type === 'co.bmc.den.kind') {
                    return denKind ? { getContent: () => ({ kind: denKind }) } : null;
                }
                return null;
            },
        },
    } as unknown as Room);

const ROOMS: FakeRoomSpec[] = [
    { roomId: 'canopy-a', name: 'Garden Co-op', createType: 'm.space' },
    { roomId: 'den-general', name: 'general' },
    { roomId: 'den-voice', name: 'voice hangout', denKind: 'voice' },
    { roomId: 'den-forum', name: 'topic forum', denKind: 'forum' },
    { roomId: 'den-loose', name: 'loose den' },
    { roomId: 'dm-ana', name: 'Ana' },
    { roomId: 'feed-room', name: 'Feed relay', createType: 'org.example.feed' },
    { roomId: 'invited-den', name: 'Pending invite', membership: 'invite' },
];

const PARENTS = new Map<string, Set<string>>([
    ['den-general', new Set(['canopy-a'])],
    ['den-voice', new Set(['canopy-a'])],
    ['den-forum', new Set(['canopy-a'])],
]);

const seedStore = () => {
    const store = createStore();
    store.set(allRoomsBaseAtom, ROOMS.map(fakeRoom));
    store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set(['dm-ana']) });
    store.set(roomToParentsAtom, { type: 'INITIALIZE', roomToParents: PARENTS });
    store.set(roomToUnreadAtom, {
        type: 'RESET',
        unreadInfos: [
            { roomId: 'den-general', total: 3, highlight: 1 },
            { roomId: 'dm-ana', total: 2, highlight: 0 },
            { roomId: 'den-voice', total: 5, highlight: 0 },
        ],
    });
    return store;
};

const fakeClient = { isInitialSyncComplete: () => true } as unknown as MatrixClient;

const mounted: Array<{ root: ReactDOM.Root; container: HTMLElement }> = [];

const renderPanel = async (initialPath: string) => {
    const store = seedStore();
    const router = createMemoryRouter(embedRoutes, { initialEntries: [initialPath] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push({ root, container });
    await act(async () => {
        root.render(
            <JotaiProvider store={store}>
                <MatrixClientProvider value={fakeClient}>
                    <RouterProvider router={router} />
                </MatrixClientProvider>
            </JotaiProvider>
        );
    });
    return { router, container, store };
};

/**
 * Dispatch a primary click and return the event. `defaultPrevented` is what
 * proves the frame was not navigated: jsdom does not navigate on link clicks,
 * so a missing `preventDefault` would otherwise go unnoticed.
 */
const click = async (el: Element | null): Promise<MouseEvent> => {
    expect(el).not.toBeNull();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    await act(async () => {
        el!.dispatchEvent(event);
    });
    return event;
};

const $ = (container: HTMLElement, selector: string) => container.querySelector(selector);
const $$ = (container: HTMLElement, selector: string) =>
    Array.from(container.querySelectorAll(selector));

let openSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
    openSpy = vi.fn();
    window.open = openSpy as unknown as typeof window.open;
});

afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
});

describe('chat panel home', () => {
    it('lists only canopies, loose text dens and DMs', async () => {
        const { container } = await renderPanel('/embed');

        const ids = (testId: string) =>
            $$(container, `[data-testid="${testId}"]`).map((el) => el.getAttribute('data-room-id'));
        expect(ids('embed-canopy-row')).toEqual(['canopy-a']);
        expect(ids('embed-den-row')).toEqual(['den-loose']);
        expect(ids('embed-dm-row')).toEqual(['dm-ana']);

        const text = container.textContent ?? '';
        for (const hidden of ['voice hangout', 'topic forum', 'Feed relay', 'Pending invite']) {
            expect(text).not.toContain(hidden);
        }
    });

    it('renders no navigation into the rest of the app', async () => {
        const { container } = await renderPanel('/embed');
        const text = container.textContent ?? '';
        for (const surface of ['Town Square', 'Coliseum', 'Market', 'Browse rooms', 'Settings']) {
            expect(text).not.toContain(surface);
        }
        // Every link either stays under /embed or is an explicit new-tab link.
        for (const anchor of $$(container, 'a[href]')) {
            const href = anchor.getAttribute('href') ?? '';
            if (href.startsWith('/embed')) continue;
            expect(anchor.getAttribute('target')).toBe('_blank');
            expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
        }
    });

    it('shows unread indicators by default', async () => {
        const { container } = await renderPanel('/embed');
        const dmRow = $(container, '[data-testid="embed-dm-row"]');
        expect(
            dmRow?.querySelector('[data-testid="embed-unread"]')?.getAttribute('aria-label')
        ).toBe('2 unread');
        // Den counts roll up into their canopy (including activity in dens
        // the panel does not show, such as the voice den here).
        const canopyRow = $(container, '[data-testid="embed-canopy-row"]');
        expect(
            canopyRow?.querySelector('[data-testid="embed-unread"]')?.getAttribute('aria-label')
        ).toBe('8 unread, 1 mention');
        // A room with nothing unread has no badge.
        const looseRow = $(container, '[data-testid="embed-den-row"]');
        expect(looseRow?.querySelector('[data-testid="embed-unread"]')).toBeNull();
    });

    it('"Open Blackout" opens a new top-level tab and leaves the frame where it is', async () => {
        const { container, router } = await renderPanel('/embed');
        const event = await click($(container, '[data-testid="embed-open-blackout"]'));
        expect(event.defaultPrevented).toBe(true);
        expect(openSpy).toHaveBeenCalledWith(
            `${window.location.origin}/`,
            '_blank',
            'noopener,noreferrer'
        );
        expect(router.state.location.pathname).toBe('/embed');
    });
});

describe('chat panel canopy page', () => {
    it('opens text dens in the panel and sends voice/forum channels to Blackout', async () => {
        const { container, router } = await renderPanel('/embed/canopies/canopy-a');
        expect($$(container, '[data-testid="embed-den-row"]').map((el) => el.textContent)).toEqual([
            expect.stringContaining('general'),
        ]);
        const elsewhere = $$(container, '[data-testid="embed-elsewhere-row"]');
        expect(elsewhere.map((el) => el.getAttribute('data-room-id'))).toEqual([
            'den-forum',
            'den-voice',
        ]);

        // A voice den opens in a normal Blackout tab, not in the frame.
        expect((await click(elsewhere[1])).defaultPrevented).toBe(true);
        expect(openSpy).toHaveBeenCalledWith(
            `${window.location.origin}/communities/canopy-a/dens/den-voice`,
            '_blank',
            'noopener,noreferrer'
        );
        expect(router.state.location.pathname).toBe('/embed/canopies/canopy-a');

        // A text den opens inside the panel.
        await click($(container, '[data-testid="embed-den-row"]'));
        expect(router.state.location.pathname).toBe('/embed/canopies/canopy-a/dens/den-general');
        expect($(container, '[data-testid="stub-timeline"]')?.getAttribute('data-room-id')).toBe(
            'den-general'
        );
        expect($(container, '[data-testid="stub-composer"]')).not.toBeNull();
    });
});

describe('chat panel room page', () => {
    it('renders a DM with its timeline and composer', async () => {
        const { container } = await renderPanel('/embed/dms/dm-ana');
        expect($(container, '[data-testid="embed-room"]')?.getAttribute('data-room-id')).toBe(
            'dm-ana'
        );
        expect(container.textContent).toContain('Ana');
    });

    // `it.each` is not in the src/ vitest type stub (src/vitest.d.ts); loop instead.
    const refused = [
        '/embed/canopies/canopy-a/dens/den-voice',
        '/embed/dens/den-forum',
        '/embed/dens/feed-room',
        '/embed/dens/invited-den',
        '/embed/dms/not-a-room',
    ];
    for (const path of refused) {
        it(`refuses ${path} and offers it in a Blackout tab instead`, async () => {
            const { container } = await renderPanel(path);
            expect($(container, '[data-testid="embed-room"]')).toBeNull();
            expect($(container, '[data-testid="stub-timeline"]')).toBeNull();
            const open = $(container, '[data-testid="embed-not-shown-open"]');
            expect(open?.getAttribute('target')).toBe('_blank');
            expect((await click(open)).defaultPrevented).toBe(true);
            expect(openSpy).toHaveBeenCalledTimes(1);
            expect(openSpy.mock.calls[0][1]).toBe('_blank');
            expect(openSpy.mock.calls[0][2]).toBe('noopener,noreferrer');
        });
    }

    it('applies the link rule to links inside messages', async () => {
        const { container, router } = await renderPanel('/embed/dms/dm-ana');

        expect(
            (await click($(container, '[data-testid="msg-link-coliseum"]'))).defaultPrevented
        ).toBe(true);
        expect(openSpy).toHaveBeenLastCalledWith(
            `${window.location.origin}/coliseum`,
            '_blank',
            'noopener,noreferrer'
        );
        expect(router.state.location.pathname).toBe('/embed/dms/dm-ana');

        expect(
            (await click($(container, '[data-testid="msg-link-external"]'))).defaultPrevented
        ).toBe(true);
        expect(openSpy).toHaveBeenLastCalledWith(
            'https://evil.example/login',
            '_blank',
            'noopener,noreferrer'
        );
        expect(router.state.location.pathname).toBe('/embed/dms/dm-ana');

        // A download link is left to the browser (it saves a file).
        const callsBefore = openSpy.mock.calls.length;
        const download = $(container, '[data-testid="msg-link-download"]')!;
        let defaultPrevented = false;
        download.addEventListener('click', (e) => {
            defaultPrevented = e.defaultPrevented;
            e.preventDefault(); // jsdom: don't attempt the download
        });
        await click(download);
        expect(defaultPrevented).toBe(false);
        expect(openSpy.mock.calls.length).toBe(callsBefore);

        // A link to a den the panel shows stays in the panel.
        expect((await click($(container, '[data-testid="msg-link-den"]'))).defaultPrevented).toBe(
            true
        );
        expect(router.state.location.pathname).toBe('/embed/canopies/canopy-a/dens/den-general');
    });
});

describe('chat panel catch-all', () => {
    it('parks a navigation to the rest of the app on the "elsewhere" card, keeping the URL under /embed', async () => {
        const { container, router } = await renderPanel('/embed');
        await act(async () => {
            await router.navigate('/coliseum/topics/t1?x=1');
        });
        expect(router.state.location.pathname).toBe('/embed/elsewhere');
        expect(new URLSearchParams(router.state.location.search).get('to')).toBe(
            '/coliseum/topics/t1?x=1'
        );
        const open = $(container, '[data-testid="embed-not-shown-open"]');
        expect(open?.getAttribute('href')).toBe(`${window.location.origin}/coliseum/topics/t1?x=1`);
    });

    it('maps a navigation to something the panel shows onto its panel address', async () => {
        const { router } = await renderPanel('/embed');
        await act(async () => {
            await router.navigate('/messages/locked-in/dm-ana/');
        });
        expect(router.state.location.pathname).toBe('/embed/dms/dm-ana');
    });

    it('sends an unknown panel address to the panel home', async () => {
        const { router } = await renderPanel('/embed/nope');
        expect(router.state.location.pathname).toBe('/embed');
    });

    it('does not let a crafted "elsewhere" URL point "Open in Blackout" at another site', async () => {
        const { container } = await renderPanel(
            `/embed/elsewhere?to=${encodeURIComponent('//evil.example/phish')}`
        );
        expect($(container, '[data-testid="embed-not-shown-open"]')?.getAttribute('href')).toBe(
            '/'
        );
    });
});

vi.mock('../../components/bmc/auth', () => ({
    LoginPage: ({ embedded }: { embedded?: boolean }) => (
        <div data-testid="stub-login" data-embedded={String(Boolean(embedded))} />
    ),
}));

describe('chat panel signed out', () => {
    it('shows the app sign-in in panel mode with no links into the app', async () => {
        const store = createStore();
        store.set(authStateAtom, 'logged_out');
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        mounted.push({ root, container });
        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <EmbedApp />
                </JotaiProvider>
            );
        });

        expect($(container, '[data-testid="embed-signed-out"]')).not.toBeNull();
        expect($(container, '[data-testid="stub-login"]')?.getAttribute('data-embedded')).toBe(
            'true'
        );
        // The full app's signed-out card offers Town Square / Browse rooms;
        // the panel's does not.
        expect($(container, '[data-testid="bootstrap-home"]')).toBeNull();
        expect($(container, '[data-testid="bootstrap-explore"]')).toBeNull();
        const text = container.textContent ?? '';
        expect(text).not.toContain('Town Square');
        // No session-length picker yet (launch-plan step B3).
        expect(text.toLowerCase()).not.toContain('stay signed in');

        await click($(container, '[data-testid="embed-open-blackout"]'));
        expect(openSpy).toHaveBeenCalledWith(
            `${window.location.origin}/`,
            '_blank',
            'noopener,noreferrer'
        );
    });
});
