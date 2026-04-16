import { describe, expect, it } from 'vitest';
import { assertFeatureModulesRegistered, orderFeatureModulePlugins } from '../../../../src/app/core/features/composition';
import {
    assertFeatureModuleIdAllowed,
    assertFeatureModulePluginIdAllowed,
    assertRuntimePluginIdAllowed,
    featureModuleManifest,
} from '../../../../src/app/core/features/manifest';

describe('CI policy matrix: plugin-only customization gates', () => {
    it('keeps all core feature modules gated by the allowlist', () => {
        const representativeCoreModules = [
            { feature: { id: 'governance', name: 'Governance' } },
            { feature: { id: 'forum', name: 'Forum' } },
            { feature: { id: 'deaddrop', name: 'Dead Drop' } },
            { feature: { id: 'moderation', name: 'Moderation' } },
            { feature: { id: 'monetization', name: 'Monetization' } },
        ];

        expect(() =>
            assertFeatureModulesRegistered(representativeCoreModules, featureModuleManifest, 'core')
        ).not.toThrow();
    });

    it('keeps plugin ordering deterministic for approved plugin-only customizations', () => {
        expect(
            orderFeatureModulePlugins([
                { id: 'plugin.monetization', modules: [] },
                { id: 'plugin.alpha', modules: [] },
                { id: 'plugin.beta', modules: [] },
            ]).map((plugin) => plugin.id)
        ).toEqual(['plugin.alpha', 'plugin.beta', 'plugin.monetization']);
    });
});

describe('CI policy matrix: unknown IDs fail fast', () => {
    it('throws for unknown feature IDs', () => {
        expect(() => assertFeatureModuleIdAllowed('feature.rogue')).toThrow(
            /Unknown feature module id/
        );
    });

    it('throws for unknown feature plugin IDs', () => {
        expect(() => assertFeatureModulePluginIdAllowed('plugin.rogue')).toThrow(
            /Unknown feature module plugin id/
        );
    });

    it('throws for unknown runtime plugin IDs', () => {
        expect(() => assertRuntimePluginIdAllowed('runtime.rogue')).toThrow(
            /Unknown runtime plugin id/
        );
    });
});
