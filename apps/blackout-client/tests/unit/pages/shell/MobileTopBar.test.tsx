// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { MobileTopBar } from '../../../../src/app/pages/shell/MobileTopBar';

const renderAt = (path: string, ui: React.ReactNode): HTMLElement => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const router = createMemoryRouter(
        [
            {
                path: '*',
                element: <Outlet />,
                children: [{ path: '*', element: <>{ui}</> }],
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

describe('MobileTopBar — auto back affordance (audit B)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders no back button on a shell-mode root', () => {
        const container = renderAt('/', <MobileTopBar />);
        expect(container.querySelector('[data-testid="mobile-top-bar-back"]')).toBeNull();
    });

    it('renders a back button on a leaf route when no leading is provided', () => {
        const container = renderAt('/settings/about', <MobileTopBar />);
        const back = container.querySelector('[data-testid="mobile-top-bar-back"]');
        expect(back).toBeTruthy();
        expect(back?.getAttribute('aria-label')).toBe('Go back');
    });

    it('honors an explicit leading override (does not auto-inject)', () => {
        const container = renderAt(
            '/settings/about',
            <MobileTopBar leading={<span data-testid="custom-leading" />} />,
        );
        expect(container.querySelector('[data-testid="custom-leading"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="mobile-top-bar-back"]')).toBeNull();
    });
});
