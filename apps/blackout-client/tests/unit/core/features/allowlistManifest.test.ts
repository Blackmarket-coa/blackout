import { describe, expect, it } from 'vitest';
import {
    assertFeatureModuleIdAllowed,
    assertRuntimePluginIdAllowed,
    featureModuleManifest,
    runtimePluginManifest,
} from '../../../../src/app/core/features/manifest';

describe('feature allowlist manifest', () => {
    it('exposes stable feature module IDs for registry composition', () => {
        expect(featureModuleManifest).toEqual(['governance', 'forum', 'deaddrop', 'moderation']);
    });

    it('accepts known feature module IDs', () => {
        expect(() => assertFeatureModuleIdAllowed('forum')).not.toThrow();
    });

    it('rejects unknown feature module IDs', () => {
        expect(() => assertFeatureModuleIdAllowed('rogue-feature')).toThrow(
            /Unknown feature module id/
        );
    });

    it('accepts known runtime plugin IDs and rejects unknown IDs', () => {
        expect(runtimePluginManifest).toContain('composer.quick-actions');
        expect(() => assertRuntimePluginIdAllowed('right-panel.slots')).not.toThrow();
        expect(() => assertRuntimePluginIdAllowed('unknown.plugin')).toThrow(
            /Unknown runtime plugin id/
        );
    });
});
