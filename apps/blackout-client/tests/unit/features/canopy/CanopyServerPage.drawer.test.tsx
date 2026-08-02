// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Room } from 'matrix-js-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({ getRoom: () => null }),
    useMatrixClientOrNull: () => null,
}));

vi.mock('../../../../src/app/pages/shell/CanopyRail', () => ({
    CanopyRail: ({ variant }: { variant?: string }) => (
        <div data-testid="canopy-rail-stub" data-variant={variant} />
    ),
}));

vi.mock('../../../../src/app/features/canopy/CanopyChannelSidebar', () => ({
    CanopyChannelSidebar: ({ fluid, onNavigate }: { fluid?: boolean; onNavigate?: () => void }) => (
        <div data-testid="canopy-channels-stub" data-fluid={fluid ? 'true' : 'false'}>
            <button type="button" data-testid="stub-navigate" onClick={() => onNavigate?.()} />
        </div>
    ),
}));

vi.mock('../../../../src/app/features/canopy/CanopyDenSurface', () => ({
    CanopyDenSurface: ({ onOpenChannels }: { onOpenChannels: () => void }) => (
        <div data-testid="canopy-den-surface-stub">
            <button
                type="button"
                data-testid="stub-open-channels"
                onClick={() => onOpenChannels()}
            />
        </div>
    ),
}));

vi.mock('../../../../src/app/features/canopy/CanopyMemberPanel', () => ({
    CanopyMemberPanel: () => <div data-testid="canopy-members-stub" />,
}));

vi.mock('../../../../src/app/features/canopy/CanopyThreadsPanel', () => ({
    CanopyThreadsPanel: () => <div data-testid="canopy-threads-stub" />,
}));

vi.mock('../../../../src/app/features/canopy/CanopyPinsPanel', () => ({
    CanopyPinsPanel: () => <div data-testid="canopy-pins-stub" />,
}));

vi.mock('../../../../src/app/features/canopy/CanopySettingsDialog', () => ({
    CanopySettingsDialog: () => null,
}));

vi.mock('../../../../src/app/features/canopy/CanopyWelcomeGate', () => ({
    CanopyWelcomeGate: () => null,
}));

import { CanopyServerPage } from '../../../../src/app/features/canopy/CanopyServerPage';
import { allRoomsBaseAtom } from '../../../../src/app/state/rooms';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../../../src/app/state/navigation';

const CANOPY_ID = '!canopy:example.org';
const DEN_ID = '!den:example.org';

const makeSpace = (roomId: string, name: string): Room =>
    ({
        roomId,
        name,
        getType: () => 'm.space',
        getMyMembership: () => 'join',
        getUnreadNotificationCount: () => 0,
        isSpaceRoom: () => true,
    } as unknown as Room);

const setViewportWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width,
    });
};

const render = (initialPath: string, selectedRoomId: string | null = null): HTMLElement => {
    const store = createStore();
    store.set(allRoomsBaseAtom, [makeSpace(CANOPY_ID, 'Black Market Coalition')] as never);
    store.set(selectedSpaceIdAtom, CANOPY_ID);
    store.set(selectedRoomIdAtom, selectedRoomId);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const router = createMemoryRouter(
        [
            { path: '/communities/:canopyId', element: <CanopyServerPage /> },
            { path: '/communities/:canopyId/dens/:denId', element: <CanopyServerPage /> },
        ],
        { initialEntries: [initialPath] }
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

const click = (el: Element | null) => {
    act(() => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
};

describe('CanopyServerPage drawer', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    afterEach(() => {
        setViewportWidth(1280);
    });

    it('opens the drawer with the canopy rail on a compact canopy root', () => {
        setViewportWidth(480);
        const container = render(`/communities/${encodeURIComponent(CANOPY_ID)}`);
        expect(container.querySelector('[data-testid="canopy-drawer-scrim"]')).toBeTruthy();
        const rail = container.querySelector('[data-testid="canopy-rail-stub"]');
        expect(rail?.getAttribute('data-variant')).toBe('drawer');
        const channels = container.querySelector('[data-testid="canopy-channels-stub"]');
        expect(channels?.getAttribute('data-fluid')).toBe('true');
    });

    it('starts closed on a den route, opens via the hamburger, closes on den navigation', () => {
        setViewportWidth(480);
        const container = render(
            `/communities/${encodeURIComponent(CANOPY_ID)}/dens/${encodeURIComponent(DEN_ID)}`,
            DEN_ID
        );
        expect(container.querySelector('[data-testid="canopy-drawer-scrim"]')).toBeNull();

        click(container.querySelector('[data-testid="stub-open-channels"]'));
        expect(container.querySelector('[data-testid="canopy-drawer-scrim"]')).toBeTruthy();

        click(container.querySelector('[data-testid="stub-navigate"]'));
        expect(container.querySelector('[data-testid="canopy-drawer-scrim"]')).toBeNull();
    });

    it('renders the channel sidebar inline without a drawer or rail on desktop', () => {
        setViewportWidth(1280);
        const container = render(`/communities/${encodeURIComponent(CANOPY_ID)}`);
        expect(container.querySelector('[data-testid="canopy-drawer-scrim"]')).toBeNull();
        expect(container.querySelector('[data-testid="canopy-rail-stub"]')).toBeNull();
        const channels = container.querySelector('[data-testid="canopy-channels-stub"]');
        expect(channels?.getAttribute('data-fluid')).toBe('false');
    });

    it('omits the rail from the drawer in the tablet dead-zone where AppShell already shows it', () => {
        // 751–767px: AppShell renders its desktop rail while this page is
        // still compact — the drawer must not double-mount the rail.
        setViewportWidth(760);
        const container = render(`/communities/${encodeURIComponent(CANOPY_ID)}`);
        expect(container.querySelector('[data-testid="canopy-drawer-scrim"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="canopy-rail-stub"]')).toBeNull();
        expect(container.querySelector('[data-testid="canopy-channels-stub"]')).toBeTruthy();
    });
});
