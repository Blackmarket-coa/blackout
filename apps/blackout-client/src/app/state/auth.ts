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

/**
 * Chat panel only (launch-plan B3): why the panel's last session ended, so the
 * signed-out panel can say so. `session_ended`: the chosen length ran out.
 * `signed_out`: the homeserver no longer accepts the session (it ended there,
 * or the device was signed out elsewhere).
 */
export type PanelSignedOutReason = 'session_ended' | 'signed_out';
export const panelSignedOutReasonAtom = atom<PanelSignedOutReason | null>(null);
