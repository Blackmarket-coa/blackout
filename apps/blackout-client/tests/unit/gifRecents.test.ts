// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import {
    addGifRecent,
    GIF_RECENTS_MAX,
    GIF_RECENTS_STORAGE_KEY,
    readGifRecents,
} from '../../src/app/features/room/gifRecents';
import type { GifPickerItem } from '../../src/app/features/room/gifClient';

const item = (id: string, provider: GifPickerItem['provider'] = 'giphy'): GifPickerItem => ({
    id,
    description: `gif ${id}`,
    gif: { url: `https://media0.giphy.com/${id}/full.gif`, width: 2, height: 2 },
    preview: { url: `https://media0.giphy.com/${id}/small.gif`, width: 1, height: 1 },
    provider,
});

beforeEach(() => {
    localStorage.clear();
});

describe('gifRecents', () => {
    it('returns [] when nothing is stored', () => {
        expect(readGifRecents()).toEqual([]);
    });

    it('records recents newest-first and round-trips through storage', () => {
        addGifRecent(item('a'));
        addGifRecent(item('b'));
        expect(readGifRecents().map((r) => r.id)).toEqual(['b', 'a']);
    });

    it('dedupes by provider+id, moving a re-sent GIF to the front', () => {
        addGifRecent(item('a'));
        addGifRecent(item('b'));
        addGifRecent(item('a'));
        expect(readGifRecents().map((r) => r.id)).toEqual(['a', 'b']);
        // Same id under a different provider is a distinct entry.
        addGifRecent(item('a', 'tenor'));
        expect(readGifRecents().map((r) => `${r.provider}:${r.id}`)).toEqual([
            'tenor:a',
            'giphy:a',
            'giphy:b',
        ]);
    });

    it('caps the list at GIF_RECENTS_MAX', () => {
        for (let i = 0; i < GIF_RECENTS_MAX + 5; i += 1) {
            addGifRecent(item(`g${i}`));
        }
        const recents = readGifRecents();
        expect(recents).toHaveLength(GIF_RECENTS_MAX);
        expect(recents[0].id).toBe(`g${GIF_RECENTS_MAX + 4}`);
    });

    it('tolerates corrupt or mis-shaped stored payloads', () => {
        localStorage.setItem(GIF_RECENTS_STORAGE_KEY, 'not json {');
        expect(readGifRecents()).toEqual([]);

        localStorage.setItem(
            GIF_RECENTS_STORAGE_KEY,
            JSON.stringify([{ id: 'missing-fields' }, item('valid'), 42, null])
        );
        expect(readGifRecents().map((r) => r.id)).toEqual(['valid']);

        // Corrupt data must not break recording a new recent.
        localStorage.setItem(GIF_RECENTS_STORAGE_KEY, 'not json {');
        addGifRecent(item('fresh'));
        expect(readGifRecents().map((r) => r.id)).toEqual(['fresh']);
    });
});
