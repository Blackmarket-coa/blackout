// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceTabBar } from '../../../../src/app/pages/shell/WorkspaceTabBar';

const renderAt = (path: string): HTMLElement => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: <Outlet />,
                children: [{ path: '*', element: <WorkspaceTabBar /> }],
            },
        ],
        { initialEntries: [path] },
    );
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(<RouterProvider router={router} />);
    });
    return container;
};

describe('WorkspaceTabBar — persistent Home anchor (audit B)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the Home link on a deep route', () => {
        const container = renderAt('/settings/about');
        const home = container.querySelector('[data-testid="workspace-tab-bar-home"]');
        expect(home).toBeTruthy();
        expect(home?.getAttribute('href')).toBe('/');
    });

    it('renders the Home link on the bare root and marks it active', () => {
        const container = renderAt('/');
        const home = container.querySelector('[data-testid="workspace-tab-bar-home"]');
        expect(home).toBeTruthy();
        expect(home?.getAttribute('aria-current')).toBe('page');
    });

    it('renders the Home link on a plugin route (inherits, does not replace nav)', () => {
        const container = renderAt('/plugins');
        const home = container.querySelector('[data-testid="workspace-tab-bar-home"]');
        expect(home).toBeTruthy();
    });
});
