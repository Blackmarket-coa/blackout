import { describe, expect, it } from 'vitest';
import { defaultFeatureFlags, type FeatureFlags } from '../../../src/app/core/features/featureFlags';
import { runtimePluginManifest } from '../../../src/app/core/features/manifest';
import { buildRuntimePluginManifest, orderedRuntimePlugins } from '../../../src/app/plugins/manifest';

describe('runtime plugin manifest enforcement', () => {
    it('keeps runtime plugin declarations in canonical allowlist order', () => {
        expect(orderedRuntimePlugins.map((plugin) => plugin.id)).toEqual(runtimePluginManifest);
    });

    it('allows each plugin to be enabled independently', () => {
        runtimePluginManifest.forEach((pluginId) => {
            const isolatedFlags: FeatureFlags = {
                ...defaultFeatureFlags,
                legacyShellLayout: false,
                legacyThemeOverrides: false,
                composerQuickActions: false,
                navigationSpaceHierarchy: false,
                notificationsAdapter: false,
                rightPanelPlugins: false,
            };

            if (pluginId === 'shell.legacy-layout') isolatedFlags.legacyShellLayout = true;
            if (pluginId === 'theme.legacy-overrides') isolatedFlags.legacyThemeOverrides = true;
            if (pluginId === 'composer.quick-actions') isolatedFlags.composerQuickActions = true;
            if (pluginId === 'navigation.space-hierarchy')
                isolatedFlags.navigationSpaceHierarchy = true;
            if (pluginId === 'notifications.adapter') isolatedFlags.notificationsAdapter = true;
            if (pluginId === 'right-panel.slots') isolatedFlags.rightPanelPlugins = true;

            const entries = buildRuntimePluginManifest(isolatedFlags);

            expect(entries.filter((entry) => entry.enabled).map((entry) => entry.id)).toEqual([
                pluginId,
            ]);
        });
    });

    it('allows each plugin to be disabled independently from an all-enabled baseline', () => {
        runtimePluginManifest.forEach((pluginId) => {
            const allEnabledFlags: FeatureFlags = {
                ...defaultFeatureFlags,
                legacyShellLayout: true,
                legacyThemeOverrides: true,
                composerQuickActions: true,
                navigationSpaceHierarchy: true,
                notificationsAdapter: true,
                rightPanelPlugins: true,
            };

            if (pluginId === 'shell.legacy-layout') allEnabledFlags.legacyShellLayout = false;
            if (pluginId === 'theme.legacy-overrides') allEnabledFlags.legacyThemeOverrides = false;
            if (pluginId === 'composer.quick-actions') allEnabledFlags.composerQuickActions = false;
            if (pluginId === 'navigation.space-hierarchy')
                allEnabledFlags.navigationSpaceHierarchy = false;
            if (pluginId === 'notifications.adapter') allEnabledFlags.notificationsAdapter = false;
            if (pluginId === 'right-panel.slots') allEnabledFlags.rightPanelPlugins = false;

            const entries = buildRuntimePluginManifest(allEnabledFlags);
            const disabledEntry = entries.find((entry) => entry.id === pluginId);

            expect(disabledEntry?.enabled).toBe(false);
            expect(entries.map((entry) => entry.id)).toEqual(runtimePluginManifest);
        });
    });
});
