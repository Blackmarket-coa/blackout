import { describe, expect, it } from 'vitest';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import {
    composeFeatureNavItems,
    composeFeatureRoutes,
    composeFeatureSettings,
    orderFeatureModulePlugins,
} from '../../../../src/app/core/features/composition';
import type { FeatureFlags } from '../../../../src/app/core/features/featureFlags';
import type { FeatureModulePlugin } from '../../../../src/app/core/features/types';

const capabilityContext = (flags: FeatureFlags) => ({
    capabilities: [
        'governance.read',
        'forum.read',
        'deaddrop.read',
        'moderation.read',
        'governance.write',
        'forum.write',
        'deaddrop.write',
        'moderation.write',
    ],
    flags,
});

describe('feature registry composition surfaces', () => {
    it('builds deterministic route/nav/settings snapshots for default preset', () => {
        const flags: FeatureFlags = {
            governance: true,
            forum: true,
            deaddrop: true,
            steganography: false,
            moderation: false,
            legacyShellLayout: false,
            legacyThemeOverrides: false,
            composerQuickActions: true,
            navigationSpaceHierarchy: true,
            notificationsAdapter: true,
            rightPanelPlugins: true,
        };

        const registry = buildFeatureRegistry(flags);
        const context = capabilityContext(flags);

        expect(registry.map((feature) => feature.id)).toMatchInlineSnapshot(`
          [
            "governance",
            "forum",
            "deaddrop",
          ]
        `);
        expect(composeFeatureRoutes(registry, context).map((route) => route.path))
            .toMatchInlineSnapshot(`
          [
            "/governance",
            "/governance/new",
            "/forum",
            "/deaddrop",
          ]
        `);
        expect(composeFeatureNavItems(registry, context).map((item) => item.to))
            .toMatchInlineSnapshot(`
          [
            "/governance",
            "/forum",
            "/deaddrop",
          ]
        `);
        expect(composeFeatureSettings(registry, context).map((item) => item.section))
            .toMatchInlineSnapshot(`
          [
            "Dead Drop",
          ]
        `);
    });

    it('builds deterministic route/nav/settings snapshots for non-default preset', () => {
        const flags: FeatureFlags = {
            governance: false,
            forum: false,
            deaddrop: true,
            steganography: false,
            moderation: true,
            legacyShellLayout: false,
            legacyThemeOverrides: false,
            composerQuickActions: true,
            navigationSpaceHierarchy: true,
            notificationsAdapter: true,
            rightPanelPlugins: true,
        };

        const registry = buildFeatureRegistry(flags);
        const context = capabilityContext(flags);

        expect(registry.map((feature) => feature.id)).toMatchInlineSnapshot(`
          [
            "deaddrop",
            "moderation",
          ]
        `);
        expect(composeFeatureRoutes(registry, context).map((route) => route.path))
            .toMatchInlineSnapshot(`
          [
            "/deaddrop",
            "/moderation/draupnir",
          ]
        `);
        expect(composeFeatureNavItems(registry, context).map((item) => item.to))
            .toMatchInlineSnapshot(`
          [
            "/deaddrop",
            "/moderation/draupnir",
          ]
        `);
        expect(composeFeatureSettings(registry, context).map((item) => item.section))
            .toMatchInlineSnapshot(`
          [
            "Dead Drop",
          ]
        `);
    });

    it('orders feature module plugins by allowlist order and rejects unknown ids', () => {
        const plugins: FeatureModulePlugin[] = [
            { id: 'plugin.beta', modules: [] },
            { id: 'plugin.alpha', modules: [] },
        ];

        expect(orderFeatureModulePlugins(plugins).map((plugin) => plugin.id)).toEqual([
            'plugin.alpha',
            'plugin.beta',
        ]);
        expect(() => orderFeatureModulePlugins([{ id: 'plugin.rogue', modules: [] }])).toThrow(
            /Unknown feature module plugin id/
        );
    });

    it('rejects legacy feature composition paths without plugin customizations', () => {
        expect(() =>
            composeFeatureRoutes([
                {
                    id: 'legacy-feature',
                    name: 'Legacy Feature',
                },
            ])
        ).toThrow(/must define plugin customizations/);
    });
});
