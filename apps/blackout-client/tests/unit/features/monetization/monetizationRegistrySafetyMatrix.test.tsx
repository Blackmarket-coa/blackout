// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, Provider } from 'jotai';
import {
    featureModuleManifest,
    featureModulePluginManifest,
} from '../../../../src/app/core/features/manifest';
import { isCapabilityGateSatisfied } from '../../../../src/app/core/features/capabilityGate';
import {
    monetizationBoostsGate,
    monetizationThemePacksGate,
} from '../../../../src/app/features/monetization/gates';
import { monetizationFeature } from '../../../../src/app/features/monetization/manifest';
import {
    appearanceSettingsAtom,
    settingsPageAtom,
} from '../../../../src/app/features/settings/settingsAtoms';

vi.mock('../../../../src/app/features/monetization/routes', () => {
    const Stub = () => React.createElement('div', undefined, 'stub');
    return {
        monetizationOverviewRoutes: [{ path: '/monetization/', component: Stub }],
        monetizationSubscriptionsRoutes: [
            { path: '/monetization/subscriptions/plans/', component: Stub },
        ],
        monetizationBoostsRoutes: [{ path: '/monetization/boosts/', component: Stub }],
        monetizationQuestsRoutes: [{ path: '/monetization/quests/', component: Stub }],
        monetizationMarketplaceRoutes: [{ path: '/monetization/marketplace/', component: Stub }],
        monetizationAppMarketplaceRoutes: [
            { path: '/monetization/app-marketplace/', component: Stub },
        ],
        monetizationPayoutsRevenueAnalyticsRoutes: [
            { path: '/monetization/payouts/revenue-analytics/', component: Stub },
        ],
        monetizationThemePacksRoutes: [{ path: '/monetization/theme-packs/', component: Stub }],
    };
});

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    localStorage.clear();
});

describe('monetization + registry safety unit matrix', () => {
    it('keeps monetization IDs in the feature/module allowlist manifests', () => {
        expect(featureModuleManifest).toContain('monetization');
        expect(featureModulePluginManifest).toContain('plugin.monetization');
    });

    it('enforces monetization capability-gate behavior as fail-closed', () => {
        expect(
            isCapabilityGateSatisfied(monetizationBoostsGate, {
                capabilities: ['billing.write'],
                flags: { monetization: true, monetizationBoosts: true },
            })
        ).toBe(true);

        expect(
            isCapabilityGateSatisfied(monetizationBoostsGate, {
                capabilities: ['billing.write'],
                flags: { monetization: true, monetizationBoosts: false },
            })
        ).toBe(false);

        expect(
            isCapabilityGateSatisfied(monetizationThemePacksGate, {
                capabilities: ['themes.commerce'],
                flags: { monetization: true, monetizationMarketplace: false },
            })
        ).toBe(false);
    });

    it('keeps settings atom defaults and migrates legacy appearance themes', () => {
        localStorage.setItem(
            'blackout.settings.appearance.v1',
            JSON.stringify({
                theme: 'dark',
                accentColor: '#FFFFFF',
                fontScale: 110,
                chatDensity: 'compact',
                emojiStyle: 'system',
                messageGrouping: false,
                showTimestamps: 'always',
            })
        );

        const store = createStore();

        expect(store.get(settingsPageAtom)).toBe('appearance');
        expect(store.get(appearanceSettingsAtom).theme).toBe('dark_canopy');
    });

    it('registers monetization route and nav metadata in feature manifest customizations', () => {
        const monetizationRoutes =
            monetizationFeature.customizations?.flatMap((customization) =>
                (customization.routes ?? []).map((route) => route.path)
            ) ?? [];
        const monetizationNav =
            monetizationFeature.customizations?.flatMap((customization) =>
                (customization.navItems ?? []).map((item) => item.to)
            ) ?? [];

        expect(monetizationRoutes).toEqual([
            '/monetization/',
            '/monetization/subscriptions/plans/',
            '/monetization/boosts/',
            '/monetization/quests/',
            '/monetization/marketplace/',
            '/monetization/app-marketplace/',
            '/monetization/payouts/revenue-analytics/',
            '/monetization/theme-packs/',
        ]);
        expect(monetizationNav).toEqual(['/monetization/']);
    });

    it('renders the monetization route component contract without crashing', () => {
        const monetizationOverview = monetizationFeature.customizations
            ?.flatMap((customization) => customization.routes ?? [])
            .find((route) => route.path === '/monetization/');

        expect(monetizationOverview).toBeTruthy();

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        mountedRoots.push(root);

        flushSync(() => {
            root.render(
                <Provider store={createStore()}>
                    {monetizationOverview ? React.createElement(monetizationOverview.component) : null}
                </Provider>
            );
        });

        expect(container.textContent).toContain('stub');
    });
});
