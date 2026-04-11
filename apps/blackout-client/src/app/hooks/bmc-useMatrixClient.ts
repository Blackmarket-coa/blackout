import { useMatrixClient as useCanonicalMatrixClient } from './useMatrixClient';

/**
 * BMC compatibility wrapper for Matrix client access.
 *
 * Uses the canonical MatrixClient context provided by ClientRoot
 * instead of legacy auth atoms that are no longer hydrated.
 */
export const useMatrixClient = () => useCanonicalMatrixClient();
