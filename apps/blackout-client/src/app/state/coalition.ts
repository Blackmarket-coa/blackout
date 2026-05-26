import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { COALITION_TABS, type CoalitionTabId, DEFAULT_COALITION_TAB } from '@blackout/core';

export const coalitionTabAtom = atomWithStorage<CoalitionTabId>(
    'bmc-coalition-tab',
    DEFAULT_COALITION_TAB,
);

export interface CoalitionScope {
    kind: 'standalone' | 'canopy' | 'den';
    canopyId?: string;
    denId?: string;
}

export const coalitionScopeAtom = atom<CoalitionScope>({ kind: 'standalone' });

export const COALITION_TAB_LABELS: Record<CoalitionTabId, string> = {
    chat: 'Chat',
    video: 'For You',
    map: 'Local',
    events: 'Events',
    shop: 'Shop',
    tasks: 'Tasks',
    documents: 'Documents',
    ai: 'AI',
};

// `ai` is excluded from the default order; it surfaces only for AI-type dens,
// appended by CoalitionView.
export const COALITION_TAB_ORDER: CoalitionTabId[] = [...COALITION_TABS].filter(
    (tab) => tab !== 'ai',
);
