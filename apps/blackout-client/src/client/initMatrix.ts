import '@matrix-org/matrix-sdk-crypto-wasm';
import {
    createClient,
    IndexedDBCryptoStore,
    IndexedDBStore,
    type MatrixClient,
    type MatrixError,
} from 'matrix-js-sdk';
import { createStore } from 'jotai/vanilla';
import { authStateAtom, matrixClientAtom, userIdAtom, type AuthState } from '../app/state/bmc-auth';
import { setFallbackSession } from '../app/state/sessions';
import { clearSession, restoreActiveSession, saveSession, type StoredSession } from './sessionManager';

type AtomStore = ReturnType<typeof createStore>;

const SYNC_RETRY_BASE_MS = 2_000;
const MAX_SYNC_RETRIES = 6;
const LEGACY_SYNC_STORE_PREFIX = 'blackout-sync-store';
const LEGACY_CRYPTO_STORE_PREFIX = 'blackout-crypto-store';
const RUST_CRYPTO_STORE_PREFIX = 'blackout-rust-crypto-store';
const LEGACY_RUST_CRYPTO_STORE_PREFIX = 'matrix-js-sdk';

export type MatrixInitErrorCode =
    | 'invalid_homeserver'
    | 'network_failure'
    | 'invalid_credentials'
    | 'rate_limited'
    | 'captcha_required'
    | 'unknown';

export class MatrixInitError extends Error {
    code: MatrixInitErrorCode;

    constructor(code: MatrixInitErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'MatrixInitError';
    }
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const isLikelyNetworkError = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
        message.includes('network') || message.includes('fetch') || message.includes('connection')
    );
};

const normalizeMatrixError = (error: unknown): MatrixInitError => {
    const matrixError = error as Partial<MatrixError> & { errcode?: string; message?: string };

    if (matrixError?.errcode === 'M_LIMIT_EXCEEDED') {
        return new MatrixInitError('rate_limited', 'Root rate limit exceeded.');
    }
    if (matrixError?.errcode === 'M_FORBIDDEN' || matrixError?.errcode === 'M_UNKNOWN_TOKEN') {
        return new MatrixInitError('invalid_credentials', 'Session token is invalid or expired.');
    }
    if (matrixError?.errcode === 'M_CAPTCHA_NEEDED') {
        return new MatrixInitError('captcha_required', 'Root requires CAPTCHA verification.');
    }
    if (isLikelyNetworkError(error)) {
        return new MatrixInitError('network_failure', 'Unable to reach the root.');
    }

    if (error instanceof DOMException) {
        return new MatrixInitError(
            'unknown',
            `Matrix secure storage failed: ${error.name}${error.message ? `: ${error.message}` : ''}.`,
        );
    }

    if (error instanceof Error && error.message) {
        return new MatrixInitError('unknown', error.message);
    }

    return new MatrixInitError('unknown', matrixError?.message ?? 'Matrix initialization failed.');
};

const ensureValidHomeserver = (baseUrl: string): void => {
    try {
        const parsed = new URL(baseUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Invalid protocol');
        }
    } catch {
        throw new MatrixInitError('invalid_homeserver', 'Root URL is invalid.');
    }
};

const applyAuthAtoms = (store: AtomStore, client: MatrixClient | null, authState: AuthState) => {
    store.set(matrixClientAtom, client);
    store.set(authStateAtom, authState);
    store.set(userIdAtom, client?.getUserId() ?? null);
};

type StoreNames = {
    sync: string;
    crypto: string;
    rustCryptoPrefix: string;
    legacySync: string;
    legacyCrypto: string;
};

const getRustCryptoDbNames = (prefix: string): string[] => [
    `${prefix}::matrix-sdk-crypto`,
    `${prefix}::matrix-sdk-crypto-meta`,
];

const getStoreNames = (session: StoredSession): StoreNames => ({
    sync: `${LEGACY_SYNC_STORE_PREFIX}:${session.userId}:${session.deviceId}`,
    crypto: `${LEGACY_CRYPTO_STORE_PREFIX}:${session.userId}:${session.deviceId}`,
    rustCryptoPrefix: `${RUST_CRYPTO_STORE_PREFIX}:${session.userId}:${session.deviceId}`,
    legacySync: `${LEGACY_SYNC_STORE_PREFIX}:${session.userId}`,
    legacyCrypto: `${LEGACY_CRYPTO_STORE_PREFIX}:${session.userId}`,
});

const deleteDatabase = (dbName: string): Promise<void> =>
    new Promise((resolve, reject) => {
        try {
            const request = window.indexedDB.deleteDatabase(dbName);
            request.onsuccess = () => resolve();
            request.onerror = () =>
                reject(request.error ?? new Error(`Failed to delete IndexedDB database "${dbName}".`));
            request.onblocked = () => resolve();
        } catch (error) {
            reject(error);
        }
    });

const deleteDatabaseSafe = async (dbName: string): Promise<void> => {
    try {
        await deleteDatabase(dbName);
    } catch (error) {
        console.warn(`Unable to delete IndexedDB database "${dbName}".`, error);
    }
};

const cleanupStaleSessionStores = async (
    session: StoredSession,
    { aggressive = false }: { aggressive?: boolean } = {},
): Promise<void> => {
    const { sync, crypto, rustCryptoPrefix, legacySync, legacyCrypto } = getStoreNames(session);
    const staleDbNames = new Set<string>([legacySync, legacyCrypto]);

    if (aggressive) {
        getRustCryptoDbNames(LEGACY_RUST_CRYPTO_STORE_PREFIX).forEach((dbName) =>
            staleDbNames.add(dbName),
        );
    }

    if (typeof window.indexedDB.databases === 'function') {
        try {
            const databases = await window.indexedDB.databases();
            databases.forEach(({ name }) => {
                if (!name) return;

                const isSyncStore =
                    name.startsWith(`${LEGACY_SYNC_STORE_PREFIX}:${session.userId}:`) && name !== sync;
                const isCryptoStore =
                    name.startsWith(`${LEGACY_CRYPTO_STORE_PREFIX}:${session.userId}:`) &&
                    name !== crypto;
                const isRustCryptoStore =
                    name.startsWith(`${RUST_CRYPTO_STORE_PREFIX}:${session.userId}:`) &&
                    !name.startsWith(rustCryptoPrefix);
                const isLegacyRustCryptoStore =
                    aggressive &&
                    getRustCryptoDbNames(LEGACY_RUST_CRYPTO_STORE_PREFIX).includes(name);

                if (isSyncStore || isCryptoStore || isRustCryptoStore || isLegacyRustCryptoStore) {
                    staleDbNames.add(name);
                }
            });
        } catch (error) {
            console.warn('Unable to enumerate IndexedDB databases for stale Matrix store cleanup.', error);
        }
    }

    await Promise.all(Array.from(staleDbNames).map((dbName) => deleteDatabaseSafe(dbName)));
};

const isStoreAccountMismatchError = (error: unknown): boolean =>
    error instanceof Error &&
    error.message.includes("the account in the store doesn't match the account in the constructor");

const initClientForSession = async (session: StoredSession): Promise<MatrixClient> => {
    ensureValidHomeserver(session.baseUrl);
    const { sync, crypto, rustCryptoPrefix } = getStoreNames(session);

    const syncStore = new IndexedDBStore({
        indexedDB: window.indexedDB,
        localStorage: window.localStorage,
        dbName: sync,
    });

    const cryptoStore = new IndexedDBCryptoStore(window.indexedDB, crypto);
    const tokenRefreshFunction = async (refreshToken: string) => {
        const refreshUrl = new URL('/_matrix/client/v3/refresh', session.baseUrl);
        const response = await fetch(refreshUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
            throw new Error(`Token refresh failed (${response.status}).`);
        }

        const data = (await response.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in_ms?: number;
        };

        if (!data.access_token) {
            throw new Error('Refresh response missing access token.');
        }

        const updatedSession: StoredSession = {
            ...session,
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? refreshToken,
            expiresAt: data.expires_in_ms ? Date.now() + data.expires_in_ms : session.expiresAt,
        };

        saveSession(updatedSession);
        setFallbackSession(
            updatedSession.accessToken,
            updatedSession.deviceId,
            updatedSession.userId,
            updatedSession.baseUrl,
        );

        return {
            accessToken: updatedSession.accessToken,
            refreshToken: updatedSession.refreshToken,
            expiry: updatedSession.expiresAt ? new Date(updatedSession.expiresAt) : undefined,
        };
    };

    const client = createClient({
        baseUrl: session.baseUrl,
        userId: session.userId,
        deviceId: session.deviceId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenRefreshFunction,
        store: syncStore,
        cryptoStore,
        timelineSupport: true,
        verificationMethods: ['m.sas.v1'],
    });

    await syncStore.startup();
    await client.initRustCrypto({ cryptoDatabasePrefix: rustCryptoPrefix });
    client.setMaxListeners(100);

    return client;
};

const initClientForSessionWithRecovery = async (session: StoredSession): Promise<MatrixClient> => {
    try {
        await cleanupStaleSessionStores(session);
        return await initClientForSession(session);
    } catch (error) {
        if (!isStoreAccountMismatchError(error)) {
            throw error;
        }

        console.warn(
            'Detected stale Matrix crypto store bound to another device. Clearing stores and retrying.',
            error,
        );
        await cleanupStaleSessionStores(session, { aggressive: true });
        return initClientForSession(session);
    }
};

export const startSyncWithRetry = async (client: MatrixClient): Promise<void> => {
    let attempts = 0;

    while (attempts < MAX_SYNC_RETRIES) {
        try {
            await client.startClient({ lazyLoadMembers: true });
            return;
        } catch (error) {
            const normalizedError = normalizeMatrixError(error);
            attempts += 1;

            if (normalizedError.code !== 'network_failure' || attempts >= MAX_SYNC_RETRIES) {
                throw normalizedError;
            }

            const backoffMs = SYNC_RETRY_BASE_MS * 2 ** (attempts - 1);
            await sleep(backoffMs);
        }
    }
};

export const initMatrixFromStoredSession = async (
    store: AtomStore,
): Promise<MatrixClient | null> => {
    applyAuthAtoms(store, null, 'loading');

    const session = restoreActiveSession();
    if (!session) {
        applyAuthAtoms(store, null, 'logged_out');
        return null;
    }

    try {
        const client = await initClientForSessionWithRecovery(session);
        await startSyncWithRetry(client);
        applyAuthAtoms(store, client, 'logged_in');
        return client;
    } catch (error) {
        console.error('Blackout Matrix bootstrap failed after session restore.', error);
        const normalizedError = normalizeMatrixError(error);
        applyAuthAtoms(store, null, 'logged_out');
        throw normalizedError;
    }
};

export const stopMatrixClient = (client: MatrixClient | null): void => {
    client?.stopClient();
};

export const initClient = (session: StoredSession): Promise<MatrixClient> =>
    initClientForSessionWithRecovery(session);

export const startClient = async (client: MatrixClient): Promise<void> => {
    await startSyncWithRetry(client);
};

export const clearLoginData = (): void => {
    window.localStorage.clear();
};

export const logoutClient = async (client: MatrixClient): Promise<void> => {
    stopMatrixClient(client);

    try {
        await client.logout();
    } catch {
        // ignore server-side logout failures; local cleanup still needs to finish
    }

    await client.clearStores();
    clearSession(client.getUserId() ?? undefined);
};

export const clearCacheAndReload = async (client: MatrixClient): Promise<void> => {
    stopMatrixClient(client);
    await client.clearStores();
    window.location.reload();
};
