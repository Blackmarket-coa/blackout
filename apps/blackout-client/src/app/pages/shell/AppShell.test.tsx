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
const CreateStub = () => <div data-testid="create-body">create body</div>;
const MarketStub = () => <div data-testid="market-body">market body</div>;
const InboxStub = () => <div data-testid="inbox-body">inbox body</div>;
const DirectStub = () => <div data-testid="direct-body">direct body</div>;
const ExploreStub = () => <div data-testid="explore-body">explore body</div>;

const GovernanceStub = () => <div data-testid="governance-body">governance body</div>;
const GovernanceMeetingsStub = () => (
    <div data-testid="governance-meetings-body">governance meetings body</div>
);
const GovernanceTreasuryStub = () => (
    <div data-testid="governance-treasury-body">governance treasury body</div>
);

type RenderShellOptions = {
    capabilities?: readonly string[];
};

const renderShell = (initialPath: string, options: RenderShellOptions = {}) => {
    const store = createStore();
    store.set(capabilityContextAtom, {
        capabilities: [...(options.capabilities ?? [])],
        flags: { ...defaultFeatureFlags, shellAppShell: true },
    });

    const router = createMemoryRouter(
        [
            {
                element: <AppShell />,
                children: [
                    { path: '/', element: <HomeStub /> },
                    { path: '/communities', element: <CommunitiesStub /> },
                    { path: '/create', element: <CreateStub /> },
                    { path: '/market', element: <MarketStub /> },
                    { path: '/messages', element: <InboxStub /> },
                    { path: '/messages/*', element: <InboxStub /> },
                    { path: '/direct', element: <DirectStub /> },
                    { path: '/explore', element: <ExploreStub /> },
                    { path: '/governance', element: <GovernanceStub /> },
                    {
                        path: '/governance/meetings',
                        element: <GovernanceMeetingsStub />,
                    },
                    {
                        path: '/governance/treasury',
                        element: <GovernanceTreasuryStub />,
                    },
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

const setDesktopViewport = () => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1280,
    });
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

    // Workstream A Port 1 exit criterion: one router-integration assertion
    // per shell panel state. The schedule lists `Home / Direct / Explore /
    // Inbox`; the live destination set is `Home / Communities / Create /
    // Market / Inbox`. We cover every destination's active-tab state below,
    // and assert mode resolution for the schedule-cited Direct/Explore
    // sub-routes (which map onto the inbox/discovery modes per modeRouter).
    const ACTIVE_TAB_CASES: ReadonlyArray<{
        name: string;
        path: string;
        panelId: string;
    }> = [
        { name: 'Home', path: '/', panelId: 'shell.home' },
        { name: 'Communities', path: '/communities', panelId: 'shell.communities' },
        { name: 'Create', path: '/create', panelId: 'shell.create' },
        { name: 'Market', path: '/market', panelId: 'shell.market' },
        { name: 'Inbox', path: '/messages/', panelId: 'shell.inbox' },
    ];

    for (const { name, path, panelId } of ACTIVE_TAB_CASES) {
        it(`marks ${name} active on ${path} and no other canonical tab`, async () => {
            const { router, container, root, store } = renderShell(path);
            await act(async () => {
                root.render(
                    <JotaiProvider store={store}>
                        <RouterProvider router={router} />
                    </JotaiProvider>
                );
                await Promise.resolve();
            });

            const active = container.querySelector(
                `[data-panel-id="${panelId}"][aria-current="page"]`
            );
            expect(active).not.toBeNull();

            const otherActive = Array.from(
                container.querySelectorAll('[data-panel-id][aria-current="page"]')
            )
                .map((el) => el.getAttribute('data-panel-id'))
                .filter((id) => id !== panelId);
            expect(otherActive).toEqual([]);
        });
    }

    const MODE_RESOLUTION_CASES: ReadonlyArray<{
        path: string;
        mode: string;
    }> = [
        { path: '/direct', mode: 'inbox' },
        { path: '/explore', mode: 'discovery' },
    ];

    for (const { path, mode } of MODE_RESOLUTION_CASES) {
        it(`resolves data-shell-mode=${mode} for ${path}`, async () => {
            const { router, container, root, store } = renderShell(path);
            await act(async () => {
                root.render(
                    <JotaiProvider store={store}>
                        <RouterProvider router={router} />
                    </JotaiProvider>
                );
                await Promise.resolve();
            });

            const shellRoot = container.querySelector('[data-shell="app"]');
            expect(shellRoot?.getAttribute('data-shell-mode')).toBe(mode);
        });
    }

    describe('WorkspaceTabBar (desktop workspace-tab registry consumption)', () => {
        const GOVERNANCE_CAPS = [
            'governance.read',
            'governance.meetings.schedule',
            'governance.treasury.read',
        ];

        beforeEach(() => {
            setDesktopViewport();
        });

        it('renders governance workspace tabs when on /governance with required capabilities', async () => {
            const { router, container, root, store } = renderShell('/governance', {
                capabilities: GOVERNANCE_CAPS,
            });
            await act(async () => {
                root.render(
                    <JotaiProvider store={store}>
                        <RouterProvider router={router} />
                    </JotaiProvider>
                );
                await Promise.resolve();
            });

            const bar = container.querySelector('[data-testid="app-shell-workspace-tab-bar"]');
            expect(bar).not.toBeNull();
            const panelIds = Array.from(bar?.querySelectorAll('[data-panel-id]') ?? []).map(
                (el) => el.getAttribute('data-panel-id')
            );
            expect(panelIds).toEqual([
                'governance.workspace',
                'governance.meetings.workspace',
                'governance.treasury.workspace',
            ]);
        });

        it('marks Meetings active when on /governance/meetings and leaves Treasury inactive', async () => {
            const { router, container, root, store } = renderShell('/governance/meetings', {
                capabilities: GOVERNANCE_CAPS,
            });
            await act(async () => {
                root.render(
                    <JotaiProvider store={store}>
                        <RouterProvider router={router} />
                    </JotaiProvider>
                );
                await Promise.resolve();
            });

            // The Meetings child tab is active.
            const active = container.querySelector(
                '[data-shell-region="workspace-tab-bar"] [data-panel-id="governance.meetings.workspace"][aria-current="page"]'
            );
            expect(active).not.toBeNull();

            // The Treasury sibling is not active (sibling-route isolation).
            const treasury = container.querySelector(
                '[data-shell-region="workspace-tab-bar"] [data-panel-id="governance.treasury.workspace"]'
            );
            expect(treasury?.getAttribute('aria-current')).toBeNull();
            // The Governance parent tab is also active because `isShellPathActive`
            // is permissive about route subtrees (deep-linking keeps the parent
            // lit, same semantic as the mobile bottom-tab bar). This is intentional.
            const parent = container.querySelector(
                '[data-shell-region="workspace-tab-bar"] [data-panel-id="governance.workspace"]'
            );
            expect(parent?.getAttribute('aria-current')).toBe('page');
        });

        it('renders nothing on root path (no workspace siblings)', async () => {
            const { router, container, root, store } = renderShell('/', {
                capabilities: GOVERNANCE_CAPS,
            });
            await act(async () => {
                root.render(
                    <JotaiProvider store={store}>
                        <RouterProvider router={router} />
                    </JotaiProvider>
                );
                await Promise.resolve();
            });

            const bar = container.querySelector('[data-testid="app-shell-workspace-tab-bar"]');
            expect(bar).toBeNull();
        });

        it('renders nothing on /governance when capabilities are absent (capability-gated)', async () => {
            const { router, container, root, store } = renderShell('/governance', {
                capabilities: [],
            });
            await act(async () => {
                root.render(
                    <JotaiProvider store={store}>
                        <RouterProvider router={router} />
                    </JotaiProvider>
                );
                await Promise.resolve();
            });

            const bar = container.querySelector('[data-testid="app-shell-workspace-tab-bar"]');
            expect(bar).toBeNull();
        });

        it('does not render on mobile viewport', async () => {
            Object.defineProperty(window, 'innerWidth', {
                configurable: true,
                value: 480,
            });
            const { router, container, root, store } = renderShell('/governance', {
                capabilities: GOVERNANCE_CAPS,
            });
            await act(async () => {
                root.render(
                    <JotaiProvider store={store}>
                        <RouterProvider router={router} />
                    </JotaiProvider>
                );
                await Promise.resolve();
            });

            const bar = container.querySelector('[data-testid="app-shell-workspace-tab-bar"]');
            expect(bar).toBeNull();
        });
    });
});
