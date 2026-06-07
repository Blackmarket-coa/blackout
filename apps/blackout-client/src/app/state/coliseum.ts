import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { COLISEUM_TABS, type ColiseumTabId, DEFAULT_COLISEUM_TAB } from '@blackout/core';

export const coliseumTabAtom = atomWithStorage<ColiseumTabId>(
    'bmc-coliseum-tab',
    DEFAULT_COLISEUM_TAB,
);

export interface ColiseumScope {
    kind: 'standalone' | 'canopy' | 'den';
    canopyId?: string;
    denId?: string;
}

export const coliseumScopeAtom = atom<ColiseumScope>({ kind: 'standalone' });

export const selectedColiseumTopicIdAtom = atomWithStorage<string | null>(
    'bmc-coliseum-topic',
    null,
);

export const COLISEUM_TAB_LABELS: Record<ColiseumTabId, string> = {
    topics: 'Topics',
    debate: 'Debate',
    reel: 'Reel',
    live: 'Live',
    challenges: 'Challenges',
    leaderboards: 'Leaderboards',
    sources: 'Sources',
};

export const COLISEUM_TAB_ORDER: ColiseumTabId[] = [...COLISEUM_TABS];
