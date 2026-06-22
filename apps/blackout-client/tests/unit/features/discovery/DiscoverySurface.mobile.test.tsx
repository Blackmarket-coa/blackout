// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';

// Shared mocks for the join/navigation deps so we can assert the action fires.
const { joinRoom, navigateRoom, navigateSpace } = vi.hoisted(() => ({
    joinRoom: vi.fn().mockResolvedValue({ roomId: '!canopy:server.example' }),
    navigateRoom: vi.fn(),
    navigateSpace: vi.fn(),
}));

// The discovery query is the only data the layout needs: one joinable canopy.
// Override just `useQuery` so the component renders results synchronously
// (no QueryClientProvider / async settling), keeping the rest of react-query
// intact for anything else in the tree.
vi.mock('@tanstack/react-query', async () => {
    const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
        '@tanstack/react-query'
    );
    return {
        ...actual,
        useQuery: () => ({
            data: {
                chunk: [
                    {
                        room_id: '!canopy:server.example',
                        name: 'Solarpunk Canopy',
                        topic: 'A canopy for testing',
                        num_joined_members: 12,
                        join_rule: 'public',
                        world_readable: true,
                    },
                ],
            },
            isLoading: false,
            error: undefined,
        }),
    };
});

// The search panel owns its own data layer and is irrelevant to the two-pane
// join layout under test; stub it so the render stays light.
vi.mock('../../../../src/app/features/discovery/GlobalSearchPanel', () => ({
    GlobalSearchPanel: () => null,
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({
        getUserId: () => '@me:server.example',
        getRoom: () => undefined,
        joinRoom,
        http: { authedRequest: vi.fn() },
    }),
}));

vi.mock('../../../../src/app/hooks/useRoomNavigate', () => ({
    useRoomNavigate: () => ({ navigateRoom, navigateSpace }),
}));

// Room-list / hierarchy hooks reach into a live Matrix client; the layout test
// only needs them inert.
vi.mock('../../../../src/app/state/hooks/roomList', () => ({
    useSpaces: () => [],
    useChildRoomScopeFactory: () => () => undefined,
    useSpaceChildren: () => [],
}));
vi.mock('../../../../src/app/hooks/useSpaceHierarchy', () => ({
    useSpaceHierarchy: () => [],
}));
vi.mock('../../../../src/app/features/home/discoveryInterests', () => ({
    useDiscoveryInterestTags: () => new Set<string>(),
}));

import { DiscoverySurface } from '../../../../src/app/features/discovery/DiscoverySurface';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setViewportWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width,
    });
    window.dispatchEvent(new Event('resize'));
};

const renderSurface = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <Provider store={createStore()}>
                <MemoryRouter>
                    <DiscoverySurface />
                </MemoryRouter>
            </Provider>
        );
    });
    return {
        container,
        cleanup: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
};

describe('DiscoverySurface responsive join layout', () => {
    beforeEach(() => {
        joinRoom.mockClear();
        navigateRoom.mockClear();
        navigateSpace.mockClear();
    });

    it('stacks the panes full-width and exposes a working join action on a phone', async () => {
        setViewportWidth(400);
        const { container, cleanup } = await renderSurface();

        const twoPane = container.querySelector('[data-testid="discovery-two-pane"]');
        const listPane = container.querySelector<HTMLElement>(
            '[data-testid="discovery-list-pane"]'
        );
        const previewPane = container.querySelector<HTMLElement>(
            '[data-testid="discovery-preview-pane"]'
        );
        expect(twoPane).not.toBeNull();
        expect(listPane).not.toBeNull();
        expect(previewPane).not.toBeNull();

        // On mobile the panes drop their row flex ratios and go full width so the
        // preview/action panel stacks below the list instead of being squeezed
        // into a ~1/3-width column that the user can't reach.
        expect(listPane!.style.width).toBe('100%');
        expect(previewPane!.style.width).toBe('100%');

        // The "Join & Open" action is rendered and actually triggers a join —
        // this is the reported bug: the button used to be crammed off-screen so
        // tapping a canopy "did nothing".
        const joinButton = Array.from(container.querySelectorAll('button')).find((btn) =>
            /Join & Open|Open/.test(btn.textContent ?? '')
        );
        expect(joinButton).toBeDefined();

        await act(async () => {
            joinButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(joinRoom).toHaveBeenCalledTimes(1);

        cleanup();
    });

    it('keeps the two-column flex layout untouched on desktop', async () => {
        setViewportWidth(1280);
        const { container, cleanup } = await renderSurface();

        const listPane = container.querySelector<HTMLElement>(
            '[data-testid="discovery-list-pane"]'
        );
        const previewPane = container.querySelector<HTMLElement>(
            '[data-testid="discovery-preview-pane"]'
        );
        // Desktop keeps the flex-ratio columns (no full-width mobile override).
        expect(listPane!.style.width).toBe('');
        expect(previewPane!.style.width).toBe('');
        expect(listPane!.style.flex).not.toBe('');

        cleanup();
    });
});
