// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import type { Room } from 'matrix-js-sdk';
import { beforeEach, describe, expect, it } from 'vitest';

import { CanopySidebar } from '../../../../src/app/pages/shell/CanopySidebar';
import { allRoomsBaseAtom } from '../../../../src/app/state/rooms';
import { capabilityContextAtom } from '../../../../src/app/core/features/capabilityContext';
import { defaultFeatureFlags } from '../../../../src/app/core/features/featureFlags';

const makeSpace = (roomId: string, name: string): Room =>
    ({
        roomId,
        name,
        getType: () => 'm.space',
        getMyMembership: () => 'join',
        getUnreadNotificationCount: () => 0,
        isSpaceRoom: () => true,
    } as unknown as Room);

const render = (rooms: Room[]): HTMLElement => {
    const store = createStore();
    store.set(allRoomsBaseAtom, rooms as never);
    store.set(capabilityContextAtom, {
        capabilities: [],
        flags: { ...defaultFeatureFlags, shellAppShell: true },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: <Outlet />,
                children: [{ path: '*', element: <CanopySidebar /> }],
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
    return container;
};

describe('CanopySidebar', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('lists joined canopies and the discover/create affordances', () => {
        const container = render([makeSpace('!canopy:example.org', 'Black Market Coalition')]);
        const item = container.querySelector(
            '[data-testid="canopy-sidebar-item-!canopy:example.org"]'
        );
        expect(item?.textContent).toContain('Black Market Coalition');
        expect(container.querySelector('[data-testid="canopy-sidebar-discover"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="canopy-sidebar-create"]')).toBeTruthy();
    });

    it('excludes destinations already in the top nav from the browse list', () => {
        const container = render([]);
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
});
