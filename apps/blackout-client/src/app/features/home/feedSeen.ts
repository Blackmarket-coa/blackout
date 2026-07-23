import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { feedSeenKey, type UnifiedFeedItem } from './unifiedFeedModel';

/**
 * FIFO cap on remembered opened-item keys. Old entries aging out means a very
 * old item could resurface, which is harmless; an unbounded list in
 * localStorage is not.
 */
const MAX_SEEN_KEYS = 1000;

/** `feedSeenKey`s of feed items the viewer has opened, oldest first. */
export const seenFeedKeysAtom = atomWithStorage<string[]>('blackout.feed.seen.v1', []);

/** Read-side projection of the seen list for O(1) membership checks. */
export const seenFeedKeySetAtom = atom(
    (get) => new Set(get(seenFeedKeysAtom)) as ReadonlySet<string>
);

/**
 * Record that the viewer opened a feed item. Dens are skipped: their
 * visibility is driven by the room's unread count, not by opens.
 */
export const markFeedItemOpenedAtom = atom(null, (get, set, item: UnifiedFeedItem) => {
    if (item.source === 'den') return;
    const key = feedSeenKey(item);
    const current = get(seenFeedKeysAtom);
    if (current.includes(key)) return;
    const next = [...current, key];
    set(seenFeedKeysAtom, next.length > MAX_SEEN_KEYS ? next.slice(-MAX_SEEN_KEYS) : next);
});
