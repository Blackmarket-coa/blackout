// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './AppShell';
import { capabilityContextAtom } from '../../core/features/capabilityContext';
import { defaultFeatureFlags, runtimeFeatureFlags } from '../../core/features/featureFlags';

const HomeStub = () => <div data-testid="home-body">home body</div>;
const CommunitiesStub = () => <div data-testid="communities-body">communities body</div>;
const MarketStub = () => <div data-testid="market-body">market body</div>;

const renderShell = (initialPath: string) => {
    const store = createStore();
    store.set(capabilityContextAtom, {
        capabilities: [],
        flags: { ...defaultFeatureFlags, shellAppShell: true },
    });

    const router = createMemoryRouter(
        [
            {
                element: <AppShell />,
                children: [
                    { path: '/', element: <HomeStub /> },
                    { path: '/communities', element: <CommunitiesStub /> },
                    { path: '/market', element: <MarketStub /> },
                ],
            },
        ],
        { initialEntries: [initialPath] }
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    return { router, container, root, store };
};

describe('AppShell', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        // Restore the runtimeFeatureFlags in case a prior test mutated it.
        runtimeFeatureFlags.shellAppShell = false;
        // Mobile-by-default viewport so the bottom-tab bar renders in
        // jsdom (jsdom defaults to a 1024-wide viewport otherwise).
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 480,
        });
    });

    it('renders the routed Outlet content', async () => {
        const { router, container, root, store } = renderShell('/');
        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <RouterProvider router={router} />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="home-body"]')).not.toBeNull();
        expect(container.querySelector('[data-shell="app"]')).not.toBeNull();
    });

    it('exposes the resolved mode via data-shell-mode', async () => {
        const { router, container, root, store } = renderShell('/communities');
        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <RouterProvider router={router} />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        const shellRoot = container.querySelector('[data-shell="app"]');
        expect(shellRoot?.getAttribute('data-shell-mode')).toBe('community');
    });

    it('renders the bottom-tab bar with the five canonical destinations on a mobile viewport', async () => {
        const { router, container, root, store } = renderShell('/');
        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <RouterProvider router={router} />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        const bottomBar = container.querySelector('[data-testid="app-shell-bottom-tab-bar"]');
        expect(bottomBar).not.toBeNull();

        const panelIds = Array.from(bottomBar?.querySelectorAll('[data-panel-id]') ?? []).map(
            (el) => el.getAttribute('data-panel-id')
        );

        expect(panelIds).toEqual([
            'shell.home',
            'shell.communities',
            'shell.create',
            'shell.market',
            'shell.inbox',
        ]);
    });

    it('marks the active destination via aria-current=page on the matching tab', async () => {
        const { router, container, root, store } = renderShell('/market');
        await act(async () => {
            root.render(
                <JotaiProvider store={store}>
                    <RouterProvider router={router} />
                </JotaiProvider>
            );
            await Promise.resolve();
        });

        const active = container.querySelector(
            '[data-panel-id="shell.market"][aria-current="page"]'
        );
        expect(active).not.toBeNull();

        const inactive = container.querySelector('[data-panel-id="shell.home"]');
        expect(inactive?.getAttribute('aria-current')).toBeNull();
    });
});
