import { describe, expect, it } from 'vitest';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import {
    composeFeatureNavItems,
    composeFeatureRoutes,
    composeFeatureSettings,
} from '../../../../src/app/core/features/composition';
import type { FeatureFlags } from '../../../../src/app/core/features/featureFlags';

describe('feature registry composition surfaces', () => {
    it('builds deterministic route/nav/settings snapshots for default preset', () => {
        const flags: FeatureFlags = {
            governance: true,
            forum: true,
            deaddrop: true,
            steganography: false,
            moderation: false,
            logistics: false,
        };

        const registry = buildFeatureRegistry(flags);

        expect(registry.map((feature) => feature.id)).toMatchInlineSnapshot(`
          [
            "governance",
            "forum",
            "deaddrop",
          ]
        `);
        expect(composeFeatureRoutes(registry).map((route) => route.path)).toMatchInlineSnapshot(`
          [
            "/governance",
            "/governance/new",
            "/forum",
            "/deaddrop",
          ]
        `);
        expect(composeFeatureNavItems(registry).map((item) => item.to)).toMatchInlineSnapshot(`
          [
            "/governance",
            "/forum",
            "/deaddrop",
          ]
        `);
        expect(composeFeatureSettings(registry).map((item) => item.section)).toMatchInlineSnapshot(`
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
            logistics: false,
        };

        const registry = buildFeatureRegistry(flags);

        expect(registry.map((feature) => feature.id)).toMatchInlineSnapshot(`
          [
            "deaddrop",
            "moderation",
          ]
        `);
        expect(composeFeatureRoutes(registry).map((route) => route.path)).toMatchInlineSnapshot(`
          [
            "/deaddrop",
            "/moderation/draupnir",
          ]
        `);
        expect(composeFeatureNavItems(registry).map((item) => item.to)).toMatchInlineSnapshot(`
          [
            "/deaddrop",
            "/moderation/draupnir",
          ]
        `);
        expect(composeFeatureSettings(registry).map((item) => item.section)).toMatchInlineSnapshot(`
          [
            "Dead Drop",
          ]
        `);
    });
});
