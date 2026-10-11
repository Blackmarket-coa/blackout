// @vitest-environment jsdom
/**
 * The chat panel keeps its session apart from the full app's (launch-plan B3):
 * it never runs on, overwrites or reads the full app's session or API token,
 * and the full app's names are exactly what they always were.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    setStorageNamespaceForTests,
    storageNamespace,
} from '../../../src/client/storageNamespace';
import {
    loadSessionMap,
    restoreActiveSession,
    saveSession,
} from '../../../src/client/sessionManager';
import { readBlackoutApiToken } from '../../../src/app/features/monetization/marketplace/useMarketplaceAuth';
import { wipeSensitiveTraces } from '../../../src/app/features/panic/localTraces';

const SESSION = {
    baseUrl: 'https://hs.example.test',
    userId: '@alice:hs.example.test',
};

describe('storage namespaces', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        setStorageNamespaceForTests(null);
    });

    it('keeps the full app’s names unchanged', () => {
        setStorageNamespaceForTests(false);
        const ns = storageNamespace();
        expect(ns.embed).toBe(false);
        expect(ns.sessionMapKey).toBe('blackout.matrix.sessions.v1');
        expect(ns.apiTokenKey).toBe('blackout.api.token');
        expect(ns.syncStorePrefix).toBe('blackout-sync-store:');
        expect(ns.cryptoStorePrefix).toBe('blackout-crypto-store:');
        expect(ns.rustCryptoPrefix('@a:b', 'D')).toBeUndefined();
    });

    it('detects the panel from the path the page loaded on', () => {
        window.history.replaceState(null, '', '/embed/dms/abc');
        setStorageNamespaceForTests(null);
        expect(storageNamespace().embed).toBe(true);
        window.history.replaceState(null, '', '/embedded');
        setStorageNamespaceForTests(null);
        expect(storageNamespace().embed).toBe(false);
        window.history.replaceState(null, '', '/');
    });

    it('stores the panel’s session under its own key, beside the full app’s for the same user', () => {
        setStorageNamespaceForTests(false);
        saveSession({ ...SESSION, accessToken: 'app-token', deviceId: 'APPDEV' });
        setStorageNamespaceForTests(true);
        expect(restoreActiveSession()).toBeNull();
        saveSession({
            ...SESSION,
            accessToken: 'panel-token',
            deviceId: 'PANELDEV',
            sessionLength: '1h',
            sessionEndsAt: Date.now() + 3_600_000,
        });
        expect(restoreActiveSession()?.accessToken).toBe('panel-token');

        setStorageNamespaceForTests(false);
        expect(restoreActiveSession()?.accessToken).toBe('app-token');
        expect(restoreActiveSession()?.sessionLength).toBeUndefined();
        expect(window.localStorage.getItem('blackout.matrix.sessions.embed.v1')).toContain(
            'panel-token'
        );
        expect(window.localStorage.getItem('blackout.matrix.sessions.v1')).not.toContain(
            'panel-token'
        );
    });

    it('drops a stored panel session whose end is unreadable rather than treating it as endless', () => {
        setStorageNamespaceForTests(true);
        window.localStorage.setItem(
            'blackout.matrix.sessions.embed.v1',
            JSON.stringify({
                activeUserId: SESSION.userId,
                sessions: {
                    [SESSION.userId]: {
                        ...SESSION,
                        accessToken: 't',
                        deviceId: 'D',
                        sessionLength: '1h',
                        sessionEndsAt: 'tomorrow',
                    },
                },
            })
        );
        expect(loadSessionMap().sessions[SESSION.userId]).toBeUndefined();
        expect(restoreActiveSession()).toBeNull();

        window.localStorage.setItem(
            'blackout.matrix.sessions.embed.v1',
            JSON.stringify({
                activeUserId: SESSION.userId,
                sessions: {
                    [SESSION.userId]: {
                        ...SESSION,
                        accessToken: 't',
                        deviceId: 'D',
                        sessionLength: 'forever',
                    },
                },
            })
        );
        expect(restoreActiveSession()).toBeNull();
    });

    it('reads only the panel’s own API token in the panel', () => {
        window.localStorage.setItem('blackout.api.token', 'app-jwt');
        window.localStorage.setItem('blackoutApiToken', 'legacy-jwt');
        setStorageNamespaceForTests(true);
        expect(readBlackoutApiToken()).toBeNull();
        window.localStorage.setItem('blackout.api.token.embed', 'panel-jwt');
        expect(readBlackoutApiToken()).toBe('panel-jwt');

        setStorageNamespaceForTests(false);
        expect(readBlackoutApiToken()).toBe('app-jwt');
    });

    it('is covered by the panic wipe’s session prefixes', () => {
        window.localStorage.setItem('blackout.matrix.sessions.embed.v1', '{}');
        window.localStorage.setItem('blackout.api.token.embed', 'panel-jwt');
        const removed = wipeSensitiveTraces(window.localStorage, { includeSession: true });
        expect(removed).toEqual(
            expect.arrayContaining([
                'blackout.matrix.sessions.embed.v1',
                'blackout.api.token.embed',
            ])
        );
        expect(window.localStorage.getItem('blackout.api.token.embed')).toBeNull();
    });
});
