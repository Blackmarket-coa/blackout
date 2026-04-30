import type { BlackoutFeature } from '../../core/features/types';
import { labsPanels, preferencesPanels, sidebarPanels } from './panels';
import { labsRoutes, preferencesRoutes, sidebarRoutes } from './routes';
import { labsSettings, preferencesSettings, sidebarSettings } from './settings';

/**
 * Settings parity feature module — BKL-007.
 *
 * Three customizations gated by separate capabilities so admins can
 * surface preferences/sidebar without exposing labs (and vice versa):
 *   - `settings-preferences` gated by `settings.preferences.read`
 *   - `settings-sidebar`     gated by `settings.sidebar.read`
 *   - `settings-labs`        gated by `settings.labs.show` (the canonical
 *     mapping for `legacy.config.labs_gate`; the SDK's `resolveLabsGate`
 *     surfaces the underlying configFlag/developerMode breakdown so admins
 *     can grant the capability automatically once the gate is open)
 *
 * All three ride behind the `settingsParity` flag so the default canonical
 * shell stays unchanged until operators opt in.
 *
 * Mirrors `_port`'s `PreferencesUserSettingsTab`, `SidebarUserSettingsTab`,
 * and `LabsUserSettingsTab` plus the `show_labs_settings` SdkConfig flag.
 */
export const settingsParityFeature: BlackoutFeature = {
    id: 'settings-parity',
    name: 'Settings Parity',
    customizations: [
        {
            id: 'settings-preferences',
            name: 'Preferences',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['settings.preferences.read'],
                flags: ['settingsParity'],
            },
            routes: preferencesRoutes,
            panels: preferencesPanels,
            settings: preferencesSettings,
        },
        {
            id: 'settings-sidebar',
            name: 'Sidebar',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['settings.sidebar.read'],
                flags: ['settingsParity'],
            },
            routes: sidebarRoutes,
            panels: sidebarPanels,
            settings: sidebarSettings,
        },
        {
            id: 'settings-labs',
            name: 'Labs',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['settings.labs.show'],
                flags: ['settingsParity'],
            },
            routes: labsRoutes,
            panels: labsPanels,
            settings: labsSettings,
        },
    ],
    capabilities: [
        'settings.preferences.read',
        'settings.sidebar.read',
        'settings.labs.show',
    ],
};
