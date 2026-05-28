import { describe, expect, it } from 'vitest';
import {
    type KeyValueStore,
    listMatchingKeys,
    wipeSensitiveTraces,
} from '../../../../src/app/features/panic/localTraces';

/** Minimal Map-backed KeyValueStore for testing. */
const makeStore = (entries: Record<string, string>): KeyValueStore & { snapshot(): string[] } => {
    const map = new Map(Object.entries(entries));
    return {
        get length() {
            return map.size;
        },
        key(index: number) {
            return [...map.keys()][index] ?? null;
        },
        removeItem(k: string) {
            map.delete(k);
        },
        snapshot() {
            return [...map.keys()];
        },
    };
};

const baseEntries = {
    'blackout.draft.!room1:hs': 'secret draft',
    'blackout.burners.v1': '[...]',
    'blackout.burner.primary.v1': '@me:hs',
    'blackout.settings.steganography.v1': 'passphrases',
    'blackout.settings.data-deletion.v1': 'pii',
    'blackout.ephemeral.views.v1': '{}',
    'blackout.timeline.scroll.v1': '{}',
    'blackout.matrix.sessions.v1': 'session',
    'blackout.api.token': 'jwt',
    // Non-sensitive keys that must survive:
    'blackout.settings.appearance.v1': 'theme',
    'unrelated.key': 'keep',
};

describe('listMatchingKeys', () => {
    it('matches only keys with a listed prefix', () => {
        const store = makeStore({ 'a.x': '1', 'b.y': '2', 'a.z': '3' });
        expect(listMatchingKeys(store, ['a.']).sort()).toEqual(['a.x', 'a.z']);
    });
});

describe('wipeSensitiveTraces', () => {
    it('clears sensitive traces but keeps the session and unrelated keys by default', () => {
        const store = makeStore(baseEntries);
        const removed = wipeSensitiveTraces(store);

        expect(removed).toContain('blackout.draft.!room1:hs');
        expect(removed).toContain('blackout.settings.steganography.v1');
        expect(removed).toContain('blackout.settings.data-deletion.v1');

        const left = store.snapshot();
        // session + appearance + unrelated survive
        expect(left).toContain('blackout.matrix.sessions.v1');
        expect(left).toContain('blackout.api.token');
        expect(left).toContain('blackout.settings.appearance.v1');
        expect(left).toContain('unrelated.key');
        // sensitive ones gone
        expect(left).not.toContain('blackout.draft.!room1:hs');
        expect(left).not.toContain('blackout.burners.v1');
    });

    it('also clears the session when includeSession is set', () => {
        const store = makeStore(baseEntries);
        const removed = wipeSensitiveTraces(store, { includeSession: true });

        expect(removed).toContain('blackout.matrix.sessions.v1');
        expect(removed).toContain('blackout.api.token');

        const left = store.snapshot();
        expect(left).not.toContain('blackout.matrix.sessions.v1');
        expect(left).not.toContain('blackout.api.token');
        // unrelated still survives
        expect(left).toContain('unrelated.key');
        expect(left).toContain('blackout.settings.appearance.v1');
    });

    it('is a no-op return when nothing matches', () => {
        const store = makeStore({ 'unrelated.key': 'keep' });
        expect(wipeSensitiveTraces(store)).toEqual([]);
        expect(store.snapshot()).toEqual(['unrelated.key']);
    });
});
