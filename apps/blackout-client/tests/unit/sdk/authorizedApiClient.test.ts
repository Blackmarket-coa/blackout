import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ensureBlackoutApiToken = vi.fn<[], Promise<string | null>>();
const clearBlackoutApiToken = vi.fn();
const isBlackoutTokenExpired = vi.fn<[string | null | undefined], boolean>();

vi.mock('../../../src/client/blackoutApiSession', () => ({
    ensureBlackoutApiToken: () => ensureBlackoutApiToken(),
    clearBlackoutApiToken: () => clearBlackoutApiToken(),
    isBlackoutTokenExpired: (token: string | null | undefined) => isBlackoutTokenExpired(token),
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
        // Default: treat supplied tokens as valid so the pre-existing cases below
        // exercise the passed token as-is. The expiry path is covered explicitly.
        isBlackoutTokenExpired.mockReset();
        isBlackoutTokenExpired.mockReturnValue(false);
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

    it('treats an expired passed token as absent and resolves via ensure (no doomed 401)', async () => {
        // The cached token is expired: we must re-exchange up front rather than
        // firing the known-dead credential and self-healing on the 401.
        isBlackoutTokenExpired.mockReturnValue(true);
        ensureBlackoutApiToken.mockResolvedValue('good');

        await expect(createAuthorizedApiClient('expired')(req)).resolves.toEqual({ ok: true });
        expect(ensureBlackoutApiToken).toHaveBeenCalledTimes(1);
        expect(clearBlackoutApiToken).not.toHaveBeenCalled();
        // Only the fresh token is ever sent — the expired one never hits the wire.
        expect(requestCalls).toEqual(['Bearer good']);
    });
});
