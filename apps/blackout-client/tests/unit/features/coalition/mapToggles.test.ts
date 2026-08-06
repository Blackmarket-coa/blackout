// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';
import { SPATIAL_LAYER_KEYS, type SpatialLayerKey } from '@blackout/core';

/**
 * The legend's switches were component state, so hiding a layer lasted until
 * you navigated away — someone who only cares about mutual aid had to turn the
 * other fourteen off on every visit. These pin the persistence and, just as
 * importantly, the guards that keep a stale or corrupt stored value from
 * leaving the map blank.
 */

const LAYERS_KEY = 'bmc-coalition-map-layers';
const TIME_KEY = 'bmc-coalition-map-time';
const RADIUS_KEY = 'bmc-coalition-map-radius-km';

type CoalitionState = typeof import('../../../../src/app/state/coalition');

/**
 * These atoms are declared `getOnInit`, so they read storage as they are
 * created — at module evaluation. That is deliberate: without it the first
 * render would hand back the all-layers default and fire a fetch for every
 * layer the user had hidden. It does mean a test has to seed storage *before*
 * importing the module, hence the reset-and-reimport.
 */
const loadWith = async (entries: Record<string, string> = {}): Promise<CoalitionState> => {
    localStorage.clear();
    for (const [key, raw] of Object.entries(entries)) localStorage.setItem(key, raw);
    vi.resetModules();
    return import('../../../../src/app/state/coalition');
};

beforeEach(() => {
    localStorage.clear();
});

describe('map layer visibility persists', () => {
    it('starts with every layer on', async () => {
        const { coalitionMapLayersAtom } = await loadWith();
        const store = createStore();
        expect(store.get(coalitionMapLayersAtom).size).toBe(SPATIAL_LAYER_KEYS.length);
    });

    it('writes a hidden layer through to storage', async () => {
        const { coalitionMapLayersAtom } = await loadWith();
        const store = createStore();
        const next = new Set(store.get(coalitionMapLayersAtom));
        next.delete('aid');
        store.set(coalitionMapLayersAtom, next);

        expect(store.get(coalitionMapLayersAtom).has('aid')).toBe(false);
        expect(JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '[]')).not.toContain('aid');
    });

    it('restores the stored selection rather than defaulting to all-on', async () => {
        const { coalitionMapLayersAtom } = await loadWith({
            [LAYERS_KEY]: JSON.stringify(['aid', 'events']),
        });
        expect([...createStore().get(coalitionMapLayersAtom)].sort()).toEqual(['aid', 'events']);
    });

    /**
     * "I hid everything" is a real choice. Treating an empty set as corrupt and
     * switching every layer back on would silently override the user.
     */
    it('respects an empty selection', async () => {
        const { coalitionMapLayersAtom } = await loadWith({
            [LAYERS_KEY]: JSON.stringify([]),
        });
        expect(createStore().get(coalitionMapLayersAtom).size).toBe(0);
    });

    it('drops a layer key that no longer exists', async () => {
        const { coalitionMapLayersAtom } = await loadWith({
            [LAYERS_KEY]: JSON.stringify(['aid', 'retired-layer']),
        });
        expect([...createStore().get(coalitionMapLayersAtom)]).toEqual(['aid']);
    });

    it('falls back to all-on when the stored value is not a list', async () => {
        // A blank map with no explanation reads as broken, so a corrupt value
        // is the one case that resets.
        const { coalitionMapLayersAtom } = await loadWith({
            [LAYERS_KEY]: JSON.stringify({ aid: true }),
        });
        expect(createStore().get(coalitionMapLayersAtom).size).toBe(SPATIAL_LAYER_KEYS.length);
    });

    it('round-trips every real layer key', async () => {
        const { coalitionMapLayersAtom } = await loadWith();
        const store = createStore();
        store.set(coalitionMapLayersAtom, new Set<SpatialLayerKey>(SPATIAL_LAYER_KEYS));
        expect([...store.get(coalitionMapLayersAtom)].sort()).toEqual(
            [...SPATIAL_LAYER_KEYS].sort()
        );
    });
});

describe('the other map controls persist too', () => {
    it('keeps the time window', async () => {
        const { coalitionMapTimeModeAtom } = await loadWith();
        const store = createStore();
        store.set(coalitionMapTimeModeAtom, 'week');
        expect(store.get(coalitionMapTimeModeAtom)).toBe('week');
        expect(JSON.parse(localStorage.getItem(TIME_KEY) ?? '""')).toBe('week');
    });

    it('ignores a stored time window it does not recognise', async () => {
        const { coalitionMapTimeModeAtom } = await loadWith({
            [TIME_KEY]: JSON.stringify('last-tuesday'),
        });
        expect(createStore().get(coalitionMapTimeModeAtom)).toBe('all');
    });

    it('keeps the heat overlay off by default and remembers it on', async () => {
        const { coalitionMapHeatAtom } = await loadWith();
        const store = createStore();
        expect(store.get(coalitionMapHeatAtom)).toBe(false);
        store.set(coalitionMapHeatAtom, true);
        expect(store.get(coalitionMapHeatAtom)).toBe(true);
    });

    it('keeps the near-me radius', async () => {
        const { coalitionMapRadiusKmAtom } = await loadWith();
        const store = createStore();
        store.set(coalitionMapRadiusKmAtom, 25);
        expect(store.get(coalitionMapRadiusKmAtom)).toBe(25);
    });

    /**
     * A zero or negative radius matches nothing, which the user would read as
     * "there is nothing near me" rather than "this setting is broken".
     */
    it.each([0, -5, Number.NaN])('rejects a nonsense stored radius (%s)', async (bad) => {
        const { coalitionMapRadiusKmAtom } = await loadWith({
            [RADIUS_KEY]: JSON.stringify(bad),
        });
        expect(createStore().get(coalitionMapRadiusKmAtom)).toBe(5);
    });
});
