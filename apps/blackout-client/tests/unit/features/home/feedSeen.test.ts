// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import {
    markFeedItemOpenedAtom,
    seenFeedKeySetAtom,
    seenFeedKeysAtom,
} from '../../../../src/app/features/home/feedSeen';
import type { UnifiedFeedItem } from '../../../../src/app/features/home/unifiedFeedModel';

const base = {
    title: 't',
    subtitle: 's',
    canopyId: null,
    denId: null,
    timestamp: null,
    score: 0.5,
    href: '/x',
    tags: [] as string[],
};

const wallItem = (id: string): UnifiedFeedItem => ({
    ...base,
    id: `wall:${id}`,
    source: 'wall',
    authorId: '@a:s',
});

const denItem: UnifiedFeedItem = {
    ...base,
    id: 'den:!d:s',
    source: 'den',
    denId: '!d:s',
    unreadCount: 2,
};

describe('markFeedItemOpenedAtom', () => {
    it('records opened items once and exposes them as a set', () => {
        const store = createStore();
        store.set(markFeedItemOpenedAtom, wallItem('p1'));
        store.set(markFeedItemOpenedAtom, wallItem('p1'));
        store.set(markFeedItemOpenedAtom, wallItem('p2'));

        expect(store.get(seenFeedKeysAtom)).toEqual(['wall:p1', 'wall:p2']);
        expect(store.get(seenFeedKeySetAtom).has('wall:p1')).toBe(true);
    });

    it('ignores dens — their visibility is unread-driven, not open-driven', () => {
        const store = createStore();
        store.set(markFeedItemOpenedAtom, denItem);
        expect(store.get(seenFeedKeysAtom)).toEqual([]);
    });

    it('caps the stored list, dropping the oldest keys first', () => {
        const store = createStore();
        for (let i = 0; i < 1005; i += 1) {
            store.set(markFeedItemOpenedAtom, wallItem(`p${i}`));
        }
        const keys = store.get(seenFeedKeysAtom);
        expect(keys).toHaveLength(1000);
        expect(keys[0]).toBe('wall:p5');
        expect(keys[keys.length - 1]).toBe('wall:p1004');
    });
});
