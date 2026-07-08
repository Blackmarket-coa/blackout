// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai/vanilla';
import type { MatrixClient } from 'matrix-js-sdk';

// Keep the crypto wasm + matrix-js-sdk out of the test: initMatrix only needs
// these symbols at module scope, and the handler under test touches none of
// them beyond `client.stopClient()` / `client.getUserId()`.
vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({}));
vi.mock('matrix-js-sdk', () => ({
    createClient: vi.fn(),
    HttpApiEvent: { SessionLoggedOut: 'Session.logged_out' },
    IndexedDBCryptoStore: class {},
    IndexedDBStore: class {},
}));

import { handleSessionLoggedOut } from '../../../src/client/initMatrix';
import { authStateAtom, matrixClientAtom, userIdAtom } from '../../../src/app/state/auth';
import { BLACKOUT_API_TOKEN_KEY } from '../../../src/client/blackoutApiSession';
import { loadSessionMap, saveSession } from '../../../src/client/sessionManager';

const makeClient = (userId: string | null) =>
    ({
        stopClient: vi.fn(),
        getUserId: () => userId,
    } as unknown as MatrixClient & { stopClient: ReturnType<typeof vi.fn> });

describe('handleSessionLoggedOut', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('tears the zombie session down: stops sync, drops tokens, flips auth atoms', () => {
        const store = createStore();
        const client = makeClient('@user:example.org');

        saveSession({
            baseUrl: 'https://matrix.example.org',
            accessToken: 'dead-token',
            userId: '@user:example.org',
            deviceId: 'DEVICE',
        });
        window.localStorage.setItem(BLACKOUT_API_TOKEN_KEY, 'stale-jwt');
        store.set(matrixClientAtom, client);
        store.set(authStateAtom, 'logged_in');
        store.set(userIdAtom, '@user:example.org');

        handleSessionLoggedOut(store, client);

        expect(client.stopClient).toHaveBeenCalledTimes(1);
        expect(window.localStorage.getItem(BLACKOUT_API_TOKEN_KEY)).toBeNull();
        // The dead stored session is gone, so a reload lands on sign-in
        // instead of re-entering the zombie state.
        const map = loadSessionMap();
        expect(map.sessions['@user:example.org']).toBeUndefined();
        expect(map.activeUserId).toBeNull();
        expect(store.get(authStateAtom)).toBe('logged_out');
        expect(store.get(matrixClientAtom)).toBeNull();
        expect(store.get(userIdAtom)).toBeNull();
    });

    it('keeps other stored sessions when only the invalidated one is cleared', () => {
        const store = createStore();
        const client = makeClient('@dead:example.org');

        saveSession({
            baseUrl: 'https://matrix.example.org',
            accessToken: 'other-token',
            userId: '@other:example.org',
            deviceId: 'OTHER',
        });
        saveSession({
            baseUrl: 'https://matrix.example.org',
            accessToken: 'dead-token',
            userId: '@dead:example.org',
            deviceId: 'DEAD',
        });

        handleSessionLoggedOut(store, client);

        const map = loadSessionMap();
        expect(map.sessions['@dead:example.org']).toBeUndefined();
        expect(map.sessions['@other:example.org']).toBeDefined();
    });
});
