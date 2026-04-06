import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    CryptoInitError,
    getCryptoInitState,
    initCrypto,
    isCryptoReady,
    resetCryptoInitForTests,
    setCryptoBootstrapForTests,
} from '../../../src/client/crypto';

afterEach(() => {
    resetCryptoInitForTests();
    vi.restoreAllMocks();
});

describe('initCrypto', () => {
    it('initializes once and is idempotent on re-entry', async () => {
        const bootstrap = vi.fn(async () => {
            await Promise.resolve();
        });
        setCryptoBootstrapForTests(bootstrap);

        await Promise.all([initCrypto(), initCrypto()]);
        await initCrypto();

        expect(bootstrap).toHaveBeenCalledTimes(1);
        expect(getCryptoInitState()).toBe('ready');
        expect(isCryptoReady()).toBe(true);
    });

    it('resets in-flight state after failures and allows retry', async () => {
        const bootstrap = vi
            .fn<() => Promise<void>>()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(undefined);

        setCryptoBootstrapForTests(bootstrap);

        await expect(initCrypto()).rejects.toBeInstanceOf(CryptoInitError);
        expect(getCryptoInitState()).toBe('failed');

        await expect(initCrypto()).resolves.toBeUndefined();
        expect(getCryptoInitState()).toBe('ready');
        expect(isCryptoReady()).toBe(true);
        expect(bootstrap).toHaveBeenCalledTimes(2);
    });

    it('propagates typed crypto errors unchanged', async () => {
        const failure = new CryptoInitError('missing_webcrypto', 'WebCrypto missing');
        setCryptoBootstrapForTests(() => Promise.reject(failure));

        await expect(initCrypto()).rejects.toBe(failure);
    });
});
