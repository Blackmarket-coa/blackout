import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ensureBlackoutApiToken = vi.fn<[], Promise<string | null>>();
const clearBlackoutApiToken = vi.fn();

vi.mock('../../../src/client/blackoutApiSession', () => ({
    ensureBlackoutApiToken: () => ensureBlackoutApiToken(),
    clearBlackoutApiToken: () => clearBlackoutApiToken(),
    BLACKOUT_API_TOKEN_KEY: 'blackout.api.token',
}));

// Mock the SDK's fetch client so we control per-request behavior by the bearer
// token baked into each built client. Keep everything else (BlackoutSdkError,
// queries, media) real.
const requestCalls: Array<string | undefined> = [];
vi.mock('@blackout/sdk', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@blackout/sdk')>();
    return {
        ...actual,
        createFetchApiClient: (opts: { defaultHeaders?: Record<string, string> }) => {
            const auth = opts.defaultHeaders?.authorization;
            return async () => {
                requestCalls.push(auth);
                if (auth === 'Bearer good') return { ok: true };
                throw new actual.BlackoutSdkError(
                    'HTTP_REQUEST_FAILED',
                    'Request failed (401) for /v1/x',
                    'fatal',
                    401,
                );
            };
        },
    };
});

import { createAuthorizedApiClient } from '../../../src/app/sdk/client';

const req = { method: 'GET' as const, path: '/v1/x' };

describe('createAuthorizedApiClient', () => {
    beforeEach(() => {
        requestCalls.length = 0;
        ensureBlackoutApiToken.mockReset();
        clearBlackoutApiToken.mockReset();
    });
    afterEach(() => vi.restoreAllMocks());

    it('resolves a token via ensureBlackoutApiToken when none is supplied (closes the boot race)', async () => {
        ensureBlackoutApiToken.mockResolvedValue('good');

        await expect(createAuthorizedApiClient(null)(req)).resolves.toEqual({ ok: true });
        expect(ensureBlackoutApiToken).toHaveBeenCalledTimes(1);
        expect(requestCalls).toEqual(['Bearer good']);
    });

    it('on 401, clears the cached token, re-exchanges, and retries once', async () => {
        // A stale token is rejected; the re-exchange yields a fresh good one.
        ensureBlackoutApiToken.mockResolvedValue('good');

        await expect(createAuthorizedApiClient('stale')(req)).resolves.toEqual({ ok: true });
        expect(clearBlackoutApiToken).toHaveBeenCalledTimes(1);
        expect(ensureBlackoutApiToken).toHaveBeenCalledTimes(1);
        expect(requestCalls).toEqual(['Bearer stale', 'Bearer good']);
    });

    it('rethrows the 401 when re-exchange yields no (or the same) token', async () => {
        ensureBlackoutApiToken.mockResolvedValue(null);

        await expect(createAuthorizedApiClient('stale')(req)).rejects.toMatchObject({ status: 401 });
        expect(requestCalls).toEqual(['Bearer stale']);
    });
});
