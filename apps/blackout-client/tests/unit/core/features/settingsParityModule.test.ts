import { describe, expect, it } from 'vitest';
import {
    composeFeatureRoutes,
    composeFeatureSettings,
    composeShellPanels,
} from '../../../../src/app/core/features/composition';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import {
    defaultFeatureFlags,
    type FeatureFlags,
} from '../../../../src/app/core/features/featureFlags';

const flagsWithSettingsParity = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    settingsParity: true,
    ...overrides,
});

describe('settings-parity feature module (BKL-007)', () => {
    it('exposes the preferences route + sidebar entry + section on settings.preferences.read', () => {
        const flags = flagsWithSettingsParity();
        const registry = buildFeatureRegistry(flags);

        const without = { capabilities: ['settings.sidebar.read'], flags };
        const withPrefs = { capabilities: ['settings.preferences.read'], flags };

        expect(composeFeatureRoutes(registry, without).map((r) => r.path)).not.toContain(
            '/settings/preferences'
        );
        const prefsRoutes = composeFeatureRoutes(registry, withPrefs).map((r) => r.path);
        expect(prefsRoutes).toContain('/settings/preferences');
        expect(prefsRoutes).not.toContain('/settings/sidebar');
        expect(prefsRoutes).not.toContain('/settings/labs');

        expect(
            composeShellPanels(registry, withPrefs)
                .map((p) => p.id)
                .filter((id) => id.startsWith('settings.'))
        ).toEqual(['settings.preferences.sidebar']);

        const prefsSections = composeFeatureSettings(registry, withPrefs).map((s) => s.section);
        expect(prefsSections).toContain('Preferences');
        expect(prefsSections).not.toContain('Sidebar');
        expect(prefsSections).not.toContain('Labs');
    });

    it('exposes the sidebar surfaces independently on settings.sidebar.read', () => {
        const flags = flagsWithSettingsParity();
        const registry = buildFeatureRegistry(flags);

        const sidebar = { capabilities: ['settings.sidebar.read'], flags };
        const sidebarRoutes = composeFeatureRoutes(registry, sidebar).map((r) => r.path);
        expect(sidebarRoutes).toEqual(['/settings/sidebar']);
        expect(composeFeatureSettings(registry, sidebar).map((s) => s.section)).toEqual([
            'Sidebar',
        ]);
    });

    it('hides the labs surfaces unless settings.labs.show is granted (legacy.config.labs_gate parity)', () => {
        const flags = flagsWithSettingsParity();
        const registry = buildFeatureRegistry(flags);

        // No labs cap, even with prefs+sidebar — labs stays hidden.
        const noLabs = {
            capabilities: ['settings.preferences.read', 'settings.sidebar.read'],
            flags,
        };
        expect(composeFeatureRoutes(registry, noLabs).map((r) => r.path)).not.toContain(
            '/settings/labs'
        );
        expect(
            composeShellPanels(registry, noLabs)
                .map((p) => p.id)
                .includes('settings.labs.sidebar')
        ).toBe(false);
        expect(composeFeatureSettings(registry, noLabs).map((s) => s.section)).not.toContain(
            'Labs'
        );

        // Granting `settings.labs.show` surfaces all three labs entries.
        const withLabs = { capabilities: ['settings.labs.show'], flags };
        expect(composeFeatureRoutes(registry, withLabs).map((r) => r.path)).toContain(
            '/settings/labs'
        );
        expect(
            composeShellPanels(registry, withLabs)
                .map((p) => p.id)
                .includes('settings.labs.sidebar')
        ).toBe(true);
        expect(composeFeatureSettings(registry, withLabs).map((s) => s.section)).toContain(
            'Labs'
        );
    });

    it('disabling the settingsParity flag prunes everything', () => {
        const flags = flagsWithSettingsParity({ settingsParity: false });
        const registry = buildFeatureRegistry(flags);
        const fullCaps = {
            capabilities: [
                'settings.preferences.read',
                'settings.sidebar.read',
                'settings.labs.show',
            ],
            flags,
        };

        expect(registry.map((f) => f.id)).not.toContain('settings-parity');
        expect(
            composeFeatureRoutes(registry, fullCaps)
                .map((r) => r.path)
                .some((path) => path.startsWith('/settings/'))
        ).toBe(false);
        expect(
            composeShellPanels(registry, fullCaps)
                .map((p) => p.id)
                .some((id) => id.startsWith('settings.'))
        ).toBe(false);
        const sections = composeFeatureSettings(registry, fullCaps).map((s) => s.section);
        ['Preferences', 'Sidebar', 'Labs'].forEach((label) => {
            expect(sections).not.toContain(label);
        });
    });
});
