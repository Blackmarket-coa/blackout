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
    knowledge: 'Knowledge',
};

/**
 * Short plain-text hints per tab, rendered as button tooltips in the tab
 * strip. Fuller explainers live in `coliseumTabGuides.tsx`; keep the two in
 * sync when a tab's purpose changes.
 */
export const COLISEUM_TAB_HINTS: Record<ColiseumTabId, string> = {
    reel: 'A vertical feed of the strongest arguments',
    arena: 'Callouts and 1v1 matches — every fight ends in a verdict and a Brief',
    match: 'The match you are watching',
    shouts: 'Raw video takes — a back-and-forth can graduate into a match',
    topics: 'Debates anchored to news stories',
    debate: 'Vote on arguments and fire back with rebuttals',
    live: 'Real-time town halls',
    challenges: 'Community challenges — enter your attempt and vote on others',
    leaderboards: 'Who is leading across the ecosystem',
    sources: 'Curated news to cite in your arguments',
    knowledge: 'The searchable archive of settled debates and verdicts',
};

export const COLISEUM_TAB_ORDER: ColiseumTabId[] = [...COLISEUM_TABS];
