import { useLegacyMatrixClientAdapter } from '../plugins/matrix-adapters/hooks/useLegacyMatrixClientAdapter';

/**
 * @deprecated Temporary bridge to preserve legacy imports.
 * Scheduled for deletion in PR-6 after feature/plugin migration completes.
 */
export const useMatrixClient = () => useLegacyMatrixClientAdapter();
