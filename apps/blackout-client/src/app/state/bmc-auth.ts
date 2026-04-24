import { atom } from 'jotai';
import type { MatrixClient } from 'matrix-js-sdk';

export type AuthState =
    | 'loading'
    | 'logged_out'
    | 'logged_in'
    | 'crypto_initializing'
    | 'crypto_failed';

export const matrixClientAtom = atom<MatrixClient | null>(null);
export const authStateAtom = atom<AuthState>('loading');
export const userIdAtom = atom<string | null>(null);
export const cryptoInitErrorAtom = atom<string | null>(null);
export const loginErrorAtom = atom<string | null>(null);
