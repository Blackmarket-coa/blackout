import { describe, expect, it } from 'vitest';
import { computeStreak, dayNumber, type StreakState } from './streakState';

const NOW = Date.parse('2026-05-25T09:00:00.000Z');
const TODAY = dayNumber(NOW);

const state = (count: number, lastActiveDay: number): StreakState => ({
    count,
    lastActiveDay,
    updatedAt: 0,
});

describe('computeStreak', () => {
    it('starts a fresh streak of 1 on the first ever visit', () => {
        const fresh = state(0, Number.NEGATIVE_INFINITY);
        const next = computeStreak(fresh, TODAY, NOW);
        expect(next.count).toBe(1);
        expect(next.lastActiveDay).toBe(TODAY);
    });

    it('is a no-op (same reference) on a second visit the same day', () => {
        const today = state(3, TODAY);
        const next = computeStreak(today, TODAY, NOW);
        expect(next).toBe(today);
    });

    it('increments when the last visit was yesterday', () => {
        const yesterday = state(3, TODAY - 1);
        const next = computeStreak(yesterday, TODAY, NOW);
        expect(next.count).toBe(4);
        expect(next.lastActiveDay).toBe(TODAY);
    });

    it('resets to 1 when a day was missed', () => {
        const twoDaysAgo = state(9, TODAY - 2);
        const next = computeStreak(twoDaysAgo, TODAY, NOW);
        expect(next.count).toBe(1);
        expect(next.lastActiveDay).toBe(TODAY);
    });
});

describe('dayNumber', () => {
    it('maps timestamps in the same UTC day to the same index', () => {
        const morning = Date.parse('2026-05-25T01:00:00.000Z');
        const evening = Date.parse('2026-05-25T23:00:00.000Z');
        expect(dayNumber(morning)).toBe(dayNumber(evening));
    });

    it('advances by one across a UTC midnight boundary', () => {
        const before = Date.parse('2026-05-25T23:59:00.000Z');
        const after = Date.parse('2026-05-26T00:01:00.000Z');
        expect(dayNumber(after)).toBe(dayNumber(before) + 1);
    });
});
