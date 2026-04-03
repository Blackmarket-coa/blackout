import { atom } from 'jotai';

export const inboxReadEventIdsAtom = atom<Record<string, boolean>>({});
export const inboxReadLoadedAtom = atom<boolean>(false);
