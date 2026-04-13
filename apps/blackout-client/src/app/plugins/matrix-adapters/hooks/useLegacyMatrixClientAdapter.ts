import { useMatrixClient as useCanonicalMatrixClient } from '../../../hooks/useMatrixClient';

export const useLegacyMatrixClientAdapter = () => useCanonicalMatrixClient();
