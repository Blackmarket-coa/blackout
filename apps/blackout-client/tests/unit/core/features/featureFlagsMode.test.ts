import { describe, expect, it } from 'vitest';
import {
    defaultFeatureFlags,
    resolveFeatureFlags,
    runtimePluginFeatureFlags,
} from '../../../../src/app/core/features/featureFlags';

describe('resolveFeatureFlags', () => {
    it('returns defaults when no mode is provided', () => {
        const flags = resolveFeatureFlags({});

        expect(flags).toEqual(defaultFeatureFlags);
        expect(flags.steganography).toBe(true);
    });

    it('keeps legacy shell fallback disabled in baseline mode unless explicitly enabled', () => {
        const flags = resolveFeatureFlags({ BLACKOUT_FEATURE_MODE: 'baseline' });

        Object.entries(runtimePluginFeatureFlags).forEach(([pluginId, flagName]) => {
            if (pluginId === 'shell.legacy-layout') {
                expect(flags[flagName]).toBe(false);
                return;
            }
            expect(flags[flagName]).toBe(false);
        });

        expect(flags.governance).toBe(defaultFeatureFlags.governance);
        expect(flags.forum).toBe(defaultFeatureFlags.forum);
    });

    it('enables non-legacy runtime plugin flags in full mode while preserving default shell composition', () => {
        const flags = resolveFeatureFlags({ BLACKOUT_FEATURE_MODE: 'full' });

        Object.entries(runtimePluginFeatureFlags).forEach(([pluginId, flagName]) => {
            if (pluginId === 'shell.legacy-layout') {
                expect(flags[flagName]).toBe(false);
                return;
            }
            expect(flags[flagName]).toBe(true);
        });
    });

    it('allows explicit legacy shell fallback override in any mode', () => {
        const baselineFallback = resolveFeatureFlags({
            BLACKOUT_FEATURE_MODE: 'baseline',
            BLACKOUT_LEGACY_SHELL_FALLBACK: 'true',
        });
        const defaultFallback = resolveFeatureFlags({
            BLACKOUT_LEGACY_SHELL_FALLBACK: 'true',
        });

        expect(baselineFallback.legacyShellLayout).toBe(true);
        expect(defaultFallback.legacyShellLayout).toBe(true);
    });
});
