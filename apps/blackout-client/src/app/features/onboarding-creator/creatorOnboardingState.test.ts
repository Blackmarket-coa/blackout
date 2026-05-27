import { describe, expect, it } from 'vitest';
import {
    CREATOR_ONBOARDING_STEP_SEQUENCE,
    __test,
} from './creatorOnboardingState';

const { normalizeProgress, buildDefaultProgress, clampStepIndex, mergeProgress } = __test;

describe('creatorOnboardingState normalization', () => {
    it('clamps the step index into the sequence range', () => {
        expect(clampStepIndex(-5)).toBe(0);
        expect(clampStepIndex(999)).toBe(CREATOR_ONBOARDING_STEP_SEQUENCE.length - 1);
        expect(clampStepIndex(2)).toBe(2);
    });

    it('falls back to defaults for non-object input', () => {
        const normalized = normalizeProgress(undefined);
        expect(normalized.creatorStepIndex).toBe(0);
        expect(normalized.creatorCompleted).toBe(false);
        expect(normalized.selectedArchetypes).toEqual([]);
    });

    it('filters invalid archetypes and non-string array entries', () => {
        const normalized = normalizeProgress({
            selectedArchetypes: ['streamer', 'not-a-real-archetype', 42],
            linkedProviders: ['twitch', 7],
            selectedDenTypes: ['Workshop', null],
        });
        expect(normalized.selectedArchetypes).toEqual(['streamer']);
        expect(normalized.linkedProviders).toEqual(['twitch']);
        expect(normalized.selectedDenTypes).toEqual(['Workshop']);
    });

    it('only accepts valid ambassador tiers', () => {
        expect(normalizeProgress({ enrolledRewardTier: 'seedling' }).enrolledRewardTier).toBe(
            'seedling'
        );
        expect(
            normalizeProgress({ enrolledRewardTier: 'bogus' }).enrolledRewardTier
        ).toBeUndefined();
    });

    it('clamps an out-of-range persisted step index', () => {
        expect(normalizeProgress({ creatorStepIndex: 999 }).creatorStepIndex).toBe(
            CREATOR_ONBOARDING_STEP_SEQUENCE.length - 1
        );
    });
});

describe('creatorOnboardingState merge', () => {
    it('merges a patch and clamps the step index', () => {
        const base = buildDefaultProgress();
        const next = mergeProgress(base, { creatorStepIndex: 999, installedKitId: 'streamer' });
        expect(next.creatorStepIndex).toBe(CREATOR_ONBOARDING_STEP_SEQUENCE.length - 1);
        expect(next.installedKitId).toBe('streamer');
        expect(next.updatedAt).toBeGreaterThanOrEqual(base.updatedAt);
    });
});
