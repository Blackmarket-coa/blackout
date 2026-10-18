// @vitest-environment jsdom
/**
 * The custom den form: the access chooser is at the top of the form on both
 * surfaces (not under "Advanced options"), its default follows the one table
 * in `newRoomDefaults.ts` per surface and parent canopy, a Public den is
 * never encrypted, and a passed `defaultKind` is the default (the `??` / `?:`
 * precedence fix).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { Capabilities, MatrixClient, Room } from 'matrix-js-sdk';

import { CreateRoomForm } from './CreateRoom';
import { MatrixClientProvider } from '../../hooks/useMatrixClient';
import { CapabilitiesProvider } from '../../hooks/useCapabilities';
import {
    CreateRoomKind,
    setNewRoomSurfaceForTests,
    type NewRoomSurface,
} from '../../components/create-room';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Room version 10 supports `restricted`.
const CAPABILITIES = {
    'm.room_versions': { default: '10', available: { '10': 'stable' } },
} as unknown as Capabilities;

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
    const mx = {
        createRoom,
        sendStateEvent: vi.fn(async () => ({})),
        getUserId: () => '@alice:server',
        getSafeUserId: () => '@alice:server',
        getDomain: () => 'server',
    } as unknown as MatrixClient;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mounted.push({ root, container });
    await act(async () => {
        root.render(
            <MatrixClientProvider value={mx}>
                <CapabilitiesProvider value={CAPABILITIES}>
                    <CreateRoomForm
                        space={props.space}
                        defaultKind={props.defaultKind}
                        onCreate={vi.fn()}
                    />
                </CapabilitiesProvider>
            </MatrixClientProvider>
        );
    });
    return { container, createRoom };
};

const kindButton = (container: HTMLElement, label: string): HTMLButtonElement => {
    const button = Array.from(container.querySelectorAll('button[aria-pressed]')).find((el) =>
        el.textContent?.startsWith(label)
    );
    expect(button, `chooser button ${label}`).toBeDefined();
    return button as HTMLButtonElement;
};

const pressed = (container: HTMLElement, label: string) =>
    kindButton(container, label).getAttribute('aria-pressed') === 'true';

const submit = async (container: HTMLElement, name = 'general') => {
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
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

const initialStateSent = (createRoom: ReturnType<typeof vi.fn>) => {
    const [opts] = createRoom.mock.calls[0] as unknown as [
        { initial_state?: Array<{ type: string; content: Record<string, unknown> }> }
    ];
    return opts.initial_state ?? [];
};

afterEach(() => {
    for (const { root, container } of mounted.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
    vi.unstubAllEnvs();
    setNewRoomSurfaceForTests(null);
});

describe('CreateRoomForm', () => {
    it('shows the access chooser at the top without opening Advanced options', async () => {
        const { container } = await renderForm({ surface: 'app' });
        // Three choices rendered (Restricted needs a parent canopy), before
        // anything else in the form, with the chooser copy that says what a
        // Public den means for encryption.
        const choices = Array.from(container.querySelectorAll('button[aria-pressed]'));
        expect(choices.map((el) => el.textContent)).toEqual([
            'PrivateOnly invited people can join this den. Messages are end-to-end encrypted by default.',
            'PublicAnyone can find and join this den. Messages are not end-to-end encrypted.',
        ]);
        const form = container.querySelector('form') as HTMLFormElement;
        const nameInput = form.querySelector('input[name="nameInput"]') as HTMLInputElement;
        // The chooser comes before the name field, and no "Advanced options"
        // chip was clicked to reveal it.
        expect(
            choices[0].compareDocumentPosition(nameInput) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(container.textContent).toContain('Advanced options');
        expect(container.textContent).not.toContain('Topic (Optional)');
    });

    it('in the app, a den with no canopy defaults to Public and is created unencrypted', async () => {
        const { container, createRoom } = await renderForm({ surface: 'app' });
        expect(pressed(container, 'Public')).toBe(true);
        await submit(container);
        const state = initialStateSent(createRoom);
        expect(state.find((e) => e.type === 'm.room.join_rules')?.content).toEqual({
            join_rule: 'public',
        });
        expect(state.some((e) => e.type === 'm.room.encryption')).toBe(false);
    });

    it('in the panel, a den with no canopy defaults to Private and is created encrypted', async () => {
        const { container, createRoom } = await renderForm({ surface: 'panel' });
        expect(pressed(container, 'Private')).toBe(true);
        await submit(container);
        const state = initialStateSent(createRoom);
        expect(state.find((e) => e.type === 'm.room.join_rules')?.content).toEqual({
            join_rule: 'invite',
        });
        expect(state.some((e) => e.type === 'm.room.encryption')).toBe(true);
    });

    it('inside a public canopy: Public in the app, Restricted in the panel', async () => {
        const app = await renderForm({ surface: 'app', space: fakeCanopy('public') });
        expect(pressed(app.container, 'Public')).toBe(true);
        const panel = await renderForm({ surface: 'panel', space: fakeCanopy('public') });
        expect(pressed(panel.container, 'Restricted')).toBe(true);
    });

    it('inside a canopy that is not public: Restricted on both surfaces, encrypted', async () => {
        for (const surface of ['app', 'panel'] as const) {
            const { container, createRoom } = await renderForm({
                surface,
                space: fakeCanopy('invite'),
            });
            expect(pressed(container, 'Restricted')).toBe(true);
            await submit(container);
            const state = initialStateSent(createRoom);
            expect(state.find((e) => e.type === 'm.room.join_rules')?.content).toEqual({
                join_rule: 'restricted',
                allow: [{ type: 'm.room_membership', room_id: '!canopy:server' }],
            });
            expect(state.some((e) => e.type === 'm.room.encryption')).toBe(true);
        }
    });

    it('with the build-time switch set to private, the app defaults like the panel', async () => {
        vi.stubEnv('VITE_BLACKOUT_NEW_ROOM_DEFAULT', 'private');
        const loose = await renderForm({ surface: 'app' });
        expect(pressed(loose.container, 'Private')).toBe(true);
        const inPublic = await renderForm({ surface: 'app', space: fakeCanopy('public') });
        expect(pressed(inPublic.container, 'Restricted')).toBe(true);
    });

    it('a passed defaultKind wins (the `??` / `?:` precedence fix)', async () => {
        // Before the fix any passed kind became Restricted (with a parent) or
        // Private (without), never the kind that was passed.
        const { container } = await renderForm({
            surface: 'panel',
            space: fakeCanopy('invite'),
            defaultKind: CreateRoomKind.Public,
        });
        expect(pressed(container, 'Public')).toBe(true);
        expect(container.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(1);
    });
});
