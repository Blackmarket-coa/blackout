// @vitest-environment jsdom
/**
 * The New canopy form: its default access per surface and parent canopy, the
 * "List in the Blackout directory" toggle, and the rule that `indexCanopy`
 * runs only for a Public canopy or when the toggle is on. Also pins the
 * operator-precedence fix: a passed `defaultKind` is the default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { getDefaultStore } from 'jotai';
import type { Capabilities, MatrixClient, Room } from 'matrix-js-sdk';

const indexCanopyMock = vi.fn(async () => ({}));
vi.mock('../discovery/discoveryClient', () => ({
    indexCanopy: (...args: unknown[]) => indexCanopyMock(...(args as [])),
}));

import { CreateSpaceForm } from './CreateSpace';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import { CapabilitiesProvider } from '../../hooks/useCapabilities';
import {
    CreateRoomKind,
    setNewRoomSurfaceForTests,
    type NewRoomSurface,
} from '../../components/create-room';
import { toastQueueAtom } from '../../state/notifications/toast';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Room version 10 supports `restricted`.
const CAPABILITIES = {
    'm.room_versions': { default: '10', available: { '10': 'stable' } },
} as unknown as Capabilities;

/** A canopy the form is opened inside, with just enough of a Room for the helper. */
const fakeCanopy = (joinRule: string): Room =>
    ({
        roomId: '!canopy:server',
        name: 'Garden Co-op',
        getJoinRule: () => joinRule,
        getType: () => 'm.space',
        getMembers: () => [],
        getLiveTimeline: () => ({ getState: () => null }),
        currentState: { getStateEvents: () => null },
    } as unknown as Room);

const mounted: Array<{ root: ReactDOM.Root; container: HTMLElement }> = [];

const renderForm = async (props: {
    surface: NewRoomSurface;
    space?: Room;
    defaultKind?: CreateRoomKind;
}) => {
    setNewRoomSurfaceForTests(props.surface);
    const createRoom = vi.fn(async () => ({ room_id: '!new:server' }));
    const sendStateEvent = vi.fn(async () => ({}));
    const mx = {
        createRoom,
        sendStateEvent,
        getUserId: () => '@alice:server',
        getSafeUserId: () => '@alice:server',
        getDomain: () => 'server',
    } as unknown as MatrixClient;
    const onCreate = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push({ root, container });
    await act(async () => {
        root.render(
            <MatrixClientProvider value={mx}>
                <CapabilitiesProvider value={CAPABILITIES}>
                    <CreateSpaceForm
                        space={props.space}
                        defaultKind={props.defaultKind}
                        onCreate={onCreate}
                    />
                </CapabilitiesProvider>
            </MatrixClientProvider>
        );
    });
    return { container, createRoom, sendStateEvent, onCreate };
};

/** Exactly one chooser button is pressed at a time. */
const expectOnePressed = (container: HTMLElement) => {
    expect(container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
};

const kindButton = (container: HTMLElement, label: string): HTMLButtonElement => {
    const button = Array.from(container.querySelectorAll('button[aria-pressed]')).find((el) =>
        el.textContent?.startsWith(label)
    );
    expect(button, `chooser button ${label}`).toBeDefined();
    return button as HTMLButtonElement;
};

const click = async (el: Element) => {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
};

const submit = async (container: HTMLElement, name = 'Garden Co-op') => {
    const form = container.querySelector('form') as HTMLFormElement;
    const nameInput = form.querySelector('input[name="nameInput"]') as HTMLInputElement;
    nameInput.value = name;
    // The form reads its controls as named properties (`form.nameInput`),
    // which browsers provide and jsdom does not; give the fake form the same.
    for (const control of Array.from(form.querySelectorAll('[name]'))) {
        Object.defineProperty(form, control.getAttribute('name') as string, {
            value: control,
            configurable: true,
        });
    }
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    // Let the create promise and its `.then` settle.
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return form;
};

const joinRuleSent = (createRoom: ReturnType<typeof vi.fn>) => {
    const [opts] = createRoom.mock.calls[0] as unknown as [
        { initial_state?: Array<{ type: string; content: Record<string, unknown> }> }
    ];
    return opts.initial_state?.find((event) => event.type === 'm.room.join_rules')?.content;
};

const presetSent = (createRoom: ReturnType<typeof vi.fn>): unknown =>
    (createRoom.mock.calls[0] as unknown as [{ preset?: string }])[0].preset;

const listToggle = (container: HTMLElement) =>
    container.querySelector('[data-testid="create-space-list-in-directory"]');

beforeEach(() => {
    indexCanopyMock.mockClear();
    getDefaultStore().set(toastQueueAtom, []);
});

afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
    vi.unstubAllEnvs();
    setNewRoomSurfaceForTests(null);
});

describe('CreateSpaceForm in the Blackout app', () => {
    it('defaults to Public, shows that a public canopy is listed, and offers no toggle', async () => {
        const { container } = await renderForm({ surface: 'app' });
        expect(kindButton(container, 'Public').getAttribute('aria-pressed')).toBe('true');
        // A Public canopy is listed, so "find and join" is true of it (a den's
        // chooser says only "join"); a canopy's chooser makes no encryption claim.
        expect(kindButton(container, 'Public').textContent).toBe(
            'PublicAnyone can find and join this canopy.'
        );
        expect(container.querySelector('[data-testid="create-space-listed-note"]')).not.toBeNull();
        expect(listToggle(container)).toBeNull();
    });

    it('creates a public space and lists it in the directory', async () => {
        const { container, createRoom } = await renderForm({ surface: 'app' });
        await submit(container);
        expect(createRoom).toHaveBeenCalledTimes(1);
        expect(joinRuleSent(createRoom)).toEqual({ join_rule: 'public' });
        // A public space names `public_chat` (see `createRoomPreset`).
        expect(presetSent(createRoom)).toBe('public_chat');
        expect(indexCanopyMock).toHaveBeenCalledTimes(1);
        expect(indexCanopyMock).toHaveBeenCalledWith({
            canopyId: '!new:server',
            name: 'Garden Co-op',
            summary: undefined,
        });
        expect(getDefaultStore().get(toastQueueAtom)).toEqual([]);
    });

    it('a listing that fails is reported in a toast; the canopy is still created', async () => {
        // The API refuses a listing it cannot check on the homeserver, or from
        // someone who is not the canopy's admin.
        indexCanopyMock.mockRejectedValueOnce(new Error('Request failed (503)'));
        const { container, onCreate } = await renderForm({ surface: 'app' });
        await submit(container);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(indexCanopyMock).toHaveBeenCalledTimes(1);
        expect(onCreate).toHaveBeenCalledWith('!new:server');
        const toasts = getDefaultStore().get(toastQueueAtom);
        expect(toasts).toHaveLength(1);
        expect(toasts[0].variant).toBe('Critical');
        expect(toasts[0].message).toContain(
            'Garden Co-op was created, but it could not be listed in the Blackout directory.'
        );
    });

    it('inside a public canopy the new sub-canopy is Public too', async () => {
        const { container } = await renderForm({ surface: 'app', space: fakeCanopy('public') });
        expect(kindButton(container, 'Public').getAttribute('aria-pressed')).toBe('true');
    });

    it('inside a canopy that is not public it is Restricted to that canopy', async () => {
        const { container, createRoom } = await renderForm({
            surface: 'app',
            space: fakeCanopy('invite'),
        });
        expect(kindButton(container, 'Restricted').getAttribute('aria-pressed')).toBe('true');
        await submit(container);
        expect(joinRuleSent(createRoom)).toEqual({
            join_rule: 'restricted',
            allow: [{ type: 'm.room_membership', room_id: '!canopy:server' }],
        });
        expect(indexCanopyMock).not.toHaveBeenCalled();
    });

    it('a canopy switched to Private is not listed unless the toggle is turned on', async () => {
        const { container, createRoom } = await renderForm({ surface: 'app' });
        await click(kindButton(container, 'Private'));
        expect(listToggle(container)).not.toBeNull();
        expect(listToggle(container)?.getAttribute('aria-checked')).toBe('false');
        await submit(container);
        expect(joinRuleSent(createRoom)).toEqual({ join_rule: 'invite' });
        expect(presetSent(createRoom)).toBe('private_chat');
        expect(indexCanopyMock).not.toHaveBeenCalled();
    });

    it('with the build-time switch set to private, it defaults to Private', async () => {
        vi.stubEnv('VITE_BLACKOUT_NEW_ROOM_DEFAULT', 'private');
        const { container } = await renderForm({ surface: 'app' });
        expect(kindButton(container, 'Private').getAttribute('aria-pressed')).toBe('true');
        expect(listToggle(container)).not.toBeNull();
    });
});

describe('CreateSpaceForm in the Black Mask panel', () => {
    it('defaults to Private with the listing toggle shown and off, and does not list', async () => {
        const { container, createRoom } = await renderForm({ surface: 'panel' });
        expect(kindButton(container, 'Private').getAttribute('aria-pressed')).toBe('true');
        expectOnePressed(container);
        expect(listToggle(container)).not.toBeNull();
        expect(listToggle(container)?.getAttribute('aria-checked')).toBe('false');
        await submit(container);
        expect(joinRuleSent(createRoom)).toEqual({ join_rule: 'invite' });
        expect(indexCanopyMock).not.toHaveBeenCalled();
    });

    it('lists a private canopy when the toggle is turned on', async () => {
        const { container } = await renderForm({ surface: 'panel' });
        await click(listToggle(container)!);
        expect(listToggle(container)?.getAttribute('aria-checked')).toBe('true');
        await submit(container);
        expect(indexCanopyMock).toHaveBeenCalledTimes(1);
    });

    it('a canopy switched to Public is listed without the toggle', async () => {
        const { container } = await renderForm({ surface: 'panel' });
        await click(kindButton(container, 'Public'));
        expect(listToggle(container)).toBeNull();
        await submit(container);
        expect(indexCanopyMock).toHaveBeenCalledTimes(1);
    });

    it('a passed defaultKind wins (the `??` / `?:` precedence fix)', async () => {
        // Before the fix `defaultKind ?? allowRestricted ? Restricted : Private`
        // parsed as `(defaultKind ?? allowRestricted) ? Restricted : Private`,
        // so any passed kind became Restricted.
        const { container } = await renderForm({
            surface: 'panel',
            space: fakeCanopy('invite'),
            defaultKind: CreateRoomKind.Public,
        });
        expect(kindButton(container, 'Public').getAttribute('aria-pressed')).toBe('true');
        expectOnePressed(container);
    });
});
