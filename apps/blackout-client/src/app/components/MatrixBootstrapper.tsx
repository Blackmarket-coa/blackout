import { useEffect } from 'react';
import { useStore } from 'jotai';
import { authStateAtom } from '../state/auth';
import { initMatrixFromStoredSession } from '../../client/initMatrix';
import { initCrypto } from '../../client/crypto';

export const MatrixBootstrapper = () => {
  const store = useStore();

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        await initCrypto();
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
