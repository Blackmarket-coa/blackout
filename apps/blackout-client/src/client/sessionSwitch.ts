import { createStore } from 'jotai/vanilla';
import { matrixClientAtom } from '../app/state/auth';
import { initMatrixFromStoredSession, stopMatrixClient } from './initMatrix';
import { getSessionForUser, setActiveSessionUser } from './sessionManager';
import { clearBlackoutApiToken } from './blackoutApiSession';
import type { MatrixClient } from 'matrix-js-sdk';

type AtomStore = ReturnType<typeof createStore>;

/**
 * Switch the active session to another already-stored account WITHOUT logging
 * out. Stops the current client (keeping its stores + session intact so we can
 * switch back), flips the active session, drops the stale API token, and
 * re-initialises the client for the newly-active session. This is the
 * mechanism behind burner-identity "switch-to": the whole app runs as one
 * identity at a time, but no session is destroyed.
 *
 * Throws MatrixInitError if the target session is missing or re-init fails.
 */
export const switchToSession = async (
    store: AtomStore,
    userId: string
): Promise<MatrixClient | null> => {
    if (!getSessionForUser(userId)) {
        throw new Error(`No stored session for ${userId}`);
    }
    stopMatrixClient(store.get(matrixClientAtom));
    clearBlackoutApiToken();
    setActiveSessionUser(userId);
    return initMatrixFromStoredSession(store);
};

/** Switch back from a burner to the remembered primary account. */
export const switchBackToPrimary = (
    store: AtomStore,
    primaryUserId: string
): Promise<MatrixClient | null> => switchToSession(store, primaryUserId);
