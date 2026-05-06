// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';

import { NativeBridgeListener } from '../../src/platform/NativeBridgeListener';
import { dispatchNativeBridgeEvent } from '../../src/platform/native-bridge-contract';

const RoomScreen = () => <div data-testid="room-screen">{window.location.pathname}</div>;

const RouterRoot = () => (
    <>
        <NativeBridgeListener />
        <Outlet />
    </>
);

const buildRouter = () =>
    createMemoryRouter(
        [
            {
                element: <RouterRoot />,
                children: [
                    { path: '/', element: <div data-testid="home">home</div> },
                    // PR-10 retired the legacy `/room/:roomId` route; the
                    // bridge now lands on the canonical canopy/den shape.
                    { path: '/communities/:canopyId/dens/:denId', element: <RoomScreen /> },
                ],
            },
        ],
        { initialEntries: ['/'] }
    );

describe('NativeBridgeListener', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('navigates to the canonical canopy/den path when a deep_link_opened event arrives', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const router = buildRouter();

        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="home"]')).not.toBeNull();

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'deep_link_opened',
                source: 'mobile',
                url: 'blackout://room/!alpha:blackout.coop',
            });
            await Promise.resolve();
        });

        expect(router.state.location.pathname).toBe(
            '/communities/-/dens/' + encodeURIComponent('!alpha:blackout.coop')
        );
    });

    it('ignores deep links that do not target a room', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const router = buildRouter();

        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'deep_link_opened',
                source: 'desktop',
                url: 'https://example.com/room/ignored',
            });
            await Promise.resolve();
        });

        expect(router.state.location.pathname).toBe('/');
    });

    it('ignores non-routing bridge events (e.g. resume_sync)', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const router = buildRouter();

        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'resume_sync',
                source: 'mobile',
            });
            await Promise.resolve();
        });

        expect(router.state.location.pathname).toBe('/');
    });

    it('routes notification_interacted to the canonical canopy/den path', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const router = buildRouter();

        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'notification_interacted',
                source: 'mobile',
                roomId: '!incident:blackout.coop',
            });
            await Promise.resolve();
        });

        expect(router.state.location.pathname).toBe(
            '/communities/-/dens/' + encodeURIComponent('!incident:blackout.coop')
        );
    });

    it('ignores notification_interacted with empty roomId', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        const router = buildRouter();

        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await Promise.resolve();
        });

        await act(async () => {
            dispatchNativeBridgeEvent({
                type: 'notification_interacted',
                source: 'mobile',
                roomId: '',
            });
            await Promise.resolve();
        });

        expect(router.state.location.pathname).toBe('/');
    });
});
