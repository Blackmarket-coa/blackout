// @vitest-environment jsdom
/**
 * The chat panel's Sign out ends its Blackout API token on the API too
 * (launch-plan B3), so a copied token stops working at sign-out rather than
 * at its own expiry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ headers?: Record<string, string>; request: unknown }> = [];
let requestImpl: () => Promise<unknown> = () => Promise.resolve({ ok: true });
vi.mock('@blackout/sdk', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@blackout/sdk')>();
    return {
        ...actual,
        createFetchApiClient:
            (options: { defaultHeaders?: Record<string, string> }) => async (request: unknown) => {
                requests.push({ headers: options.defaultHeaders, request });
                return requestImpl();
            },
    };
});

vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({}));
vi.mock('matrix-js-sdk', () => ({
    createClient: vi.fn(),
    HttpApiEvent: { SessionLoggedOut: 'Session.logged_out' },
    IndexedDBCryptoStore: class {},
    IndexedDBStore: class {},
}));

import { createStore } from 'jotai/vanilla';
import type { MatrixClient } from 'matrix-js-sdk';
import { revokeBlackoutApiToken } from '../../../src/client/blackoutApiSession';
import { signOutPanel } from '../../../src/client/auth';
import { setStorageNamespaceForTests } from '../../../src/client/storageNamespace';
import { authStateAtom, matrixClientAtom, userIdAtom } from '../../../src/app/state/auth';

const jwt = (exp: number) => `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;

describe('revokeBlackoutApiToken', () => {
    beforeEach(() => {
        window.localStorage.clear();
        requests.length = 0;
        requestImpl = () => Promise.resolve({ ok: true });
        setStorageNamespaceForTests(true);
    });

    afterEach(() => {
        setStorageNamespaceForTests(null);
    });

    it('asks the API to refuse the panel’s token, then forgets it', async () => {
        const token = jwt(Math.floor(Date.now() / 1000) + 3600);
        window.localStorage.setItem('blackout.api.token.embed', token);
        window.localStorage.setItem('blackout.api.token', 'full-app-token');

        await revokeBlackoutApiToken();

        expect(requests).toHaveLength(1);
        expect(requests[0].headers).toEqual({ authorization: `Bearer ${token}` });
        expect(requests[0].request).toMatchObject({ method: 'POST', path: '/v1/auth/sign-out' });
        expect(window.localStorage.getItem('blackout.api.token.embed')).toBeNull();
        // The full app's token is not the panel's to revoke.
        expect(window.localStorage.getItem('blackout.api.token')).toBe('full-app-token');
    });

    it('still forgets the token when the API cannot be reached', async () => {
        window.localStorage.setItem(
            'blackout.api.token.embed',
            jwt(Math.floor(Date.now() / 1000) + 3600)
        );
        requestImpl = () => Promise.reject(new Error('offline'));
        await revokeBlackoutApiToken();
        expect(window.localStorage.getItem('blackout.api.token.embed')).toBeNull();
    });

    it('sends nothing for a token that has already expired', async () => {
        window.localStorage.setItem('blackout.api.token.embed', jwt(1));
        await revokeBlackoutApiToken();
        expect(requests).toHaveLength(0);
        expect(window.localStorage.getItem('blackout.api.token.embed')).toBeNull();
    });
});

describe('signOutPanel', () => {
    beforeEach(() => {
        window.localStorage.clear();
        requests.length = 0;
        requestImpl = () => Promise.resolve({ ok: true });
        setStorageNamespaceForTests(true);
    });

    afterEach(() => {
        setStorageNamespaceForTests(null);
    });

    it('ends the API token on the API, then signs the device out', async () => {
        const order: string[] = [];
        requestImpl = () => {
            order.push('api sign-out');
            return Promise.resolve({ ok: true });
        };
        window.localStorage.setItem(
            'blackout.api.token.embed',
            jwt(Math.floor(Date.now() / 1000) + 3600)
        );
        const client = {
            stopClient: vi.fn(),
            logout: vi.fn(async () => {
                order.push('device logout');
            }),
            clearStores: vi.fn(async () => undefined),
            getUserId: () => '@alice:hs.example.test',
            getDeviceId: () => 'PANELDEV',
        };
        const store = createStore();
        store.set(matrixClientAtom, client as unknown as MatrixClient);
        store.set(authStateAtom, 'logged_in');
        store.set(userIdAtom, '@alice:hs.example.test');

        await signOutPanel(store);

        expect(order).toEqual(['api sign-out', 'device logout']);
        expect(client.clearStores).toHaveBeenCalledWith({
            cryptoDatabasePrefix: 'blackout-embed-rust:@alice:hs.example.test:PANELDEV',
        });
        expect(store.get(authStateAtom)).toBe('logged_out');
        expect(window.localStorage.getItem('blackout.api.token.embed')).toBeNull();
    });
});
