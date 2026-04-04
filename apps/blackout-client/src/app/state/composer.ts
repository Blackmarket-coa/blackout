import { atom } from 'jotai';

export interface ComposerCommandPayload {
  nonce: number;
  roomId: string | null;
  text: string;
}

export const composerCommandPayloadAtom = atom<ComposerCommandPayload | null>(null);

export const composerCommandStatusAtom = atom<string | null>(null);
