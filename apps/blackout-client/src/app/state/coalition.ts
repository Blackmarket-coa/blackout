import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { COALITION_TABS, type CoalitionTabId, DEFAULT_COALITION_TAB } from '@blackout/core';

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
