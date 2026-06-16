import { describe, expect, it } from 'vitest';
import { defaultFeatureFlags } from '../../../../src/app/core/features/featureFlags';
import {
    USER_TOGGLEABLE_FLAGS,
    isUserToggleableFlag,
    resolveEffectiveFlags,
    sanitizeFlagOverrides,
} from '../../../../src/app/core/features/effectiveFlags';

describe('effectiveFlags allowlist', () => {
    it('only lists presentation/discovery flags (no privileged/entitlement/monetization)', () => {
        expect([...USER_TOGGLEABLE_FLAGS]).toEqual([
            'stegoToolkit',
            'topics',
            'homeFeedSegments',
            'homeStreak',
            'homeBountyBoard',
            'seriesTag',
            'transparencyReports',
        ]);
        for (const forbidden of [
            'monetization',
            'monetizationSuite',
            'moderation',
            'platformOps',
            'federatedOps',
            'shieldVisibility',
            'meshTransport',
            'shellAppShell',
        ]) {
            expect(isUserToggleableFlag(forbidden)).toBe(false);
        }
    });

    it('isUserToggleableFlag recognizes allowlisted flags', () => {
        expect(isUserToggleableFlag('topics')).toBe(true);
        expect(isUserToggleableFlag('stegoToolkit')).toBe(true);
        expect(isUserToggleableFlag('not-a-flag')).toBe(false);
    });
});

describe('sanitizeFlagOverrides', () => {
    it('keeps allowlisted booleans and drops everything else', () => {
        expect(
            sanitizeFlagOverrides({
                topics: true,
                stegoToolkit: false,
                monetization: true, // not allowlisted → dropped
                shellAppShell: true, // structural → dropped
                seriesTag: 'yes', // non-boolean → dropped
                unknownKey: true, // unknown → dropped
            })
        ).toEqual({ topics: true, stegoToolkit: false });
    });

    it('returns an empty object for nullish input', () => {
        expect(sanitizeFlagOverrides(null)).toEqual({});
        expect(sanitizeFlagOverrides(undefined)).toEqual({});
    });
});

describe('resolveEffectiveFlags', () => {
    it('layers only allowlisted overrides on top of the base', () => {
        const effective = resolveEffectiveFlags(defaultFeatureFlags, {
            topics: true,
            monetization: true, // must be ignored — entitlement/SKU gated
        });
        expect(effective.topics).toBe(true);
        expect(effective.monetization).toBe(defaultFeatureFlags.monetization);
        // untouched flags are preserved
        expect(effective.governance).toBe(defaultFeatureFlags.governance);
    });

    it('is a no-op when overrides are empty', () => {
        expect(resolveEffectiveFlags(defaultFeatureFlags, {})).toEqual(defaultFeatureFlags);
        expect(resolveEffectiveFlags(defaultFeatureFlags, null)).toEqual(defaultFeatureFlags);
    });
});
