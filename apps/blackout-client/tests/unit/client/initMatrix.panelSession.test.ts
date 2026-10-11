// @vitest-environment jsdom
/**
 * The chat panel's own handling of its session end (launch-plan B3). The
 * servers enforce the end without the client (see the homeserver and API
 * tests); these cover the panel catching up: never restarting an ended
 * session, signing out on time, deleting what the session stored in this
 * browser, and never touching the full app's stores.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai/vanilla';

vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({}));

const makeClient = () => ({
    initRustCrypto: vi.fn(async () => undefined),
    setMaxListeners: vi.fn(),
    once: vi.fn(),
    removeAllListeners: vi.fn(),
    startClient: vi.fn(async () => undefined),
    stopClient: vi.fn(),
    getUserId: () => '@alice:hs.example.test',
    getDeviceId: () => 'PANELDEV',
    logout: vi.fn(async () => ({})),
    clearStores: vi.fn(async () => undefined),
});
let fakeClient = makeClient();
const createClientMock = vi.fn(() => fakeClient);
vi.mock('matrix-js-sdk', () => ({
    createClient: (...args: unknown[]) => createClientMock(...(args as [])),
    HttpApiEvent: { SessionLoggedOut: 'Session.logged_out' },
    IndexedDBCryptoStore: class {},
    IndexedDBStore: class {
        startup = vi.fn(async () => undefined);
    },
}));
vi.mock('../../../src/client/encryptionHealth', () => ({
    startEncryptionHealthTracking: vi.fn(),
    stopEncryptionHealthTracking: vi.fn(),
}));
vi.mock('../../../src/client/blackoutApiSession', () => ({
    clearBlackoutApiToken: vi.fn(),
    exchangeMatrixForBlackoutToken: vi.fn(),
}));

import {
    endPanelSession,
    handleSessionLoggedOut,
    initMatrixFromStoredSession,
} from '../../../src/client/initMatrix';
import { logout } from '../../../src/client/auth';
import {
    authStateAtom,
    matrixClientAtom,
    panelSignedOutReasonAtom,
    userIdAtom,
} from '../../../src/app/state/auth';
import { restoreActiveSession, saveSession } from '../../../src/client/sessionManager';
import { setStorageNamespaceForTests } from '../../../src/client/storageNamespace';
import type { MatrixClient } from 'matrix-js-sdk';

const USER = '@alice:hs.example.test';
const DEVICE = 'PANELDEV';
const PANEL_RUST = `blackout-embed-rust:${USER}:${DEVICE}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let existingDbs: string[] = [];
let deletedDbs: string[] = [];

const installFakeIndexedDb = () => {
    Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: {
            databases: async () => existingDbs.map((name) => ({ name })),
            deleteDatabase: (name: string) => {
                deletedDbs.push(name);
                const req: { onsuccess?: () => void } = {};
                queueMicrotask(() => req.onsuccess?.());
                return req;
            },
        },
    });
};

const savePanelSession = (sessionEndsAt: number | undefined, sessionLength = '1h') =>
    saveSession({
        baseUrl: 'https://hs.example.test',
        accessToken: 'panel-token',
        userId: USER,
        deviceId: DEVICE,
        sessionLength: sessionLength as never,
        ...(sessionEndsAt === undefined ? {} : { sessionEndsAt }),
    });

const settle = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('chat panel session end', () => {
    beforeEach(() => {
        window.localStorage.clear();
        existingDbs = [];
        deletedDbs = [];
        installFakeIndexedDb();
        fakeClient = makeClient();
        createClientMock.mockClear();
        setStorageNamespaceForTests(true);
    });

    afterEach(() => {
        vi.useRealTimers();
        setStorageNamespaceForTests(null);
    });

    it('never restarts a session whose end has passed; it cleans up instead', async () => {
        savePanelSession(Date.now() - 1000);
        const store = createStore();
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('{}', { status: 200 }));

        expect(await initMatrixFromStoredSession(store)).toBeNull();

        expect(createClientMock).not.toHaveBeenCalled();
        // The device is ended on the server right away with its stored token.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://hs.example.test/_matrix/client/v3/logout');
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer panel-token');
        fetchMock.mockRestore();
        expect(store.get(authStateAtom)).toBe('logged_out');
        expect(store.get(panelSignedOutReasonAtom)).toBe('session_ended');
        expect(restoreActiveSession()).toBeNull();
        expect(deletedDbs).toEqual(
            expect.arrayContaining([
                // The timeline cache, under the name matrix-js-sdk really uses.
                `matrix-js-sdk:blackout-embed-sync-store:${USER}:${DEVICE}`,
                `blackout-embed-crypto-store:${USER}:${DEVICE}`,
                `${PANEL_RUST}::matrix-sdk-crypto`,
                `${PANEL_RUST}::matrix-sdk-crypto-meta`,
            ])
        );
    });

    it('signs out when the chosen length runs out, ending the device on the server and wiping it here', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        savePanelSession(Date.now() + HOUR);
        const store = createStore();

        expect(await initMatrixFromStoredSession(store)).toBe(fakeClient);
        expect(store.get(authStateAtom)).toBe('logged_in');
        // Its own Rust crypto store, never the per-origin default.
        expect(fakeClient.initRustCrypto).toHaveBeenCalledWith({
            cryptoDatabasePrefix: PANEL_RUST,
        });

        await vi.advanceTimersByTimeAsync(HOUR - 1000);
        expect(store.get(authStateAtom)).toBe('logged_in');
        expect(fakeClient.logout).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(2000);
        await settle();

        expect(fakeClient.stopClient).toHaveBeenCalled();
        expect(fakeClient.logout).toHaveBeenCalledTimes(1);
        expect(fakeClient.clearStores).toHaveBeenCalledWith({ cryptoDatabasePrefix: PANEL_RUST });
        expect(store.get(authStateAtom)).toBe('logged_out');
        expect(store.get(matrixClientAtom)).toBeNull();
        expect(store.get(panelSignedOutReasonAtom)).toBe('session_ended');
        expect(restoreActiveSession()).toBeNull();
    });

    it('keeps time for a 30-day session past setTimeout’s ~24.8-day limit', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        savePanelSession(Date.now() + 30 * DAY, '30d');
        const store = createStore();
        await initMatrixFromStoredSession(store);

        await vi.advanceTimersByTimeAsync(25 * DAY);
        expect(store.get(authStateAtom)).toBe('logged_in');
        await vi.advanceTimersByTimeAsync(5 * DAY + 1000);
        await settle();
        expect(store.get(authStateAtom)).toBe('logged_out');
        expect(store.get(panelSignedOutReasonAtom)).toBe('session_ended');
    });

    it('does not fire for a session that was signed out first', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
        savePanelSession(Date.now() + HOUR);
        const store = createStore();
        await initMatrixFromStoredSession(store);

        await logout(store);
        expect(fakeClient.logout).toHaveBeenCalledTimes(1);
        expect(fakeClient.clearStores).toHaveBeenCalledWith({ cryptoDatabasePrefix: PANEL_RUST });

        await vi.advanceTimersByTimeAsync(2 * HOUR);
        await settle();
        expect(fakeClient.logout).toHaveBeenCalledTimes(1);
        expect(store.get(panelSignedOutReasonAtom)).toBeNull();
    });

    it('wipes the panel’s stores when the homeserver drops the session', async () => {
        savePanelSession(Date.now() + HOUR);
        const store = createStore();
        store.set(matrixClientAtom, fakeClient as unknown as MatrixClient);
        store.set(authStateAtom, 'logged_in');
        store.set(userIdAtom, USER);

        handleSessionLoggedOut(store, fakeClient as unknown as MatrixClient);
        await settle();

        expect(fakeClient.clearStores).toHaveBeenCalledWith({ cryptoDatabasePrefix: PANEL_RUST });
        expect(deletedDbs).toEqual(
            expect.arrayContaining([`blackout-embed-crypto-store:${USER}:${DEVICE}`])
        );
        expect(store.get(panelSignedOutReasonAtom)).toBe('signed_out');
        expect(restoreActiveSession()).toBeNull();
    });

    it('never signs out a newer session when an older one’s end is handled late', async () => {
        const older = {
            baseUrl: 'https://hs.example.test',
            accessToken: 'old-token',
            userId: USER,
            deviceId: 'OLDPANEL',
            sessionLength: '1h' as const,
            sessionEndsAt: Date.now() - 1000,
        };
        savePanelSession(Date.now() + HOUR);
        const store = createStore();
        store.set(authStateAtom, 'logged_in');

        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('{}', { status: 200 }));
        await endPanelSession(store, null, older, 'session_ended');
        fetchMock.mockRestore();

        // The older device's local data goes; the newer session stays.
        expect(deletedDbs).toContain(`blackout-embed-crypto-store:${USER}:OLDPANEL`);
        expect(restoreActiveSession()?.deviceId).toBe(DEVICE);
        expect(store.get(authStateAtom)).toBe('logged_in');
        expect(store.get(panelSignedOutReasonAtom)).toBeNull();
    });

    it('prunes only the panel’s own stale stores, never the full app’s', async () => {
        existingDbs = [
            `blackout-crypto-store:${USER}:APPDEV`,
            `blackout-sync-store:${USER}:APPDEV`,
            'matrix-js-sdk::matrix-sdk-crypto',
            `blackout-embed-crypto-store:${USER}:OLDPANEL`,
            `blackout-embed-rust:${USER}:OLDPANEL::matrix-sdk-crypto`,
            `matrix-js-sdk:blackout-embed-sync-store:${USER}:OLDPANEL`,
            `matrix-js-sdk:blackout-embed-sync-store:${USER}:${DEVICE}`,
            `matrix-js-sdk:blackout-sync-store:${USER}:APPDEV`,
            `${PANEL_RUST}::matrix-sdk-crypto`,
        ];
        savePanelSession(Date.now() + HOUR);
        await initMatrixFromStoredSession(createStore());

        expect(deletedDbs).toEqual(
            expect.arrayContaining([
                `blackout-embed-crypto-store:${USER}:OLDPANEL`,
                `blackout-embed-rust:${USER}:OLDPANEL::matrix-sdk-crypto`,
                `matrix-js-sdk:blackout-embed-sync-store:${USER}:OLDPANEL`,
            ])
        );
        expect(deletedDbs).not.toContain(
            `matrix-js-sdk:blackout-embed-sync-store:${USER}:${DEVICE}`
        );
        expect(deletedDbs).not.toContain(`matrix-js-sdk:blackout-sync-store:${USER}:APPDEV`);
        expect(deletedDbs).not.toContain(`blackout-crypto-store:${USER}:APPDEV`);
        expect(deletedDbs).not.toContain(`blackout-sync-store:${USER}:APPDEV`);
        expect(deletedDbs).not.toContain('matrix-js-sdk::matrix-sdk-crypto');
        expect(deletedDbs).not.toContain(`${PANEL_RUST}::matrix-sdk-crypto`);
    });
});

describe('the full app is unchanged', () => {
    beforeEach(() => {
        window.localStorage.clear();
        existingDbs = [];
        deletedDbs = [];
        installFakeIndexedDb();
        fakeClient = makeClient();
        createClientMock.mockClear();
        setStorageNamespaceForTests(false);
    });

    afterEach(() => {
        setStorageNamespaceForTests(null);
    });

    it('uses the SDK’s default crypto store and never prunes the panel’s stores', async () => {
        existingDbs = [
            `blackout-embed-crypto-store:${USER}:PANELDEV`,
            `blackout-embed-rust:${USER}:PANELDEV::matrix-sdk-crypto`,
            `blackout-crypto-store:${USER}:OLDAPP`,
        ];
        saveSession({
            baseUrl: 'https://hs.example.test',
            accessToken: 'app-token',
            userId: USER,
            deviceId: 'APPDEV',
        });
        const store = createStore();
        await initMatrixFromStoredSession(store);
        expect(fakeClient.initRustCrypto).toHaveBeenCalledWith();
        expect(deletedDbs).toContain(`blackout-crypto-store:${USER}:OLDAPP`);
        expect(deletedDbs).not.toContain(`blackout-embed-crypto-store:${USER}:PANELDEV`);
        expect(deletedDbs).not.toContain(`blackout-embed-rust:${USER}:PANELDEV::matrix-sdk-crypto`);
        expect(store.get(panelSignedOutReasonAtom)).toBeNull();
    });

    it('keeps its stores when the homeserver drops the session, as before', async () => {
        const store = createStore();
        handleSessionLoggedOut(store, fakeClient as unknown as MatrixClient);
        await settle();
        expect(fakeClient.clearStores).not.toHaveBeenCalled();
        expect(store.get(panelSignedOutReasonAtom)).toBeNull();
    });
});
