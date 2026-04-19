// @vitest-environment jsdom
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Provider, createStore } from 'jotai';
import { RoomRightPanelHost } from '../../../../src/app/features/room/RoomRightPanelHost';
import { rightPanelAtom, roomJumpTargetEventIdAtom } from '../../../../src/app/state/bmc-navigation';

vi.mock('../../../../src/app/hooks/bmc-useTimeline', () => ({
    useRoomTimeline: () => ({ data: [], loading: false, error: null }),
}));

vi.mock('../../../../src/app/features/right-panel/RightPanelContent', () => ({
    __esModule: true,
    default: ({ panel, onJumpToEvent }: { panel: string; onJumpToEvent: (eventId: string) => void }) => (
        <div>
            <span data-testid="panel-name">{panel}</span>
            <button type="button" onClick={() => onJumpToEvent('$event:example.org')}>
                Jump
            </button>
        </div>
    ),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('RoomRightPanelHost', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders empty state when no right panel is open', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const store = createStore();

        act(() => {
            root.render(
                <Provider store={store}>
                    <RoomRightPanelHost room={{ roomId: '!room:example.org' } as never} />
                </Provider>
            );
        });

        expect(container.querySelector('aside[aria-label="Room right panel"]')).toBeNull();

        act(() => root.unmount());
    });

    it('opens and closes the panel from atom state', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const store = createStore();
        store.set(rightPanelAtom, 'threads');

        act(() => {
            root.render(
                <Provider store={store}>
                    <RoomRightPanelHost room={{ roomId: '!room:example.org' } as never} />
                </Provider>
            );
        });

        expect(container.querySelector('[data-testid="panel-name"]')?.textContent).toBe('threads');

        const closeButton = Array.from(container.querySelectorAll('button')).find(
            (node) => node.textContent === 'Close'
        ) as HTMLButtonElement;

        act(() => {
            closeButton.click();
        });

        expect(store.get(rightPanelAtom)).toBeNull();
        expect(container.querySelector('aside[aria-label="Room right panel"]')).toBeNull();

        act(() => root.unmount());
    });

    it('sets jump target and closes panel when child requests jump', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const store = createStore();
        store.set(rightPanelAtom, 'pins');

        act(() => {
            root.render(
                <Provider store={store}>
                    <RoomRightPanelHost room={{ roomId: '!room:example.org' } as never} />
                </Provider>
            );
        });

        const jumpButton = Array.from(container.querySelectorAll('button')).find(
            (node) => node.textContent === 'Jump'
        ) as HTMLButtonElement;

        act(() => {
            jumpButton.click();
        });

        expect(store.get(roomJumpTargetEventIdAtom)).toBe('$event:example.org');
        expect(store.get(rightPanelAtom)).toBeNull();

        act(() => root.unmount());
    });
});
