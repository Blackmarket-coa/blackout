// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { NotFoundPage, RouteErrorFallback } from '../../../src/app/pages/RouteErrorPage';

let container: HTMLDivElement;
let root: ReactDOM.Root;

const renderRouter = async (routes: RouteObject[], initialPath: string) => {
    const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
    await act(async () => {
        root.render(<RouterProvider router={router} />);
    });
};

describe('RouteErrorPage', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = ReactDOM.createRoot(container);
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.restoreAllMocks();
    });

    it('renders the branded not-found card for unmatched URLs via the catch-all', async () => {
        await renderRouter(
            [
                { path: '/', element: <div>home</div> },
                { path: '*', element: <NotFoundPage /> },
            ],
            '/profile/me'
        );

        const card = container.querySelector('[data-testid="route-not-found"]');
        expect(card).not.toBeNull();
        expect(card?.textContent).toContain('Page not found');
        expect(container.querySelector('a[href="/"]')).not.toBeNull();
    });

    it('renders the not-found card when a route throws a 404 response', async () => {
        await renderRouter(
            [
                {
                    path: '/',
                    errorElement: <RouteErrorFallback />,
                    loader: () => {
                        throw new Response('', { status: 404, statusText: 'Not Found' });
                    },
                    element: <div>never</div>,
                },
            ],
            '/'
        );

        expect(container.querySelector('[data-testid="route-not-found"]')).not.toBeNull();
    });

    it('renders the generic error card (with the message) for render crashes', async () => {
        // React logs the caught render error; keep the test output clean.
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const Boom = () => {
            throw new Error('exploded in render');
        };

        await renderRouter(
            [
                {
                    path: '/',
                    errorElement: <RouteErrorFallback />,
                    element: <Boom />,
                },
            ],
            '/'
        );

        const card = container.querySelector('[data-testid="route-error"]');
        expect(card).not.toBeNull();
        expect(card?.textContent).toContain('Something went wrong');
        expect(card?.textContent).toContain('exploded in render');
    });
});
