// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_RECENT_REACTIONS,
    MAX_RECENT_REACTIONS,
    loadRecentReactions,
    pushRecentReaction,
    saveRecentReactions,
} from '../../../../src/app/features/room/recentReactionsStorage';

const STORAGE_KEY = 'blackout.reactions.recent';

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    window.localStorage.clear();
});

describe('recentReactionsStorage (Workstream C — recent reactions persist per device)', () => {
    describe('loadRecentReactions', () => {
        it('returns the default seed when localStorage is empty', () => {
            const result = loadRecentReactions();
            expect(result).toEqual([...DEFAULT_RECENT_REACTIONS]);
        });

        it('returns a fresh array, not the readonly default reference', () => {
            const result = loadRecentReactions();
            expect(result).not.toBe(DEFAULT_RECENT_REACTIONS);
            result.push('💯');
            // Mutating the returned array does not corrupt the default.
            expect(DEFAULT_RECENT_REACTIONS).toEqual([
                '👍',
                '❤️',
                '😂',
                '🎉',
                '👀',
                '🔥',
            ]);
        });

        it('returns the stored values when localStorage holds a valid array', () => {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['💯', '😎', '🚀']));
            expect(loadRecentReactions()).toEqual(['💯', '😎', '🚀']);
        });

        it('returns the default seed when localStorage holds malformed JSON', () => {
            window.localStorage.setItem(STORAGE_KEY, '{not-json');
            expect(loadRecentReactions()).toEqual([...DEFAULT_RECENT_REACTIONS]);
        });

        it('returns the default seed when localStorage holds a non-array value', () => {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));
            expect(loadRecentReactions()).toEqual([...DEFAULT_RECENT_REACTIONS]);
        });

        it('filters out non-string and empty-string entries', () => {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(['💯', 42, '', null, '🚀']),
            );
            expect(loadRecentReactions()).toEqual(['💯', '🚀']);
        });

        it('falls back to the default seed when the cleaned array is empty', () => {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify([42, null, '']));
            expect(loadRecentReactions()).toEqual([...DEFAULT_RECENT_REACTIONS]);
        });

        it('clamps the result to MAX_RECENT_REACTIONS', () => {
            const longList = Array.from({ length: 30 }, (_, i) => `e${i}`);
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(longList));
            const result = loadRecentReactions();
            expect(result).toHaveLength(MAX_RECENT_REACTIONS);
            expect(result[0]).toBe('e0');
            expect(result[MAX_RECENT_REACTIONS - 1]).toBe(`e${MAX_RECENT_REACTIONS - 1}`);
        });
    });

    describe('saveRecentReactions', () => {
        it('persists the list to localStorage as JSON', () => {
            saveRecentReactions(['💯', '😎', '🚀']);
            const raw = window.localStorage.getItem(STORAGE_KEY);
            expect(raw).not.toBeNull();
            expect(JSON.parse(raw ?? '[]')).toEqual(['💯', '😎', '🚀']);
        });

        it('clamps to MAX_RECENT_REACTIONS before persisting', () => {
            const longList = Array.from({ length: 30 }, (_, i) => `e${i}`);
            saveRecentReactions(longList);
            const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
            expect(parsed).toHaveLength(MAX_RECENT_REACTIONS);
        });

        it('silently no-ops when setItem throws (e.g. quota exceeded)', () => {
            const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
            try {
                window.localStorage.setItem = () => {
                    throw new DOMException('quota exceeded', 'QuotaExceededError');
                };
                // Should not throw.
                expect(() => saveRecentReactions(['💯'])).not.toThrow();
            } finally {
                window.localStorage.setItem = originalSetItem;
            }
        });
    });

    describe('pushRecentReaction', () => {
        it('puts the emoji at the front of the list', () => {
            const result = pushRecentReaction(['👍', '❤️'], '💯');
            expect(result).toEqual(['💯', '👍', '❤️']);
        });

        it('moves an existing emoji to the front instead of duplicating', () => {
            const result = pushRecentReaction(['👍', '❤️', '💯'], '❤️');
            expect(result).toEqual(['❤️', '👍', '💯']);
        });

        it('clamps to MAX_RECENT_REACTIONS by default', () => {
            const full = Array.from({ length: MAX_RECENT_REACTIONS }, (_, i) => `e${i}`);
            const result = pushRecentReaction(full, '💯');
            expect(result).toHaveLength(MAX_RECENT_REACTIONS);
            expect(result[0]).toBe('💯');
            // Tail item dropped.
            expect(result).not.toContain(`e${MAX_RECENT_REACTIONS - 1}`);
        });

        it('honors a custom maxLength', () => {
            const result = pushRecentReaction(['👍', '❤️', '😂'], '💯', 2);
            expect(result).toEqual(['💯', '👍']);
        });

        it('treats a blank emoji as a no-op (returns a fresh copy)', () => {
            const input = ['👍', '❤️'];
            const result = pushRecentReaction(input, '   ');
            expect(result).toEqual(['👍', '❤️']);
            expect(result).not.toBe(input);
        });

        it('trims whitespace around the emoji before inserting', () => {
            const result = pushRecentReaction(['👍'], '  💯  ');
            expect(result).toEqual(['💯', '👍']);
        });
    });

    describe('load/save round trip', () => {
        it('preserves order through save → load', () => {
            const list = ['💯', '😎', '🚀', '🔥', '✨'];
            saveRecentReactions(list);
            expect(loadRecentReactions()).toEqual(list);
        });

        it('survives a load → push → save → load cycle', () => {
            saveRecentReactions(['👍', '❤️']);
            const after = pushRecentReaction(loadRecentReactions(), '💯');
            saveRecentReactions(after);
            expect(loadRecentReactions()).toEqual(['💯', '👍', '❤️']);
        });
    });
});
