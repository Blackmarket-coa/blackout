// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredSession } from '../../../src/client/sessionManager';

// Controls what each POST /v1/auth/matrix/exchange attempt does. Tests swap
// the implementation; the counter tracks how many exchanges hit the "wire".
let exchangeImpl: () => Promise<unknown> = () => Promise.reject(new Error('unconfigured'));
const exchangeCalls = vi.fn();

vi.mock('@blackout/sdk', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@blackout/sdk')>();
    return {
        ...actual,
        createFetchApiClient: () => async () => {
            exchangeCalls();
            return exchangeImpl();
        },
    };
});

import {
    BLACKOUT_API_TOKEN_KEY,
    clearBlackoutApiToken,
    ensureBlackoutApiToken,
    resetExchangeFailureCooldownForTests,
} from '../../../src/client/blackoutApiSession';

const session = (accessToken: string): StoredSession => ({
    baseUrl: 'https://matrix.example.org',
    accessToken,
    userId: '@user:example.org',
    deviceId: 'DEVICE',
});

const failure = () =>
    Promise.reject(new Error('Request failed (401) for /v1/auth/matrix/exchange'));
const success = () => Promise.resolve({ token: 'minted-jwt', userId: 'u1' });

describe('ensureBlackoutApiToken exchange-failure cooldown', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetExchangeFailureCooldownForTests();
        exchangeCalls.mockClear();
        exchangeImpl = failure;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-08T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('suppresses repeat exchanges for the same token while cooling down', async () => {
        await expect(ensureBlackoutApiToken(session('dead-token'))).resolves.toBeNull();
        expect(exchangeCalls).toHaveBeenCalledTimes(1);

        // The next caller (e.g. another /v1 feature mounting) must not re-fire.
        await expect(ensureBlackoutApiToken(session('dead-token'))).resolves.toBeNull();
        expect(exchangeCalls).toHaveBeenCalledTimes(1);
    });

    it('retries once the cooldown has elapsed', async () => {
        await ensureBlackoutApiToken(session('dead-token'));
        expect(exchangeCalls).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date('2026-07-08T12:00:31Z'));
        exchangeImpl = success;
        await expect(ensureBlackoutApiToken(session('dead-token'))).resolves.toBe('minted-jwt');
        expect(exchangeCalls).toHaveBeenCalledTimes(2);
    });

    it('a different access token (re-login) bypasses the cooldown', async () => {
        await ensureBlackoutApiToken(session('dead-token'));
        expect(exchangeCalls).toHaveBeenCalledTimes(1);

        exchangeImpl = success;
        await expect(ensureBlackoutApiToken(session('fresh-token'))).resolves.toBe('minted-jwt');
        expect(exchangeCalls).toHaveBeenCalledTimes(2);
    });

    it('clearBlackoutApiToken does NOT reset the cooldown (the 401-retry path calls it)', async () => {
        await ensureBlackoutApiToken(session('dead-token'));
        expect(exchangeCalls).toHaveBeenCalledTimes(1);

        // createAuthorizedApiClient reacts to an unauthenticated 401 by
        // clearing the token and asking again — that must stay a no-op here.
        clearBlackoutApiToken();
        await expect(ensureBlackoutApiToken(session('dead-token'))).resolves.toBeNull();
        expect(exchangeCalls).toHaveBeenCalledTimes(1);
    });

    it('a successful exchange clears the failure marker', async () => {
        await ensureBlackoutApiToken(session('flaky-token'));
        expect(exchangeCalls).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date('2026-07-08T12:01:00Z'));
        exchangeImpl = success;
        await expect(ensureBlackoutApiToken(session('flaky-token'))).resolves.toBe('minted-jwt');
        expect(window.localStorage.getItem(BLACKOUT_API_TOKEN_KEY)).toBe('minted-jwt');

        // The minted test JWT is unparseable, so it reads as expired and the
        // next call re-exchanges — immediately, because success cleared the
        // marker (no 30s wait).
        exchangeImpl = failure;
        await expect(ensureBlackoutApiToken(session('flaky-token'))).resolves.toBeNull();
        expect(exchangeCalls).toHaveBeenCalledTimes(3);
    });
});
