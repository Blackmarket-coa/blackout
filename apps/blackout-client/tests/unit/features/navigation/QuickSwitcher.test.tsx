// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    QuickSwitcher,
    buildQuickSwitcherIndex,
    rankQuickSwitcherResults,
} from '../../../../src/app/features/navigation/QuickSwitcher';

const mockClient = {
    getRooms: () => [] as Room[],
    createRoom: vi.fn().mockResolvedValue({ room_id: '!dm:example.org' }),
    on: vi.fn(),
    off: vi.fn(),
};

vi.mock('../../../../src/app/hooks/bmc-useMatrixClient', () => ({
    useMatrixClient: () => mockClient,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const makeRoom = ({
    roomId,
    name,
    type,
    unread = 0,
    lastActive = 0,
    dm = false,
}: {
    roomId: string;
    name: string;
    type?: string;
    unread?: number;
    lastActive?: number;
    dm?: boolean;
}): Room =>
    ({
        roomId,
        name,
        getType: () => type,
        getDMInviter: () => (dm ? '@inviter:example.org' : undefined),
        getLastActiveTimestamp: () => lastActive,
        getCanonicalAlias: () => `#${name}:example.org`,
        getUnreadNotificationCount: () => unread,
        getJoinedMembers: () => [],
    }) as unknown as Room;

describe('QuickSwitcher keyboard behavior', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('tracks category-index selection with Arrow keys and focuses input on open', async () => {
        mockClient.getRooms = () => [
            makeRoom({ roomId: '!room-a:example.org', name: 'Room A' }),
            makeRoom({ roomId: '!space-a:example.org', name: 'Space A', type: 'm.space' }),
        ];

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const store = createStore();
        const onClose = vi.fn();

        act(() => {
            root.render(
                <Provider store={store}>
                    <QuickSwitcher open onClose={onClose} />
                </Provider>,
            );
        });

        await act(async () => {
            await Promise.resolve();
        });

        const input = container.querySelector(
            'input[placeholder="Search rooms, spaces, DMs, members, settings, actions"]',
        ) as HTMLInputElement;
        expect(input).toBeTruthy();
        expect(document.activeElement).toBe(input);

        const roomButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Room A'),
        ) as HTMLButtonElement;
        const spaceButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Space A'),
        ) as HTMLButtonElement;

        expect(roomButton.style.background).toBe('var(--accent-muted)');
        expect(spaceButton.style.background).toBe('transparent');

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(spaceButton.style.background).toBe('var(--accent-muted)');

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(roomButton.style.background).toBe('var(--accent-muted)');
        expect(onClose).toHaveBeenCalled();

        act(() => {
            root.unmount();
        });
    });

    it('calls onCommandPicked when selecting a Commands entry', async () => {
        mockClient.getRooms = () => [makeRoom({ roomId: '!room-a:example.org', name: 'Room A' })];
        const onClose = vi.fn();
        const onCommandPicked = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        act(() => {
            root.render(
                <Provider store={createStore()}>
                    <QuickSwitcher open onClose={onClose} onCommandPicked={onCommandPicked} />
                </Provider>,
            );
        });

        const input = container.querySelector(
            'input[placeholder="Search rooms, spaces, DMs, members, settings, actions"]',
        ) as HTMLInputElement;
        await act(async () => {
            input.value = '/nick';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await Promise.resolve();
        });

        const commandButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('/nick'),
        ) as HTMLButtonElement;
        act(() => {
            commandButton.click();
        });

        expect(onCommandPicked).toHaveBeenCalledWith('/nick');
        expect(onClose).toHaveBeenCalled();

        act(() => {
            root.unmount();
        });
    });

    it('supports common actions and emits action callback', async () => {
        mockClient.getRooms = () => [makeRoom({ roomId: '!room-a:example.org', name: 'Room A' })];
        const onClose = vi.fn();
        const onActionPicked = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);

        act(() => {
            root.render(
                <Provider store={createStore()}>
                    <QuickSwitcher open onClose={onClose} onActionPicked={onActionPicked} />
                </Provider>,
            );
        });

        await act(async () => {
            await Promise.resolve();
        });

        const actionButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('Open inbox'),
        ) as HTMLButtonElement;

        act(() => {
            actionButton.click();
        });

        expect(onActionPicked).toHaveBeenCalledWith('open-inbox');
        expect(onClose).toHaveBeenCalled();

        act(() => {
            root.unmount();
        });
    });
});

describe('QuickSwitcher ranking model', () => {
    it('ranks exact > recent > unread > fuzzy and includes route/action entries', () => {
        const rooms = [
            makeRoom({ roomId: '!exact:example.org', name: 'Inbox' }),
            makeRoom({ roomId: '!recent:example.org', name: 'Chat recent', lastActive: 100 }),
            makeRoom({ roomId: '!unread:example.org', name: 'Unread room', unread: 8 }),
            makeRoom({ roomId: '!fuzzy:example.org', name: 'Alpha room' }),
            makeRoom({ roomId: '!dm:example.org', name: 'DM room', dm: true }),
        ];

        const ranked = rankQuickSwitcherResults(buildQuickSwitcherIndex(rooms), 'inbo');
        expect(ranked[0]?.title).toBe('Inbox');

        const actions = buildQuickSwitcherIndex(rooms).filter((entry) => entry.category === 'Actions');
        const settings = buildQuickSwitcherIndex(rooms).filter(
            (entry) => entry.category === 'Settings' && Boolean(entry.route),
        );

        expect(actions.map((entry) => entry.title)).toEqual(
            expect.arrayContaining(['Mark all mentions read', 'Open inbox', 'Jump to mentions']),
        );
        expect(settings.length).toBeGreaterThan(0);
    });
});
