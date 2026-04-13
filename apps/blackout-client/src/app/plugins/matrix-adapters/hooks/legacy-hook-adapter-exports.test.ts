import { describe, expect, it } from 'vitest';
import { useMatrixClient } from '../../../../hooks/bmc-useMatrixClient';
import { useLegacyMatrixClientAdapter } from './useLegacyMatrixClientAdapter';

describe('legacy hook wrappers', () => {
    it('route legacy matrix client hook through plugin adapter boundary', () => {
        expect(useMatrixClient).toBe(useLegacyMatrixClientAdapter);
    });
});
