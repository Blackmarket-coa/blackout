// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import type { Room } from 'matrix-js-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

import { CanopyRail } from '../../../../src/app/pages/shell/CanopyRail';
import { allRoomsBaseAtom } from '../../../../src/app/state/rooms';
import { roomToParentsAtom } from '../../../../src/app/state/room/roomToParents';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../../../src/app/state/navigation';
import {
    canopyRailLayoutAtom,
    itemKey,
    type CanopyRailLayout,
} from '../../../../src/app/state/canopyLayout';
import { capabilityContextAtom } from '../../../../src/app/core/features/capabilityContext';
import { defaultFeatureFlags } from '../../../../src/app/core/features/featureFlags';

const makeRoom = (
    roomId: string,
    name: string,
    type: string | undefined,
    unread = 0,
    highlight = 0
): Room =>
    ({
        roomId,
        name,
        getType: () => type,
        getMyMembership: () => 'join',
        getUnreadNotificationCount: (kind?: string) => (kind === 'highlight' ? highlight : unread),
        isSpaceRoom: () => type === 'm.space',
        getMxcAvatarUrl: () => null,
    } as unknown as Room);

const makeSpace = (roomId: string, name: string): Room => makeRoom(roomId, name, 'm.space');

const makeDen = (roomId: string, name: string, unread = 0, highlight = 0): Room =>
    makeRoom(roomId, name, undefined, unread, highlight);

type RenderOptions = {
    parents?: Map<string, Set<string>>;
    selectedSpaceId?: string;
    selectedRoomId?: string;
    layout?: CanopyRailLayout;
};

const render = (
    rooms: Room[],
    options: RenderOptions = {}
): { container: HTMLElement; store: ReturnType<typeof createStore> } => {
    const store = createStore();
    store.set(allRoomsBaseAtom, rooms as never);
    store.set(capabilityContextAtom, {
        capabilities: [],
        flags: { ...defaultFeatureFlags, shellAppShell: true },
    });
    if (options.parents) {
        store.set(roomToParentsAtom, { type: 'INITIALIZE', roomToParents: options.parents });
    }
    if (options.selectedSpaceId) store.set(selectedSpaceIdAtom, options.selectedSpaceId);
    if (options.selectedRoomId) store.set(selectedRoomIdAtom, options.selectedRoomId);
    if (options.layout) store.set(canopyRailLayoutAtom, options.layout);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: <Outlet />,
                children: [{ path: '*', element: <CanopyRail /> }],
            },
        ],
        { initialEntries: ['/'] }
    );
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(
            <JotaiProvider store={store}>
                <RouterProvider router={router} />
            </JotaiProvider>
        );
    });
    return { container, store };
};

describe('CanopyRail', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders icon tiles that stay name-accessible plus the discover/create affordances', () => {
        const { container } = render([makeSpace('!canopy:example.org', 'Black Market Coalition')]);
        const item = container.querySelector(
            '[data-testid="canopy-sidebar-item-!canopy:example.org"]'
        );
        expect(item?.getAttribute('aria-label')).toBe('Black Market Coalition');
        expect(item?.getAttribute('title')).toBe('Black Market Coalition');
        expect(item?.textContent).toContain('BL');
        expect(container.querySelector('[data-testid="canopy-sidebar-discover"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="canopy-sidebar-create"]')).toBeTruthy();
    });

    it('excludes destinations already in the top nav from the registry rail', () => {
        const { container } = render([]);
        // Canopies / Creator Hub / Coalition / Coliseum / Home live in the
        // top nav, so their sidebar registry entries must not be duplicated.
        expect(
            container.querySelector('[data-testid="registry-panel-communities.sidebar"]')
        ).toBeNull();
        expect(
            container.querySelector('[data-testid="registry-panel-streaming.sidebar"]')
        ).toBeNull();
        expect(
            container.querySelector('[data-testid="registry-panel-coalition.sidebar"]')
        ).toBeNull();
    });

    it('always offers the Home affordance the navigation audit expects', () => {
        const { container } = render([]);
        const home = container.querySelector('[data-testid="primary-rail-home"]');
        expect(home).toBeTruthy();
        expect(home?.getAttribute('href')).toBe('/');
    });

    it('marks the selected canopy with aria-current and the active pill', () => {
        const { container } = render([makeSpace('!canopy:example.org', 'Bug Hunters')], {
            selectedSpaceId: '!canopy:example.org',
        });
        const item = container.querySelector(
            '[data-testid="canopy-sidebar-item-!canopy:example.org"]'
        );
        expect(item?.getAttribute('aria-current')).toBe('page');
        const pill = item?.parentElement?.querySelector('[data-state]');
        expect(pill?.getAttribute('data-state')).toBe('active');
    });

    it('rolls den unreads up into pips and mention badges per canopy', () => {
        const { container } = render(
            [
                makeSpace('!mentions:example.org', 'Mentions Canopy'),
                makeSpace('!quiet:example.org', 'Quiet Unreads'),
                makeDen('!den-a:example.org', 'den-a', 3, 2),
                makeDen('!den-b:example.org', 'den-b', 5, 0),
            ],
            {
                parents: new Map([
                    ['!den-a:example.org', new Set(['!mentions:example.org'])],
                    ['!den-b:example.org', new Set(['!quiet:example.org'])],
                ]),
            }
        );

        const badge = container.querySelector(
            '[data-testid="canopy-rail-badge-!mentions:example.org"]'
        );
        expect(badge?.textContent).toBe('2');

        expect(
            container.querySelector('[data-testid="canopy-rail-badge-!quiet:example.org"]')
        ).toBeNull();
        const quietItem = container.querySelector(
            '[data-testid="canopy-sidebar-item-!quiet:example.org"]'
        );
        const quietPill = quietItem?.parentElement?.querySelector('[data-state]');
        expect(quietPill?.getAttribute('data-state')).toBe('unread');
    });

    it('shows the dashed discover tile when no canopies are joined', () => {
        const { container } = render([]);
        const empty = container.querySelector('[data-testid="canopy-rail-empty"]');
        expect(empty).toBeTruthy();
        expect(empty?.getAttribute('href')).toBe('/canopies');
    });

    it('selects the canopy and clears the den selection when a tile is clicked', () => {
        const { container, store } = render(
            [makeSpace('!canopy:example.org', 'Black Market Coalition')],
            { selectedRoomId: '!stale-den:example.org' }
        );
        const item = container.querySelector<HTMLButtonElement>(
            '[data-testid="canopy-sidebar-item-!canopy:example.org"]'
        );
        act(() => {
            item?.click();
        });
        expect(store.get(selectedSpaceIdAtom)).toBe('!canopy:example.org');
        expect(store.get(selectedRoomIdAtom)).toBeNull();
    });

    it('orders tiles by the persisted layout, appending unlisted canopies', () => {
        const { container } = render(
            [
                makeSpace('!a:example.org', 'Alpha'),
                makeSpace('!b:example.org', 'Beta'),
                makeSpace('!c:example.org', 'Gamma'),
            ],
            {
                layout: {
                    version: 1,
                    items: [
                        { type: 'canopy', canopyId: '!b:example.org' },
                        { type: 'canopy', canopyId: '!a:example.org' },
                    ],
                },
            }
        );
        const ids = Array.from(
            container.querySelectorAll('[data-testid^="canopy-sidebar-item-"]')
        ).map((el) => el.getAttribute('data-testid'));
        expect(ids).toEqual([
            'canopy-sidebar-item-!b:example.org',
            'canopy-sidebar-item-!a:example.org',
            'canopy-sidebar-item-!c:example.org',
        ]);
    });

    it('renders folders, toggles collapse, and rolls member unreads onto the collapsed tile', () => {
        const layout: CanopyRailLayout = {
            version: 1,
            items: [
                {
                    type: 'folder',
                    id: 'f1',
                    collapsed: false,
                    canopyIds: ['!a:example.org', '!b:example.org'],
                },
            ],
        };
        const { container, store } = render(
            [
                makeSpace('!a:example.org', 'Alpha'),
                makeSpace('!b:example.org', 'Beta'),
                makeDen('!den:example.org', 'den', 4, 3),
            ],
            {
                layout,
                parents: new Map([['!den:example.org', new Set(['!a:example.org'])]]),
            }
        );

        const folderTile = container.querySelector<HTMLButtonElement>(
            '[data-testid="canopy-rail-folder-f1"]'
        );
        expect(folderTile?.getAttribute('aria-expanded')).toBe('true');
        expect(
            container.querySelector('[data-testid="canopy-sidebar-item-!a:example.org"]')
        ).toBeTruthy();
        // Expanded: the member carries its own badge, the folder shows none.
        expect(container.querySelector('[data-testid="canopy-rail-badge-f1"]')).toBeNull();
        expect(
            container.querySelector('[data-testid="canopy-rail-badge-!a:example.org"]')?.textContent
        ).toBe('3');

        act(() => {
            folderTile?.click();
        });
        expect(folderTile?.getAttribute('aria-expanded')).toBe('false');
        expect(
            container.querySelector('[data-testid="canopy-sidebar-item-!a:example.org"]')
        ).toBeNull();
        // Collapsed: the rollup moves onto the folder tile.
        expect(container.querySelector('[data-testid="canopy-rail-badge-f1"]')?.textContent).toBe(
            '3'
        );
        const stored = store.get(canopyRailLayoutAtom);
        expect(stored.items[0]).toMatchObject({ type: 'folder', id: 'f1', collapsed: true });
    });

    it('reorders with Alt+ArrowDown and persists the new layout', () => {
        const { container, store } = render(
            [makeSpace('!a:example.org', 'Alpha'), makeSpace('!b:example.org', 'Beta')],
            {
                layout: {
                    version: 1,
                    items: [
                        { type: 'canopy', canopyId: '!a:example.org' },
                        { type: 'canopy', canopyId: '!b:example.org' },
                    ],
                },
            }
        );
        const first = container.querySelector<HTMLButtonElement>(
            '[data-testid="canopy-sidebar-item-!a:example.org"]'
        );
        act(() => {
            first?.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })
            );
        });
        expect(store.get(canopyRailLayoutAtom).items.map(itemKey)).toEqual([
            '!b:example.org',
            '!a:example.org',
        ]);
        const ids = Array.from(
            container.querySelectorAll('[data-testid^="canopy-sidebar-item-"]')
        ).map((el) => el.getAttribute('data-testid'));
        expect(ids).toEqual([
            'canopy-sidebar-item-!b:example.org',
            'canopy-sidebar-item-!a:example.org',
        ]);
    });
});
