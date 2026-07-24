// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';

vi.mock('../../src/app/core/features/featureFlags', async () => {
    const actual = await vi.importActual<typeof import('../../src/app/core/features/featureFlags')>(
        '../../src/app/core/features/featureFlags'
    );
    return {
        ...actual,
        runtimeFeatureFlags: { ...actual.defaultFeatureFlags, shellAppShell: true },
    };
});

const { NativeBridgeListener } = await import('../../src/platform/NativeBridgeListener');
const { dispatchNativeBridgeEvent } = await import('../../src/platform/native-bridge-contract');

const PassThrough = () => <div data-testid="pass">{window.location.pathname}</div>;

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
                    { path: '/', element: <PassThrough /> },
                    { path: '/communities/:canopyId/dens/:denId', element: <PassThrough /> },
                ],
            },
        ],
        { initialEntries: ['/'] }
    );

describe('NativeBridgeListener under AppShell flag', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('routes deep links to the canonical canopy/den path when shellAppShell is on', async () => {
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
                source: 'mobile',
                url: 'blackout://room/!alpha:blackout.coop',
            });
            await Promise.resolve();
        });

        expect(router.state.location.pathname).toBe(
            `/communities/-/dens/${encodeURIComponent('!alpha:blackout.coop')}`
        );
    });

    it('routes notification_interacted to the canonical canopy/den path under the shell flag', async () => {
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
            `/communities/-/dens/${encodeURIComponent('!incident:blackout.coop')}`
        );
    });
});
