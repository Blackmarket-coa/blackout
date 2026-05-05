import { createContext, useContext } from 'react';
import { useAtomValue } from 'jotai';
import type { MatrixClient } from 'matrix-js-sdk';
import { matrixClientAtom } from '../state/auth';

const MatrixClientContext = createContext<MatrixClient | null>(null);

export const MatrixClientProvider = MatrixClientContext.Provider;

export function useMatrixClient(): MatrixClient {
  const ctxClient = useContext(MatrixClientContext);
  const atomClient = useAtomValue(matrixClientAtom);
  const mx = ctxClient ?? atomClient;
  if (!mx) throw new Error('MatrixClient not initialized!');
  return mx;
}

export function useMatrixClientOrNull(): MatrixClient | null {
  const ctxClient = useContext(MatrixClientContext);
  const atomClient = useAtomValue(matrixClientAtom);
  return ctxClient ?? atomClient;
}
