// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { capabilityContextAtom } from '../../../../src/app/core/features/capabilityContext';
import { runtimeFeatureFlags } from '../../../../src/app/core/features/featureFlags';
import { RegistryRouteList, buildRegistryRouteObjects } from '../../../../src/app/core/features/RegistryRouteList';
import { RegistrySettingsList } from '../../../../src/app/core/features/RegistrySettingsList';
import { RegistrySidebarList } from '../../../../src/app/core/features/RegistrySidebarList';

const seedStore = (capabilities: string[], flagOverrides: Partial<typeof runtimeFeatureFlags> = {}) => {
    const store = createStore();
    store.set(capabilityContextAtom, {
        capabilities,
        flags: { ...runtimeFeatureFlags, ...flagOverrides },
    });
    return store;
};

const mount = async (ui: React.ReactElement, store = createStore()) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(<Provider store={store}>{ui}</Provider>);
        await Promise.resolve();
    });

    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('RegistrySidebarList', () => {
    it('renders nothing when the capability context grants no panels', async () => {
        // Disable always-on flag-only-gated features so the "no panels" condition holds.
        const store = seedStore([], {
            communities: false,
            plugins: false,
            coalition: false,
            coliseum: false,
            streaming: false,
        });
        const { container } = await mount(
            <MemoryRouter>
                <RegistrySidebarList />
            </MemoryRouter>,
            store
        );
        expect(container.querySelector('[data-testid="registry-sidebar-list"]')).toBeNull();
    });

    it('emits sidebar entries for granted feature surfaces', async () => {
        // Stego toolkit + ephemeral lifecycle each contribute a sidebar entry.
        const store = seedStore(
            ['stego.toolkit.use', 'stego.lifecycle.manage'],
            { stegoToolkit: true }
        );

        const { container } = await mount(
            <MemoryRouter>
                <RegistrySidebarList />
            </MemoryRouter>,
            store
        );

        const list = container.querySelector('[data-testid="registry-sidebar-list"]');
        expect(list).toBeTruthy();
        expect(
            container.querySelector('[data-testid="registry-panel-stego.toolkit.sidebar"]')
        ).toBeTruthy();
        expect(
            container.querySelector('[data-testid="registry-panel-stego.lifecycle.sidebar"]')
        ).toBeTruthy();
    });

    it('respects the kind prop and renders right-panel entries when requested', async () => {
        const store = seedStore(['stego.toolkit.use'], { stegoToolkit: true });
        const { container } = await mount(
            <MemoryRouter>
                <RegistrySidebarList kind="right-panel" />
            </MemoryRouter>,
            store
        );

        // Right-panel list renders only the right-panel entry, not sidebar/workspace.
        expect(
            container.querySelector('[data-testid="registry-panel-stego.toolkit.right-panel"]')
        ).toBeTruthy();
        expect(
            container.querySelector('[data-testid="registry-panel-stego.toolkit.sidebar"]')
        ).toBeNull();
    });
});

describe('RegistrySettingsList', () => {
    it('renders nothing when no sections match the context', async () => {
        const store = seedStore([]);
        const { container } = await mount(<RegistrySettingsList />, store);
        expect(container.querySelector('[data-testid="registry-settings-list"]')).toBeNull();
    });

    it('emits sections for every granted customization', async () => {
        const store = seedStore(
            ['settings.preferences.read', 'stego.settings.read'],
            { settingsParity: true, stegoToolkit: true }
        );

        const { container } = await mount(<RegistrySettingsList />, store);

        expect(container.querySelector('[data-testid="registry-settings-list"]')).toBeTruthy();
        expect(
            container.querySelector('[data-testid="registry-settings-section-Preferences"]')
        ).toBeTruthy();
        expect(
            container.querySelector('[data-testid="registry-settings-section-Steganography"]')
        ).toBeTruthy();
    });

    it('honors the filter prop', async () => {
        const store = seedStore(
            ['settings.preferences.read', 'settings.sidebar.read'],
            { settingsParity: true }
        );

        const { container } = await mount(
            <RegistrySettingsList filter={(section) => section === 'Sidebar'} />,
            store
        );

        expect(
            container.querySelector('[data-testid="registry-settings-section-Sidebar"]')
        ).toBeTruthy();
        expect(
            container.querySelector('[data-testid="registry-settings-section-Preferences"]')
        ).toBeNull();
    });
});

describe('RegistryRouteList + buildRegistryRouteObjects', () => {
    it('renders the matching component when a registry route is navigated (standalone form)', async () => {
        const store = seedStore(['stego.toolkit.use'], { stegoToolkit: true });

        const { container } = await mount(
            <MemoryRouter initialEntries={['/stego/channels']}>
                <RegistryRouteList />
            </MemoryRouter>,
            store
        );

        // The toolkit placeholder route renders an h1 "Stego Toolkit".
        const heading = Array.from(container.querySelectorAll('h1')).find(
            (h) => h.textContent === 'Stego Toolkit'
        );
        expect(heading).toBeTruthy();
    });

    it('builds RouteObject[] with absolute paths matching composeFeatureRoutes', () => {
        const objects = buildRegistryRouteObjects({
            capabilities: ['stego.toolkit.use'],
            flags: { ...runtimeFeatureFlags, stegoToolkit: true },
        });
        const paths = objects.map((obj) => obj.path);
        expect(paths).toContain('/stego/channels');
        // Customizations the context didn't grant must not leak through.
        expect(paths).not.toContain('/stego/channels/lifecycle');
    });

    it('returns an empty RouteObject[] when no capability matches', () => {
        // Disable always-on flag-only-gated features so the "no routes" condition holds.
        const objects = buildRegistryRouteObjects({
            capabilities: [],
            flags: {
                ...runtimeFeatureFlags,
                communities: false,
                canopyServer: false,
                plugins: false,
                coalition: false,
                coliseum: false,
                streaming: false,
                marketTab: false,
                migrationHub: false,
            },
        });
        expect(objects).toEqual([]);
    });
});
