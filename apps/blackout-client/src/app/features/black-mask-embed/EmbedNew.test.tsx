// @vitest-environment jsdom
/**
 * Making a canopy or a den from the Black Mask chat panel, through the
 * panel's real route table and the full app's real forms: what the header's
 * New control offers where; the panel column of the defaults (a canopy is
 * Private wherever it is made, L6; a den in a canopy is Restricted to it and
 * encrypted); the power-level check before a form inside a canopy; the room
 * versions read before a form renders; and opening the new room in the panel
 * once it has arrived from sync, with no form left to submit twice.
 *
 * The room timeline and composer are stubbed (they need a live Matrix
 * client), and so is the directory call (`indexCanopy`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { EventEmitter } from 'events';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ClientEvent, type Capabilities, type MatrixClient, type Room } from 'matrix-js-sdk';

vi.mock('../room/RoomTimeline', () => ({
    default: ({ roomId }: { roomId: string }) => (
        <div data-testid="stub-timeline" data-room-id={roomId} />
    ),
}));
vi.mock('../room/MessageComposer', () => ({
    default: ({ roomId }: { roomId: string }) => (
        <div data-testid="stub-composer" data-room-id={roomId} />
    ),
}));
const indexCanopyMock = vi.fn(async () => ({}));
vi.mock('../discovery/discoveryClient', () => ({
    indexCanopy: (...args: unknown[]) => indexCanopyMock(...(args as [])),
}));

import { embedRoutes } from './embedRoutes';
import { waitForJoinedRoom } from './EmbedNew';
import { allRoomsBaseAtom } from '../../state/rooms';
import { mDirectAtom } from '../../state/mDirectList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import { setNewRoomSurfaceForTests } from '../../components/create-room';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = '@alice:server';
const NEW_ROOM_ID = '!new:server';
// Real room ids, so the percent-encoding of a panel URL is exercised end to end.
const GARDEN = '!garden:server';
const GROVE = '!grove:server';
const enc = encodeURIComponent;

// Room version 10 supports `restricted`.
const CAPABILITIES = {
    'm.room_versions': { default: '10', available: { '10': 'stable' } },
} as unknown as Capabilities;

type FakeRoomSpec = {
    roomId: string;
    name: string;
    createType?: string;
    joinRule?: string;
    /** The signed-in user's power level; adding a room to a canopy needs 50. */
    myPower?: number;
    membership?: string;
};

const stateEvent = (type: string, content: Record<string, unknown>) => ({
    getType: () => type,
    getStateKey: () => '',
    getContent: () => content,
    getSender: () => '@owner:server',
    event: { sender: '@owner:server' },
});

const fakeRoom = (
    client: unknown,
    {
        roomId,
        name,
        createType,
        joinRule = 'invite',
        myPower = 0,
        membership = 'join',
    }: FakeRoomSpec
): Room => {
    const events = new Map<string, unknown>([
        [
            'm.room.create',
            stateEvent('m.room.create', {
                ...(createType ? { type: createType } : {}),
                room_version: '10',
            }),
        ],
        [
            'm.room.power_levels',
            stateEvent('m.room.power_levels', {
                users: { [ME]: myPower, '@owner:server': 100 },
                users_default: 0,
                events_default: 0,
                state_default: 50,
                events: {},
            }),
        ],
    ]);
    const state = { getStateEvents: (type: string) => events.get(type) ?? null };
    return {
        roomId,
        name,
        client,
        getMyMembership: () => membership,
        getJoinRule: () => joinRule,
        getType: () => createType,
        getMembers: () => [],
        getLiveTimeline: () => ({ getState: () => state }),
        currentState: state,
    } as unknown as Room;
};

const ROOMS: FakeRoomSpec[] = [
    // Public, and the user may add rooms to it.
    {
        roomId: GARDEN,
        name: 'Garden Co-op',
        createType: 'm.space',
        joinRule: 'public',
        myPower: 100,
    },
    // The user is an ordinary member here.
    { roomId: GROVE, name: 'Locked Grove', createType: 'm.space', joinRule: 'invite', myPower: 0 },
    // A joined den, not a canopy: a panel URL can still name it as one.
    { roomId: '!den:server', name: 'general', myPower: 100 },
];

type Panel = {
    container: HTMLElement;
    router: ReturnType<typeof createMemoryRouter>;
    mx: MatrixClient;
    createRoom: ReturnType<typeof vi.fn>;
    sendStateEvent: ReturnType<typeof vi.fn>;
    /** Deliver a room "from sync": into the client, the room list, and `ClientEvent.Room`. */
    arrive: (spec: FakeRoomSpec) => Promise<void>;
};

const mounted: Array<{ root: ReactDOM.Root; container: HTMLElement }> = [];

const flush = async () => {
    await act(async () => {
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
};

const renderPanel = async (
    initialPath: string,
    { getCapabilities }: { getCapabilities?: () => Promise<Capabilities> } = {}
): Promise<Panel> => {
    const emitter = new EventEmitter();
    const rooms = new Map<string, Room>();
    const createRoom = vi.fn(async () => ({ room_id: NEW_ROOM_ID }));
    const sendStateEvent = vi.fn(async () => ({}));
    const mx = Object.assign(emitter, {
        isInitialSyncComplete: () => true,
        getCapabilities: vi.fn(getCapabilities ?? (async () => CAPABILITIES)),
        createRoom,
        sendStateEvent,
        getUserId: () => ME,
        getSafeUserId: () => ME,
        getDomain: () => 'server',
        getRoom: (roomId: string) => rooms.get(roomId) ?? null,
    }) as unknown as MatrixClient;

    const store = createStore();
    const setRooms = () => store.set(allRoomsBaseAtom, Array.from(rooms.values()));
    for (const spec of ROOMS) rooms.set(spec.roomId, fakeRoom(mx, spec));
    setRooms();
    store.set(mDirectAtom, { type: 'INITIALIZE', rooms: new Set<string>() });
    store.set(roomToParentsAtom, { type: 'INITIALIZE', roomToParents: new Map() });

    const router = createMemoryRouter(embedRoutes, { initialEntries: [initialPath] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push({ root, container });
    await act(async () => {
        root.render(
            <JotaiProvider store={store}>
                <MatrixClientProvider value={mx}>
                    <RouterProvider router={router} />
                </MatrixClientProvider>
            </JotaiProvider>
        );
    });
    await flush();

    const arrive = async (spec: FakeRoomSpec) => {
        const room = fakeRoom(mx, spec);
        rooms.set(spec.roomId, room);
        await act(async () => {
            setRooms();
            emitter.emit(ClientEvent.Room, room);
        });
        await flush();
    };
    return { container, router, mx, createRoom, sendStateEvent, arrive };
};

const $ = (container: HTMLElement, selector: string) => container.querySelector(selector);

const click = async (el: Element | null) => {
    expect(el).not.toBeNull();
    await act(async () => {
        el!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    await flush();
};

const kindButton = (container: HTMLElement, label: string): HTMLButtonElement => {
    const button = Array.from(container.querySelectorAll('button[aria-pressed]')).find((el) =>
        el.textContent?.startsWith(label)
    );
    expect(button, `chooser button ${label}`).toBeDefined();
    return button as HTMLButtonElement;
};

const submit = async (container: HTMLElement, name: string) => {
    const form = container.querySelector('form') as HTMLFormElement;
    expect(form).not.toBeNull();
    const nameInput = form.querySelector('input[name="nameInput"]') as HTMLInputElement;
    nameInput.value = name;
    // The forms read their controls as named properties (`form.nameInput`),
    // which browsers provide and jsdom does not.
    for (const control of Array.from(form.querySelectorAll('[name]'))) {
        Object.defineProperty(form, control.getAttribute('name') as string, {
            value: control,
            configurable: true,
        });
    }
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
};

type InitialStateEvent = { type: string; state_key?: string; content: Record<string, unknown> };
const sentOptions = (createRoom: ReturnType<typeof vi.fn>) =>
    (
        createRoom.mock.calls[0] as unknown as [
            {
                preset?: string;
                creation_content?: Record<string, unknown>;
                initial_state?: InitialStateEvent[];
            }
        ]
    )[0];
const stateSent = (createRoom: ReturnType<typeof vi.fn>, type: string) =>
    sentOptions(createRoom).initial_state?.find((event) => event.type === type);

const menuLabels = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-testid="embed-new-menu"] a')).map((a) => [
        a.textContent,
        a.getAttribute('href'),
    ]);

beforeEach(() => {
    // The real panel decides this once, from the /embed path it booted on.
    setNewRoomSurfaceForTests('panel');
    indexCanopyMock.mockClear();
});

afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
    setNewRoomSurfaceForTests(null);
    vi.useRealTimers();
});

describe('the New control in the panel header', () => {
    it('offers a new canopy from the panel home, and nothing scoped to a canopy', async () => {
        const { container } = await renderPanel('/embed');
        expect($(container, '[data-testid="embed-new-menu"]')).toBeNull();
        await click($(container, '[data-testid="embed-new"]'));
        expect($(container, '[data-testid="embed-new"]')?.getAttribute('aria-expanded')).toBe(
            'true'
        );
        expect(menuLabels(container)).toEqual([['New canopy', '/embed/new/canopy']]);
    });

    it('inside a canopy the user may add rooms to, also offers a den and a canopy there', async () => {
        const { container } = await renderPanel(`/embed/canopies/${enc(GARDEN)}`);
        await click($(container, '[data-testid="embed-new"]'));
        expect(menuLabels(container)).toEqual([
            ['New canopy', '/embed/new/canopy'],
            ['New den in Garden Co-op', `/embed/canopies/${enc(GARDEN)}/new/den`],
            ['New canopy in Garden Co-op', `/embed/canopies/${enc(GARDEN)}/new/canopy`],
        ]);
    });

    it('inside a canopy the user may not add rooms to, says so and offers nothing there', async () => {
        const { container } = await renderPanel(`/embed/canopies/${enc(GROVE)}`);
        await click($(container, '[data-testid="embed-new"]'));
        expect(menuLabels(container)).toEqual([['New canopy', '/embed/new/canopy']]);
        expect($(container, '[data-testid="embed-new-cannot-add"]')?.textContent).toBe(
            "You can't add rooms to Locked Grove."
        );
    });

    it('closes when one of its links navigates, and with Escape', async () => {
        const { container, router } = await renderPanel('/embed');
        await click($(container, '[data-testid="embed-new"]'));
        await click($(container, '[data-testid="embed-new-canopy"]'));
        expect(router.state.location.pathname).toBe('/embed/new/canopy');
        expect($(container, '[data-testid="embed-new-menu"]')).toBeNull();

        await click($(container, '[data-testid="embed-new"]'));
        expect($(container, '[data-testid="embed-new-menu"]')).not.toBeNull();
        await act(async () => {
            $(container, '[data-testid="embed-new"]')!.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );
        });
        expect($(container, '[data-testid="embed-new-menu"]')).toBeNull();
    });
});

describe('the New control on its own page', () => {
    it('closes when its link goes to the page already shown', async () => {
        const { container, router } = await renderPanel(`/embed/canopies/${enc(GARDEN)}/new/den`);
        await click($(container, '[data-testid="embed-new"]'));
        await click($(container, '[data-testid="embed-new-den-in-canopy"]'));
        expect(router.state.location.pathname).toBe(`/embed/canopies/${enc(GARDEN)}/new/den`);
        expect($(container, '[data-testid="embed-new-menu"]')).toBeNull();
    });
});

describe('a new canopy from the panel', () => {
    it('starts Private and unlisted, makes an invite-only space, then opens it in the panel', async () => {
        const { container, router, createRoom, arrive } = await renderPanel('/embed/new/canopy');
        expect($(container, '[data-testid="embed-new-invite-note"]')).not.toBeNull();
        expect(kindButton(container, 'Private').getAttribute('aria-pressed')).toBe('true');
        expect(
            $(container, '[data-testid="create-space-list-in-directory"]')?.getAttribute(
                'aria-checked'
            )
        ).toBe('false');

        await submit(container, 'Night Market');
        expect(createRoom).toHaveBeenCalledTimes(1);
        const opts = sentOptions(createRoom);
        expect(opts.creation_content).toMatchObject({ type: 'm.space' });
        expect(opts.preset).toBe('private_chat');
        expect(stateSent(createRoom, 'm.room.join_rules')?.content).toEqual({
            join_rule: 'invite',
        });
        // The client never asks for encryption on a space.
        expect(stateSent(createRoom, 'm.room.encryption')).toBeUndefined();
        expect(indexCanopyMock).not.toHaveBeenCalled();

        // Made, not yet synced: no form to press again.
        expect($(container, '[data-testid="embed-new-created"]')?.textContent).toContain(
            'Opening…'
        );
        expect($(container, 'form')).toBeNull();

        await arrive({
            roomId: NEW_ROOM_ID,
            name: 'Night Market',
            createType: 'm.space',
            myPower: 100,
        });
        expect(router.state.location.pathname).toBe(
            `/embed/canopies/${encodeURIComponent(NEW_ROOM_ID)}`
        );
        expect($(container, '[data-testid="embed-canopy"]')?.getAttribute('data-canopy-id')).toBe(
            NEW_ROOM_ID
        );
    });

    it('says so in the panel when the canopy was made but could not be listed', async () => {
        indexCanopyMock.mockRejectedValueOnce(new Error('not_canopy_admin'));
        const { container } = await renderPanel('/embed/new/canopy');
        const listToggle = $(container, '[data-testid="create-space-list-in-directory"]');
        await click(listToggle);
        expect(listToggle?.getAttribute('aria-checked')).toBe('true');

        await submit(container, 'Night Market');
        await flush();
        expect(indexCanopyMock).toHaveBeenCalledTimes(1);
        // The app shows its toasts from ClientLayout, which the panel does not
        // render; the panel's own outlet has to show this one. ("Opening…" is a
        // status too.)
        const statuses = Array.from(
            container.querySelectorAll('[data-testid="embed-root"] [role="status"]')
        ).map((el) => el.textContent ?? '');
        expect(statuses).toContainEqual(
            expect.stringContaining(
                'Night Market was created, but it could not be listed in the Blackout directory.'
            )
        );
    });

    it('inside a public canopy it still starts Private (L6), placed in that canopy', async () => {
        const { container, createRoom, sendStateEvent } = await renderPanel(
            `/embed/canopies/${enc(GARDEN)}/new/canopy`
        );
        expect(container.textContent).toContain('New canopy in Garden Co-op');
        expect(kindButton(container, 'Private').getAttribute('aria-pressed')).toBe('true');
        await submit(container, 'Seed Library');
        expect(stateSent(createRoom, 'm.room.join_rules')?.content).toEqual({
            join_rule: 'invite',
        });
        expect(stateSent(createRoom, 'm.space.parent')?.state_key).toBe(GARDEN);
        expect(sendStateEvent).toHaveBeenCalledWith(
            GARDEN,
            'm.space.child',
            expect.anything(),
            NEW_ROOM_ID
        );
    });
});

describe('a new den from the panel', () => {
    it('in a public canopy starts Restricted to it and encrypted, then opens in the panel', async () => {
        const { container, router, createRoom, sendStateEvent, arrive } = await renderPanel(
            `/embed/canopies/${enc(GARDEN)}/new/den`
        );
        expect(container.textContent).toContain('New den in Garden Co-op');
        expect(kindButton(container, 'Restricted').getAttribute('aria-pressed')).toBe('true');

        await submit(container, 'tool swap');
        expect(sentOptions(createRoom).preset).toBe('private_chat');
        expect(stateSent(createRoom, 'm.room.join_rules')?.content).toEqual({
            join_rule: 'restricted',
            allow: [{ type: 'm.room_membership', room_id: GARDEN }],
        });
        expect(stateSent(createRoom, 'm.room.encryption')).toBeDefined();
        expect(stateSent(createRoom, 'm.space.parent')?.state_key).toBe(GARDEN);
        expect(sendStateEvent).toHaveBeenCalledWith(
            GARDEN,
            'm.space.child',
            expect.anything(),
            NEW_ROOM_ID
        );
        expect($(container, 'form')).toBeNull();

        await arrive({ roomId: NEW_ROOM_ID, name: 'tool swap' });
        expect(router.state.location.pathname).toBe(
            `/embed/canopies/${enc(GARDEN)}/dens/${encodeURIComponent(NEW_ROOM_ID)}`
        );
        expect($(container, '[data-testid="stub-timeline"]')?.getAttribute('data-room-id')).toBe(
            NEW_ROOM_ID
        );
    });

    it('a Public den chosen on the panel is still never encrypted', async () => {
        const { container, createRoom } = await renderPanel(
            `/embed/canopies/${enc(GARDEN)}/new/den`
        );
        await click(kindButton(container, 'Public'));
        await submit(container, 'notice board');
        expect(sentOptions(createRoom).preset).toBe('public_chat');
        expect(stateSent(createRoom, 'm.room.encryption')).toBeUndefined();
    });

    it('is not offered in a canopy the user may not add rooms to', async () => {
        const { container, createRoom } = await renderPanel(
            `/embed/canopies/${enc(GROVE)}/new/den`
        );
        expect($(container, 'form')).toBeNull();
        expect($(container, '[data-testid="embed-not-shown"]')?.textContent).toContain(
            "You can't add rooms to Locked Grove."
        );
        expect(createRoom).not.toHaveBeenCalled();
    });

    it('is not offered when the URL names a joined room that is not a canopy', async () => {
        const { container, createRoom } = await renderPanel(
            `/embed/canopies/${enc('!den:server')}/new/den`
        );
        expect($(container, 'form')).toBeNull();
        expect($(container, '[data-testid="embed-not-shown"]')?.textContent).toContain(
            "This canopy isn't available in the panel."
        );
        expect(createRoom).not.toHaveBeenCalled();
    });

    it('is not offered for a canopy the user has not joined', async () => {
        const { container } = await renderPanel('/embed/canopies/not-joined/new/den');
        expect($(container, 'form')).toBeNull();
        expect($(container, '[data-testid="embed-not-shown"]')?.textContent).toContain(
            "This canopy isn't available in the panel."
        );
    });
});

describe('room versions before a form', () => {
    it('shows Loading… and no form until the homeserver answers', async () => {
        let answer: (caps: Capabilities) => void = () => undefined;
        const { container } = await renderPanel('/embed/new/canopy', {
            getCapabilities: () =>
                new Promise<Capabilities>((resolve) => {
                    answer = resolve;
                }),
        });
        expect($(container, '[data-testid="embed-new-loading"]')).not.toBeNull();
        expect($(container, 'form')).toBeNull();
        await act(async () => answer(CAPABILITIES));
        await flush();
        expect($(container, 'form')).not.toBeNull();
    });

    it('offers no form when they cannot be read, rather than guess version 1', async () => {
        for (const getCapabilities of [
            async () => {
                throw new Error('offline');
            },
            async () => ({} as Capabilities),
        ]) {
            const { container, createRoom } = await renderPanel('/embed/new/canopy', {
                getCapabilities,
            });
            expect($(container, 'form')).toBeNull();
            expect($(container, '[data-testid="embed-not-shown"]')?.textContent).toContain(
                "couldn't read which room versions"
            );
            expect(createRoom).not.toHaveBeenCalled();
        }
    });
});

describe('after the room is made', () => {
    it('says so, with a link into the panel, if it has not arrived from sync in time', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { container, router } = await renderPanel('/embed/new/canopy');
        await submit(container, 'Night Market');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(15_000);
        });
        await flush();
        const created = $(container, '[data-testid="embed-new-created"]');
        expect(created?.textContent).toContain("It was made, but hasn't reached the panel yet.");
        expect(router.state.location.pathname).toBe('/embed/new/canopy');
        expect(created?.querySelector('a')?.getAttribute('href')).toBe(
            `/embed/canopies/${encodeURIComponent(NEW_ROOM_ID)}`
        );
    });

    it('every link on the New pages stays in the panel or opens a new tab', async () => {
        for (const path of [
            '/embed/new/canopy',
            `/embed/canopies/${enc(GARDEN)}/new/den`,
            `/embed/canopies/${enc(GROVE)}/new/den`,
        ]) {
            const { container } = await renderPanel(path);
            for (const anchor of Array.from(container.querySelectorAll('a[href]'))) {
                const href = anchor.getAttribute('href') ?? '';
                if (href.startsWith('/embed')) continue;
                expect(anchor.getAttribute('target'), href).toBe('_blank');
                expect(anchor.getAttribute('rel'), href).toBe('noopener noreferrer');
            }
        }
    });
});

describe('waitForJoinedRoom', () => {
    const client = (rooms: Map<string, string>) =>
        Object.assign(new EventEmitter(), {
            getRoom: (roomId: string) =>
                rooms.has(roomId) ? { getMyMembership: () => rooms.get(roomId) } : null,
        }) as unknown as MatrixClient & EventEmitter;

    it('resolves at once for a joined room', async () => {
        await expect(waitForJoinedRoom(client(new Map([['!r', 'join']])), '!r')).resolves.toBe(
            true
        );
    });

    it('resolves when the room arrives joined, and drops its listeners', async () => {
        const rooms = new Map<string, string>();
        const mx = client(rooms);
        const waiting = waitForJoinedRoom(mx, '!r');
        expect(mx.listenerCount(ClientEvent.Room)).toBe(1);
        rooms.set('!r', 'invite');
        mx.emit(ClientEvent.Room);
        rooms.set('!r', 'join');
        mx.emit(ClientEvent.Room);
        await expect(waiting).resolves.toBe(true);
        expect(mx.listenerCount(ClientEvent.Room)).toBe(0);
    });

    it('resolves false on timeout or abort, and drops its listeners', async () => {
        const mx = client(new Map());
        await expect(waitForJoinedRoom(mx, '!r', { timeoutMs: 5 })).resolves.toBe(false);
        const controller = new AbortController();
        const waiting = waitForJoinedRoom(mx, '!r', { signal: controller.signal });
        controller.abort();
        await expect(waiting).resolves.toBe(false);
        expect(mx.listenerCount(ClientEvent.Room)).toBe(0);
    });
});
