import { useEffect } from 'react';
import { useStore } from 'jotai';
import { authStateAtom } from '../state/auth';
import { initMatrixFromStoredSession } from '../../client/initMatrix';

export const MatrixBootstrapper = () => {
  const store = useStore();

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
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
