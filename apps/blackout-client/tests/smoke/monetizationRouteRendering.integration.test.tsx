// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFeatureCustomizations } from '../../src/app/core/features/capabilityGate';
import { defaultFeatureFlags } from '../../src/app/core/features/featureFlags';
import { monetizationFeature } from '../../src/app/features/monetization/manifest';
import { SettingsPage } from '../../src/app/features/settings/SettingsPage';
import { settingsPageAtom } from '../../src/app/features/settings/settingsAtoms';
import { monetizationThemeBundleAppearanceCtaPath } from '../../src/app/features/monetization/themes/themeBundleCta';

vi.mock('../../src/app/features/monetization/subscriptions/SubscriptionsSlice', () => ({
    SubscriptionsSlice: () => <div>Subscriptions slice</div>,
}));
vi.mock('../../src/app/features/monetization/boosts/BoostsSlice', () => ({
    BoostsSlice: () => <div>Boosts slice</div>,
}));
vi.mock('../../src/app/features/monetization/quests/QuestsSlice', () => ({
    QuestsSlice: () => <div>Quests slice</div>,
}));
vi.mock('../../src/app/features/monetization/marketplace/MarketplaceSlice', () => ({
    MarketplaceSlice: () => <div>Marketplace slice</div>,
}));
vi.mock('../../src/app/features/monetization/apps/AppsSlice', () => ({
    AppsSlice: () => <div>Apps slice</div>,
}));
vi.mock('../../src/app/features/monetization/themes/ThemesSlice', () => ({
    ThemesSlice: () => (
        <a href="#settings/appearance" data-testid="theme-cta">
            Open appearance settings
        </a>
    ),
}));
vi.mock('../../src/app/features/settings/AccountSettings', () => ({ default: () => <div>Account view</div> }));
vi.mock('../../src/app/features/settings/AppearanceSettings', () => ({ default: () => <div>Appearance view</div> }));
vi.mock('../../src/app/features/settings/NotificationSettings', () => ({ default: () => <div>Notifications view</div> }));
vi.mock('../../src/app/features/settings/PrivacySettings', () => ({ default: () => <div>Privacy view</div> }));
vi.mock('../../src/app/features/settings/VoiceVideoSettings', () => ({ default: () => <div>Voice view</div> }));
vi.mock('../../src/app/features/settings/AccessibilitySettings', () => ({ default: () => <div>Accessibility view</div> }));
vi.mock('../../src/app/features/settings/KeybindsSettings', () => ({ default: () => <div>Keybinds view</div> }));
vi.mock('../../src/app/features/settings/DeveloperSettings', () => ({ default: () => <div>Developer view</div> }));
vi.mock('../../src/app/features/settings/AboutSettings', () => ({ default: () => <div>About view</div> }));

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
});

const render = (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mountedRoots.push(root);
    flushSync(() => {
        root.render(node);
    });
    return container;
};

describe('monetization integration matrix', () => {
    it('renders monetization module routes through the shared shell', () => {
        const enabledFlags = {
            ...defaultFeatureFlags,
            monetization: true,
            monetizationSubscriptions: true,
            monetizationBoosts: true,
            monetizationMarketplace: true,
            monetizationQuests: true,
            monetizationPayouts: true,
            monetizationAnalytics: true,
        };
        const enabledCustomizations = resolveFeatureCustomizations(monetizationFeature, {
            capabilities: [
                'billing.read',
                'billing.write',
                'marketplace.read',
                'payouts.read',
                'themes.commerce',
            ],
            flags: enabledFlags,
        });
        const overviewRoute = enabledCustomizations[0]?.routes?.[0];
        const subscriptionsRoute = enabledCustomizations[1]?.routes?.[0];

        const overview = render(
            <Provider store={createStore()}>
                {overviewRoute ? React.createElement(overviewRoute.component) : null}
            </Provider>
        );

        expect(overview.textContent).toContain('Monetization Module');
        expect(overview.textContent).toContain('Monetization suite overview');

        const subscriptions = render(
            <Provider store={createStore()}>
                {subscriptionsRoute ? React.createElement(subscriptionsRoute.component) : null}
            </Provider>
        );

        expect(subscriptions.textContent).toContain('Subscriptions');
    });

    it('switches settings sections from appearance to about', () => {
        const store = createStore();
        const container = render(
            <Provider store={store}>
                <SettingsPage />
            </Provider>
        );

        const about = Array.from(container.querySelectorAll('button')).find((button) =>
            button.textContent?.includes('About')
        );
        expect(about).toBeTruthy();
        about?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(store.get(settingsPageAtom)).toBe('about');
    });

    it('shows unavailable state when capability gates are off', () => {
        const disabledCustomizations = resolveFeatureCustomizations(monetizationFeature, {
            capabilities: ['billing.read', 'billing.write', 'marketplace.read', 'payouts.read'],
            flags: { ...defaultFeatureFlags, monetization: false },
        });

        expect(disabledCustomizations).toEqual([]);
    });

    it('keeps theme-bundle CTA wired to appearance settings path', () => {
        expect(monetizationThemeBundleAppearanceCtaPath).toBe('#settings/appearance');
    });
});
