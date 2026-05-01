// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Room } from 'matrix-js-sdk';
import ClientLayout from '../../../../../src/app/pages/client/ClientLayout';
import DraupnirRoutePage from '../../../../../src/app/features/moderation/draupnir/DraupnirRoutePage';
import {
    authStateAtom,
    matrixClientAtom,
    userIdAtom,
} from '../../../../../src/app/state/bmc-auth';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const makeRoom = (roomId: string, name: string, powerLevel: number): Room =>
    ({
        roomId,
        name,
        getType: () => undefined,
        getCanonicalAlias: () => `#${name}:example.org`,
        getUnreadNotificationCount: () => 0,
        getMyMembership: () => 'join',
        getJoinedMembers: () => [],
        currentState: {
            getStateEvents: (eventType: string) => {
                if (eventType === 'm.room.power_levels') {
                    return {
                        getContent: () => ({
                            users: { '@mod:example.org': powerLevel },
                            users_default: 0,
                        }),
                    };
                }
                if (eventType === 'm.space.child') return [];
                if (eventType === 'm.room.pinned_events')
                    return { getContent: () => ({ pinned: [] }) };
                return undefined;
            },
        },
    }) as unknown as Room;

vi.mock('../../../../../src/app/features/moderation/draupnir/ModDashboard', () => ({
    ModDashboard: () => <h1>Draupnir Moderation Dashboard</h1>,
}));

vi.mock('../../../../../src/app/features/deaddrop', () => ({
    DeadDropComposer: () => null,
    DeadDropIndicator: () => null,
    DeadDropSettings: () => null,
    useDeadDrop: () => ({ data: { enabled: false }, queueCount: 0 }),
    useDeadDropQueueActions: () => ({}),
    useSetDeadDrop: () => () => {},
    describeDeadDropSchedule: () => '',
    getNextDeliveryDate: () => null,
    deaddropFeature: { id: 'deaddrop', name: 'Deaddrop', customizations: [] },
    deaddropNavItems: [],
    deaddropRoutes: [],
    deaddropSettings: [],
    mutualAidPanels: [],
    mutualAidRoutes: [],
    mutualAidSettings: [],
    MutualAidPage: () => null,
    DEAD_DROP_COMMAND_EVENT_TYPE: 'co.bmc.deaddrop.command',
    DEAD_DROP_EVENT_TYPE: 'co.bmc.deaddrop',
    DEAD_DROP_QUEUE_EVENT_TYPE: 'co.bmc.deaddrop.queue',
    DEAD_DROP_SCHEMA_VERSION: 1,
}));

vi.mock('../../../../../src/app/features/settings', () => ({
    SettingsPage: () => null,
}));

vi.mock('../../../../../src/app/features/room/MessageComposer', () => ({
    default: () => null,
}));

vi.mock('../../../../../src/app/features/room/RoomTimeline', () => ({
    default: () => null,
}));

vi.mock('../../../../../src/app/features/navigation/QuickSwitcher', () => ({
    QuickSwitcher: () => null,
}));

vi.mock('../../../../../src/app/features/navigation/useMentionNavigation', () => ({
    useMentionNavigation: () => ({ openRoomWithContext: vi.fn() }),
}));

vi.mock('../../../../../src/app/features/navigation/useInboxModel', () => ({
    useInboxModel: () => ({ items: [], markReadLocal: vi.fn(), markAllRead: vi.fn() }),
}));

vi.mock('../../../../../src/app/features/navigation/GlobalMentionsInbox', () => ({
    default: () => null,
}));

vi.mock('../../../../../src/app/features/call', () => ({
    useOptionalCall: () => null,
}));

vi.mock('../../../../../src/app/hooks/useRoom', () => ({
    useRoom: () => ({ data: null, loading: false, error: null }),
}));

vi.mock('../../../../../src/app/hooks/useTimeline', () => ({
    useRoomTimeline: () => ({ data: [], loading: false, error: null }),
}));

vi.mock('../../../../../src/app/features/right-panel/RightPanelContent', () => ({
    default: () => null,
}));

describe('Draupnir moderation navigation', () => {
    afterEach(() => {
        act(() => {
            mountedRoots.splice(0).forEach((root) => root.unmount());
        });
        document.body.innerHTML = '';
    });

    it('navigates from ClientLayout moderation entry to Draupnir dashboard route', async () => {
        const rooms = [makeRoom('!mod:example.org', 'Moderation HQ', 100)];
        const mockClient = {
            getRooms: () => rooms,
            getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
            getUser: () => ({ presence: 'online' }),
            setAccountData: vi.fn().mockResolvedValue(undefined),
            leave: vi.fn().mockResolvedValue(undefined),
            joinRoom: vi.fn().mockResolvedValue({ roomId: '!joined:example.org' }),
        };

        const store = createStore();
        store.set(authStateAtom, 'logged_in');
        store.set(matrixClientAtom, mockClient as never);
        store.set(userIdAtom, '@mod:example.org');

        const router = createMemoryRouter(
            [
                {
                    path: '/',
                    element: (
                        <Provider store={store}>
                            <ClientLayout />
                        </Provider>
                    ),
                },
                {
                    path: '/moderation/draupnir',
                    element: (
                        <Provider store={store}>
                            <DraupnirRoutePage />
                        </Provider>
                    ),
                },
            ],
            { initialEntries: ['/'] },
        );

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        mountedRoots.push(root);

        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });

        const moderationLink = Array.from(container.querySelectorAll('a')).find(
            (link) => link.textContent === 'Moderation',
        ) as HTMLAnchorElement;
        expect(moderationLink).toBeTruthy();

        await act(async () => {
            moderationLink.dispatchEvent(
                new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
            );
            await Promise.resolve();
        });

        expect(container.textContent).toContain('Draupnir Moderation Dashboard');
    });
});
