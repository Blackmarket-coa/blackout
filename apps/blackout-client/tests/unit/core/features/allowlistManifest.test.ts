import { describe, expect, it } from 'vitest';
import {
    assertFeatureModuleIdAllowed,
    assertFeatureModulePluginIdAllowed,
    assertRuntimePluginIdAllowed,
    featureModuleManifest,
    featureModulePluginManifest,
    runtimePluginManifest,
} from '../../../../src/app/core/features/manifest';

describe('feature allowlist manifest', () => {
    it('exposes stable feature module IDs for registry composition', () => {
        expect(featureModuleManifest).toEqual([
            'governance',
            'forum',
            'deaddrop',
            'deadman',
            'moderation',
            'monetization',
            'platform-ops',
            'notifications-presence',
            'media-call',
            'stego-toolkit',
            'settings-parity',
            'federated-ops',
            'auth-threads',
            'education',
            'coalition',
            'coliseum',
            'migration-hub',
            'profile',
            'home',
            'communities',
            'plugins',
            'shell-destinations',
            'topics',
            'market',
            'creators',
            'creators-storefront',
            'streams',
            'streaming',
            'events',
            'onboarding-creator',
            'creators-dashboard',
            'federation-self-host',
            'privacy-tools',
            'burner-identity',
            'panic',
            'mesh',
        ]);
    });

    it('exposes stable feature module plugin IDs for deterministic ordering', () => {
        expect(featureModulePluginManifest).toEqual([
            'plugin.alpha',
            'plugin.beta',
            'plugin.monetization',
        ]);
    });

    it('accepts known feature module IDs', () => {
        expect(() => assertFeatureModuleIdAllowed('forum')).not.toThrow();
    });

    it('rejects unknown feature module IDs', () => {
        expect(() => assertFeatureModuleIdAllowed('rogue-feature')).toThrow(
            /Unknown feature module id/
        );
    });

    it('accepts known feature module plugin IDs and rejects unknown IDs', () => {
        expect(() => assertFeatureModulePluginIdAllowed('plugin.alpha')).not.toThrow();
        expect(() => assertFeatureModulePluginIdAllowed('unknown.plugin')).toThrow(
            /Unknown feature module plugin id/
        );
    });

    it('accepts known runtime plugin IDs and rejects unknown IDs', () => {
        expect(runtimePluginManifest).toContain('shell.legacy-layout');
        expect(runtimePluginManifest).toContain('theme.legacy-overrides');
        expect(runtimePluginManifest).toContain('composer.quick-actions');
        expect(() => assertRuntimePluginIdAllowed('right-panel.slots')).not.toThrow();
        expect(() => assertRuntimePluginIdAllowed('unknown.plugin')).toThrow(
            /Unknown runtime plugin id/
        );
    });
});
