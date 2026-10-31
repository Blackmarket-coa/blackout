import { afterEach, describe, expect, it } from 'vitest';
import {
    getKemProvider,
    mlKem768Provider,
    NULL_KEM_PROVIDER,
    setKemProvider,
} from '@blackout/protocol';
import { installReleaseKemProvider } from '../../../../src/app/features/release-keys/kemProvider';

describe('installReleaseKemProvider', () => {
    afterEach(() => setKemProvider(NULL_KEM_PROVIDER));

    it('replaces the default provider, which throws, with ML-KEM-768', async () => {
        expect(getKemProvider()).toBe(NULL_KEM_PROVIDER);
        await expect(getKemProvider().generateKeyPair()).rejects.toThrow(/not configured/);
        installReleaseKemProvider();
        expect(getKemProvider()).toBe(mlKem768Provider);
        const { publicKey } = await getKemProvider().generateKeyPair();
        expect(publicKey).toHaveLength(1184);
    });

    it('is what the app calls at startup', async () => {
        const { readFileSync } = await import('node:fs');
        const main = readFileSync(new URL('../../../../src/main.tsx', import.meta.url), 'utf8');
        expect(main).toMatch(/^installReleaseKemProvider\(\);$/m);
    });
});
