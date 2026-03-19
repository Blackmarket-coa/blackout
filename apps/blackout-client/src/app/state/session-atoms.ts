import { atom } from 'jotai';
import type { SessionSnapshot } from '../../client/session';

export const sessionAtom = atom<SessionSnapshot | null>(null);
