import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import type { InboxUserTriageState } from '../features/navigation/inboxTriage';
import { EMPTY_TRIAGE_STATE } from '../features/navigation/inboxTriage';

const inboxTriageStorage = createJSONStorage<Record<string, InboxUserTriageState>>(
    () => localStorage,
);

export const inboxTriageByUserAtom = atomWithStorage<Record<string, InboxUserTriageState>>(
    'blackout.inbox.triage.local.v1',
    {},
    inboxTriageStorage,
);

export const inboxReadLoadedAtom = atom(false);

export const inboxActiveUserIdAtom = atom<string | null>(null);

export const inboxActiveTriageAtom = atom(
    (get) => {
        const userId = get(inboxActiveUserIdAtom);
        const triageByUser = get(inboxTriageByUserAtom);
        if (!userId) return EMPTY_TRIAGE_STATE;
        return triageByUser[userId] ?? EMPTY_TRIAGE_STATE;
    },
    (
        get,
        set,
        update: InboxUserTriageState | ((prev: InboxUserTriageState) => InboxUserTriageState),
    ) => {
        const userId = get(inboxActiveUserIdAtom);
        if (!userId) return;
        const triageByUser = get(inboxTriageByUserAtom);
        const prev = triageByUser[userId] ?? EMPTY_TRIAGE_STATE;
        const next = typeof update === 'function' ? update(prev) : update;
        set(inboxTriageByUserAtom, {
            ...triageByUser,
            [userId]: next,
        });
    },
);
