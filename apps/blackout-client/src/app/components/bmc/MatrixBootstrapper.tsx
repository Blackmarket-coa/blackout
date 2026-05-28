import { useEffect } from 'react';
import { useStore } from 'jotai';
import { authStateAtom, cryptoInitErrorAtom } from '../../state/auth';
import { initMatrixFromStoredSession } from '../../../client/initMatrix';
import { initSessionManager } from '../../../client/sessionManager';
import { CryptoInitError, initCrypto } from '../../../client/crypto';

export const MatrixBootstrapper = () => {
    const store = useStore();

    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            store.set(authStateAtom, 'crypto_initializing');
            store.set(cryptoInitErrorAtom, null);

            try {
                await initCrypto();
            } catch (error) {
                if (!cancelled) {
                    const message =
                        error instanceof CryptoInitError
                            ? error.message
                            : 'Unable to initialize secure crypto features.';
                    store.set(cryptoInitErrorAtom, message);
                    store.set(authStateAtom, 'crypto_failed');
                }
                return;
            }

            try {
                await initSessionManager();
                await initMatrixFromStoredSession(store);
            } catch {
                if (!cancelled) {
                    store.set(authStateAtom, 'logged_out');
                }
            }
        };

        void boot();

        return () => {
            cancelled = true;
        };
    }, [store]);

    return null;
};
