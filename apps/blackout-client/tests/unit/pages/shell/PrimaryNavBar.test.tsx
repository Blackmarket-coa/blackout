// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { PrimaryNavBar } from '../../../../src/app/pages/shell/PrimaryNavBar';
import { capabilityContextAtom } from '../../../../src/app/core/features/capabilityContext';
import { defaultFeatureFlags } from '../../../../src/app/core/features/featureFlags';

const renderAt = (path: string): HTMLElement => {
    const store = createStore();
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
                children: [{ path: '*', element: <PrimaryNavBar /> }],
            },
        ],
        { initialEntries: [path] }
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

describe('PrimaryNavBar — persistent Home anchor (audit B)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the Home link on a deep route', () => {
        const container = renderAt('/settings/about');
        const home = container.querySelector('[data-testid="bottom-tab-home"]');
        expect(home).toBeTruthy();
        expect(home?.getAttribute('href')).toBe('/');
    });

    it('renders the Home link on the bare root and marks it active', () => {
        const container = renderAt('/');
        const home = container.querySelector('[data-testid="bottom-tab-home"]');
        expect(home).toBeTruthy();
        expect(home?.getAttribute('aria-current')).toBe('page');
    });

    it('renders the Home link on a plugin route (inherits, does not replace nav)', () => {
        const container = renderAt('/plugins');
        const home = container.querySelector('[data-testid="bottom-tab-home"]');
        expect(home).toBeTruthy();
    });

    it('exposes the search and profile affordances', () => {
        const container = renderAt('/');
        expect(container.querySelector('[data-testid="primary-nav-bar-search"]')).toBeTruthy();
        const profile = container.querySelector('[data-testid="primary-nav-bar-profile"]');
        expect(profile).toBeTruthy();
        expect(profile?.getAttribute('href')).toBe('/profile/me');
    });
});
