import { describe, expect, it } from 'vitest';
import {
    type ModActionEntry,
    classifyModSeverity,
    dayBoundaryTs,
    filterModActionEntries,
} from '../../../../src/app/features/moderation/moderationLog';

const entry = (over: Partial<ModActionEntry>): ModActionEntry => ({
    eventId: 'e',
    action: 'message',
    moderator: '@mod:srv',
    target: '@user:srv',
    reason: '',
    timestamp: 1_000,
    ...over,
});

describe('classifyModSeverity', () => {
    it('maps actions to severities', () => {
        expect(classifyModSeverity('ban')).toBe('high');
        expect(classifyModSeverity('kick')).toBe('medium');
        expect(classifyModSeverity('remove_content')).toBe('medium');
        expect(classifyModSeverity('timeout')).toBe('low');
        expect(classifyModSeverity('slowmode')).toBe('low');
        expect(classifyModSeverity('message')).toBe('info');
    });
});

describe('dayBoundaryTs', () => {
    it('returns null for empty/invalid input', () => {
        expect(dayBoundaryTs('', 'start')).toBeNull();
        expect(dayBoundaryTs('not-a-date', 'end')).toBeNull();
    });

    it('produces ordered start/end boundaries for the same day', () => {
        const start = dayBoundaryTs('2026-05-27', 'start');
        const end = dayBoundaryTs('2026-05-27', 'end');
        expect(start).not.toBeNull();
        expect(end).not.toBeNull();
        expect((end as number) - (start as number)).toBeGreaterThan(0);
    });
});

describe('filterModActionEntries', () => {
    const entries = [
        entry({ eventId: '1', action: 'ban', target: '@bad:srv', timestamp: 1000 }),
        entry({ eventId: '2', action: 'timeout', moderator: '@alice:srv', timestamp: 2000 }),
        entry({ eventId: '3', action: 'message', reason: 'spam link', timestamp: 3000 }),
    ];
    const base = { action: 'all', moderator: '', target: '', query: '', fromTs: null, toTs: null };

    it('filters by action type', () => {
        const out = filterModActionEntries(entries, { ...base, action: 'ban' });
        expect(out.map((e) => e.eventId)).toEqual(['1']);
    });

    it('filters by moderator and target substrings', () => {
        expect(filterModActionEntries(entries, { ...base, moderator: 'alice' })).toHaveLength(1);
        expect(filterModActionEntries(entries, { ...base, target: 'bad' })).toHaveLength(1);
    });

    it('filters by free-text query across fields', () => {
        const out = filterModActionEntries(entries, { ...base, query: 'spam' });
        expect(out.map((e) => e.eventId)).toEqual(['3']);
    });

    it('filters by timestamp range', () => {
        const out = filterModActionEntries(entries, { ...base, fromTs: 1500, toTs: 2500 });
        expect(out.map((e) => e.eventId)).toEqual(['2']);
    });
});
