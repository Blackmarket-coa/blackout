// @vitest-environment jsdom
/**
 * The token refresh function handed to matrix-js-sdk. The SDK signs a client
 * out only when that function throws a `MatrixError` or a
 * `TokenRefreshLogoutError`; anything else is a transient failure it retries.
 * Until 2026-10-25 every refusal threw the client's own `MatrixInitError`, so a
 * device deleted elsewhere (401 `M_UNKNOWN_TOKEN`) or past its session end
 * (403 `M_FORBIDDEN`) was retried instead of signed out (D1 in
 * docs/black-mask-account-link-design.md §7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai/vanilla';

vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({}));

const fakeClient = {
    initRustCrypto: vi.fn(async () => undefined),
    setMaxListeners: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    startClient: vi.fn(async () => undefined),
    stopClient: vi.fn(),
    getUserId: () => '@alice:hs.example.test',
    getDeviceId: () => 'DEVICE1',
    logout: vi.fn(async () => ({})),
    clearStores: vi.fn(async () => undefined),
};
const createClientMock = vi.fn(() => fakeClient);
vi.mock('matrix-js-sdk', () => {
    // The SDK's own classes stand in here: what matters is that initMatrix
    // throws an instance of the class the SDK module exports.
    class TokenRefreshLogoutError extends Error {
        constructor(cause?: Error) {
            super(cause?.message ?? '');
        }
    }
    class MatrixError extends Error {}
    return {
        createClient: (...args: unknown[]) => createClientMock(...(args as [])),
        HttpApiEvent: { SessionLoggedOut: 'Session.logged_out' },
        IndexedDBCryptoStore: class {},
        IndexedDBStore: class {
            startup = vi.fn(async () => undefined);
        },
        TokenRefreshLogoutError,
        MatrixError,
    };
});
vi.mock('../../../src/client/encryptionHealth', () => ({
    startEncryptionHealthTracking: vi.fn(),
    stopEncryptionHealthTracking: vi.fn(),
}));
vi.mock('../../../src/client/blackoutApiSession', () => ({
    clearBlackoutApiToken: vi.fn(),
    exchangeMatrixForBlackoutToken: vi.fn(),
    revokeBlackoutApiToken: vi.fn(async () => undefined),
}));

import { TokenRefreshLogoutError } from 'matrix-js-sdk';
import { initMatrixFromStoredSession, MatrixInitError } from '../../../src/client/initMatrix';
import { restoreActiveSession, saveSession } from '../../../src/client/sessionManager';
import { setStorageNamespaceForTests } from '../../../src/client/storageNamespace';

const USER = '@alice:hs.example.test';
const DEVICE = 'DEVICE1';

const installFakeIndexedDb = () => {
    Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: {
            databases: async () => [],
            deleteDatabase: () => {
                const req: { onsuccess?: () => void } = {};
                queueMicrotask(() => req.onsuccess?.());
                return req;
            },
        },
    });
};

type Refresh = (token: string) => Promise<{ accessToken: string; refreshToken?: string }>;

/** Start the stored session and hand back the refresh function the SDK was given. */
const refreshFunction = async (): Promise<Refresh> => {
    saveSession({
        baseUrl: 'https://hs.example.test',
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        userId: USER,
        deviceId: DEVICE,
    });
    expect(await initMatrixFromStoredSession(createStore())).toBe(fakeClient);
    const options = createClientMock.mock.calls[0][0] as unknown as {
        tokenRefreshFunction: Refresh;
    };
    expect(typeof options.tokenRefreshFunction).toBe('function');
    return options.tokenRefreshFunction;
};

const answer = (status: number, body: unknown) =>
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('token refresh refusals', () => {
    beforeEach(() => {
        window.localStorage.clear();
        installFakeIndexedDb();
        createClientMock.mockClear();
        setStorageNamespaceForTests(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        [401, 'M_UNKNOWN_TOKEN'],
        [403, 'M_FORBIDDEN'],
    ])('a %i %s refusal throws the error the SDK signs out on', async (status, errcode) => {
        const refresh = await refreshFunction();
        const fetchMock = answer(status, { errcode, error: 'refused' });

        const thrown = await refresh('old-refresh').catch((e: unknown) => e);
        expect(thrown).toBeInstanceOf(TokenRefreshLogoutError);
        expect((thrown as Error).message).toContain(String(status));
        expect((thrown as Error).message).toContain(errcode);
        expect(String(fetchMock.mock.calls[0][0])).toBe(
            'https://hs.example.test/_matrix/client/v3/refresh'
        );
        // Signing out is the SDK's job once it sees the error; the refresh
        // function itself leaves the stored session alone.
        expect(restoreActiveSession()?.refreshToken).toBe('old-refresh');
    });

    it('a refusal with no JSON body is still a sign-out', async () => {
        const refresh = await refreshFunction();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
        const thrown = await refresh('old-refresh').catch((e: unknown) => e);
        expect(thrown).toBeInstanceOf(TokenRefreshLogoutError);
    });

    it.each([
        [429, 'rate_limited'],
        [500, 'invalid_credentials'],
        [502, 'invalid_credentials'],
    ])('a %i stays transient (%s), so the SDK retries', async (status, code) => {
        const refresh = await refreshFunction();
        answer(status, { errcode: 'M_UNKNOWN', error: 'later' });
        const thrown = await refresh('old-refresh').catch((e: unknown) => e);
        expect(thrown).not.toBeInstanceOf(TokenRefreshLogoutError);
        expect(thrown).toBeInstanceOf(MatrixInitError);
        expect((thrown as MatrixInitError).code).toBe(code);
    });

    it('a successful refresh returns the new tokens and stores them', async () => {
        const refresh = await refreshFunction();
        answer(200, {
            access_token: 'fresh',
            refresh_token: 'fresh-refresh',
            expires_in_ms: 60_000,
        });
        const result = await refresh('old-refresh');
        expect(result.accessToken).toBe('fresh');
        expect(result.refreshToken).toBe('fresh-refresh');
        expect(restoreActiveSession()?.accessToken).toBe('fresh');
    });
});
