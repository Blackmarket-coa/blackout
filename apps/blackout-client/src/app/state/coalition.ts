import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
    COALITION_TABS,
    SPATIAL_LAYER_KEYS,
    normalizeSpatialLayerKeys,
    type CoalitionTabId,
    type SpatialLayerKey,
    DEFAULT_COALITION_TAB,
} from '@blackout/core';

export const coalitionTabAtom = atomWithStorage<CoalitionTabId>(
    'bmc-coalition-tab',
    DEFAULT_COALITION_TAB
);

export interface CoalitionScope {
    kind: 'standalone' | 'canopy' | 'den';
    canopyId?: string;
    denId?: string;
}

export const coalitionScopeAtom = atom<CoalitionScope>({ kind: 'standalone' });

export const COALITION_TAB_LABELS: Record<CoalitionTabId, string> = {
    map: 'Map',
    chat: 'Chat',
    events: 'Events',
    rings: 'Rings',
    shop: 'Shop',
    tasks: 'Tasks',
    needs: 'Needs',
    projects: 'Projects',
    resources: 'Resources',
    kits: 'Kits',
    documents: 'Documents',
    ai: 'AI',
};

/**
 * Short plain-text hints per tab, rendered as button tooltips in the tab
 * strip. Fuller explainers live in `coalitionTabGuides.tsx`; keep the two in
 * sync when a tab's purpose changes.
 */
export const COALITION_TAB_HINTS: Record<CoalitionTabId, string> = {
    map: 'Nearby stories, events, mutual aid, and vendors on one map',
    chat: 'Live conversation for this den',
    events: 'Gatherings with RSVPs, volunteer slots, and ride-shares',
    rings: 'Your trusted circles, crews, and guilds',
    shop: 'The black market — local listings and vendors',
    tasks: 'Shared to-do → doing → done board',
    needs: 'What this coalition is looking for',
    projects: 'Concrete initiatives the coalition is building',
    resources: 'Shared gear and spaces the coalition offers',
    kits: 'Ready-made bundles of tabs and tools',
    documents: 'Shared files and pinned references',
    ai: 'AI helpers for this den',
};

// `ai` is excluded from the default order; it surfaces only for AI-type dens,
// appended by CoalitionView.
export const COALITION_TAB_ORDER: CoalitionTabId[] = [...COALITION_TABS].filter(
    (tab) => tab !== 'ai'
);

// --- map controls ---
//
// The legend's switches used to be component state, so hiding a layer lasted
// until you navigated away. Someone who only cares about mutual aid had to turn
// the other fourteen off on every visit. These persist, like the tab choice
// above.

/*
 * `getOnInit` reads storage as the atom is created, instead of on first mount.
 *
 * That matters here specifically: without it the first render returns the
 * default — every layer on — and only corrects once the atom mounts. Since the
 * layer set now gates the fetches, that flash would fire a request for every
 * layer the user had hidden, which is the exact cost this change removes.
 */
const GET_ON_INIT = { getOnInit: true } as const;

const storedMapLayersAtom = atomWithStorage<string[]>(
    'bmc-coalition-map-layers',
    [...SPATIAL_LAYER_KEYS],
    undefined,
    GET_ON_INIT
);

/**
 * Which map layers are visible.
 *
 * Read through `normalizeSpatialLayerKeys`, so a key retired since it was
 * written is dropped rather than resurrecting a layer that no longer exists.
 * An empty set is respected — "I hid everything" is a real choice, and forcing
 * layers back on would override the user. Only a *corrupt* value (not an array)
 * falls back to the default.
 */
export const coalitionMapLayersAtom = atom(
    (get): ReadonlySet<SpatialLayerKey> => {
        const stored = get(storedMapLayersAtom);
        if (!Array.isArray(stored)) return new Set(SPATIAL_LAYER_KEYS);
        return new Set(normalizeSpatialLayerKeys(stored));
    },
    (_get, set, next: ReadonlySet<SpatialLayerKey>) => set(storedMapLayersAtom, [...next])
);

export const COALITION_MAP_TIME_MODES = ['now', 'today', 'week', 'all'] as const;
export type CoalitionMapTimeMode = typeof COALITION_MAP_TIME_MODES[number];

const storedMapTimeModeAtom = atomWithStorage<string>(
    'bmc-coalition-map-time',
    'all',
    undefined,
    GET_ON_INIT
);

/** The time window. Falls back to `all` rather than trusting a stored string. */
export const coalitionMapTimeModeAtom = atom(
    (get): CoalitionMapTimeMode => {
        const stored = get(storedMapTimeModeAtom);
        return (COALITION_MAP_TIME_MODES as readonly string[]).includes(stored)
            ? (stored as CoalitionMapTimeMode)
            : 'all';
    },
    (_get, set, next: CoalitionMapTimeMode) => set(storedMapTimeModeAtom, next)
);

export const coalitionMapHeatAtom = atomWithStorage<boolean>(
    'bmc-coalition-map-heat',
    false,
    undefined,
    GET_ON_INIT
);

const storedMapRadiusKmAtom = atomWithStorage<number>(
    'bmc-coalition-map-radius-km',
    5,
    undefined,
    GET_ON_INIT
);

/**
 * The near-me radius. Guarded because a corrupt or negative value would make
 * the filter silently match nothing, which reads as "there is nothing near me".
 */
export const coalitionMapRadiusKmAtom = atom(
    (get): number => {
        const stored = get(storedMapRadiusKmAtom);
        return typeof stored === 'number' && Number.isFinite(stored) && stored > 0 ? stored : 5;
    },
    (_get, set, next: number) => set(storedMapRadiusKmAtom, next)
);
