import { useAtomValue } from 'jotai';
import { authStateAtom, matrixClientAtom } from '../state/bmc-auth';

/**
 * Returns authenticated Matrix client instance from Jotai state.
 * Throws when user is not logged in or client has not been initialized.
 */
export const useMatrixClient = () => {
    const authState = useAtomValue(authStateAtom);
    const client = useAtomValue(matrixClientAtom);

    if (authState !== 'logged_in' || !client) {
        throw new Error('Matrix client unavailable: user is not logged in.');
    }

    return client;
};
