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
    });

    it('disables all runtime plugin flags in baseline mode', () => {
        const flags = resolveFeatureFlags({ BLACKOUT_FEATURE_MODE: 'baseline' });

        Object.values(runtimePluginFeatureFlags).forEach((flagName) => {
            expect(flags[flagName]).toBe(false);
        });

        expect(flags.governance).toBe(defaultFeatureFlags.governance);
        expect(flags.forum).toBe(defaultFeatureFlags.forum);
    });

    it('enables all runtime plugin flags in full mode', () => {
        const flags = resolveFeatureFlags({ BLACKOUT_FEATURE_MODE: 'full' });

        Object.values(runtimePluginFeatureFlags).forEach((flagName) => {
            expect(flags[flagName]).toBe(true);
        });
    });
});
