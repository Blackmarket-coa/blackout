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

describe('WorkspaceTabBar — secondary sub-tab strip', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('does not render a Home link (the primary nav owns Home now)', () => {
        const container = renderAt('/settings/about');
        expect(container.querySelector('[data-testid="workspace-tab-bar-home"]')).toBeNull();
    });

    it('renders nothing on the bare root (no segment, no sub-tabs)', () => {
        const container = renderAt('/');
        expect(container.querySelector('[data-shell-region="workspace-tab-bar"]')).toBeNull();
    });
});
