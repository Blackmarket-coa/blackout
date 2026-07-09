import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { COLISEUM_TABS, type ColiseumTabId, DEFAULT_COLISEUM_TAB } from '@blackout/core';

export const coliseumTabAtom = atomWithStorage<ColiseumTabId>(
    'bmc-coliseum-tab',
    DEFAULT_COLISEUM_TAB
);

export interface ColiseumScope {
    kind: 'standalone' | 'canopy' | 'den';
    canopyId?: string;
    denId?: string;
}

export const coliseumScopeAtom = atom<ColiseumScope>({ kind: 'standalone' });

export const selectedColiseumTopicIdAtom = atomWithStorage<string | null>(
    'bmc-coliseum-topic',
    null
);

/** The id of the currently-open match, surfaced in the Match tab. */
export const selectedColiseumMatchIdAtom = atomWithStorage<string | null>(
    'bmc-coliseum-match',
    null
);

/**
 * Where the debate drill-in's back button returns to. Set by whichever surface
 * navigates into the debate (topics feed, reel comments, …); session-scoped on
 * purpose — a reload lands back on the default.
 */
export const coliseumReturnTabAtom = atom<ColiseumTabId>('topics');

/** Reel starts muted (autoplay policy); the user's unmute choice persists. */
export const coliseumReelMutedAtom = atomWithStorage<boolean>('bmc-coliseum-reel-muted', true);

export const COLISEUM_TAB_LABELS: Record<ColiseumTabId, string> = {
    reel: 'For You',
    arena: 'Arena',
    match: 'Match',
    shouts: 'Shouts',
    topics: 'Topics',
    debate: 'Debate',
    live: 'Live',
    challenges: 'Challenges',
    leaderboards: 'Leaderboards',
    sources: 'Sources',
};

export const COLISEUM_TAB_ORDER: ColiseumTabId[] = [...COLISEUM_TABS];
