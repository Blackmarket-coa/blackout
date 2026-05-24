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

    it('enables every feature flag when the beta unlock flag is set', () => {
        for (const key of ['BLACKOUT_BETA_UNLOCK_ALL', 'VITE_BLACKOUT_BETA_UNLOCK_ALL'] as const) {
            const flags = resolveFeatureFlags({ [key]: 'true' });
            expect(Object.values(flags).every((value) => value === true)).toBe(true);
            // including monetization, which is off by default
            expect(flags.monetization).toBe(true);
            expect(flags.monetizationSuite).toBe(true);
        }
    });

    it('leaves flags at defaults when the beta unlock flag is absent', () => {
        const flags = resolveFeatureFlags({});
        expect(flags).toEqual(defaultFeatureFlags);
    });
});
