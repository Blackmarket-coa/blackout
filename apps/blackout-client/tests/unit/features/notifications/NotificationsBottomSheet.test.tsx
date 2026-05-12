// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider, createStore } from 'jotai';
import { NotificationsBottomSheet } from '../../../../src/app/features/notifications/components/NotificationsBottomSheet';
import { rightPanelAtom } from '../../../../src/app/state/navigation';

// Stub the drawer body — its hooks reach into Matrix state we don't need
// for the wrapper-level assertions. Only the bottom-sheet plumbing is
// under test here.
vi.mock(
    '../../../../src/app/features/notifications/components/NotificationsDrawer',
    () => ({
        NotificationsDrawer: ({ roomId }: { roomId: string }) => (
            <div data-testid="stub-drawer">{roomId}</div>
        ),
    }),
);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROOM_ID = '!room:example.org';

const mount = (initialPanel: 'notifications' | null) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    if (initialPanel) store.set(rightPanelAtom, initialPanel);

    act(() => {
        root.render(
            <Provider store={store}>
                <NotificationsBottomSheet roomId={ROOM_ID} />
            </Provider>,
        );
    });

    return { container, root, store };
};

describe('NotificationsBottomSheet', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders nothing when rightPanelAtom is not notifications', () => {
        const { container, root } = mount(null);

        expect(
            container.querySelector('[data-testid="notifications-bottom-sheet"]'),
        ).toBeNull();

        act(() => root.unmount());
    });

    it('renders the sheet and stub drawer when rightPanelAtom is notifications', () => {
        const { container, root } = mount('notifications');

        expect(
            container.querySelector('[data-testid="notifications-bottom-sheet"]'),
        ).not.toBeNull();
        expect(container.querySelector('[data-testid="stub-drawer"]')?.textContent).toBe(
            ROOM_ID,
        );

        act(() => root.unmount());
    });

    it('clears the atom on backdrop tap', () => {
        const { container, root, store } = mount('notifications');

        const backdrop = container.querySelector(
            '[data-testid="notifications-bottom-sheet"]',
        ) as HTMLElement;

        act(() => {
            backdrop.click();
        });

        expect(store.get(rightPanelAtom)).toBeNull();

        act(() => root.unmount());
    });

    it('keeps the atom set when the click bubbles from inside the sheet', () => {
        const { container, root, store } = mount('notifications');

        const innerStub = container.querySelector(
            '[data-testid="stub-drawer"]',
        ) as HTMLElement;

        act(() => {
            innerStub.click();
        });

        expect(store.get(rightPanelAtom)).toBe('notifications');

        act(() => root.unmount());
    });

    it('clears the atom on the explicit Close button', () => {
        const { container, root, store } = mount('notifications');

        const close = container.querySelector(
            '[data-testid="notifications-bottom-sheet-close"]',
        ) as HTMLButtonElement;

        act(() => {
            close.click();
        });

        expect(store.get(rightPanelAtom)).toBeNull();

        act(() => root.unmount());
    });

    it('clears the atom on Escape', () => {
        const { root, store } = mount('notifications');

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });

        expect(store.get(rightPanelAtom)).toBeNull();

        act(() => root.unmount());
    });
});
