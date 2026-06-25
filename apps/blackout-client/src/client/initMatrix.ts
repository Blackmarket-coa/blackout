import '@matrix-org/matrix-sdk-crypto-wasm';
import {
    createClient,
    IndexedDBCryptoStore,
    IndexedDBStore,
    type MatrixClient,
    type MatrixError,
} from 'matrix-js-sdk';
import { type AccessTokens, type TokenRefreshFunction } from 'matrix-js-sdk/lib/http-api';
import { createStore } from 'jotai/vanilla';
import { authStateAtom, matrixClientAtom, userIdAtom, type AuthState } from '../app/state/auth';
import { clearSession, restoreActiveSession, saveSession, type StoredSession } from './sessionManager';
import { exchangeMatrixForBlackoutToken } from './blackoutApiSession';
import { cryptoCallbacks } from './secretStorageKeys';
import { filteredMatrixLogger } from './matrixLogger';

type AtomStore = ReturnType<typeof createStore>;

const SYNC_RETRY_BASE_MS = 2_000;
const MAX_SYNC_RETRIES = 6;

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

const SYNC_STORE_PREFIX = 'blackout-sync-store:';
const CRYPTO_STORE_PREFIX = 'blackout-crypto-store:';

const cryptoStoreDbName = (userId: string, deviceId: string): string =>
    `${CRYPTO_STORE_PREFIX}${userId}:${deviceId}`;

const syncStoreDbName = (userId: string, deviceId: string): string =>
    `${SYNC_STORE_PREFIX}${userId}:${deviceId}`;

const deleteIndexedDb = (name: string): Promise<void> =>
    new Promise<void>((resolve) => {
        try {
            const req = window.indexedDB.deleteDatabase(name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
        } catch {
            resolve();
        }
    });

/**
 * Each new login from a homeserver creates a fresh device_id. The rust-crypto
 * SDK refuses to load a crypto store created for a different device_id, which
 * surfaces as "account in store doesn't match the account in the constructor".
 *
 * To stay self-healing across logout/login cycles we (1) namespace the IndexedDB
 * stores by deviceId, and (2) best-effort prune stale stores belonging to other
 * device_ids for the same user, plus the legacy un-suffixed databases.
 */
const cleanupStaleStoresForUser = async (
    userId: string,
    activeDeviceId: string,
): Promise<void> => {
    const targetCryptoDb = cryptoStoreDbName(userId, activeDeviceId);
    const targetSyncDb = syncStoreDbName(userId, activeDeviceId);

    // Always remove the legacy un-suffixed databases from earlier builds.
    const legacyDbs = [`${CRYPTO_STORE_PREFIX}${userId}`, `${SYNC_STORE_PREFIX}${userId}`];

    let staleDbs: string[] = [];

    const databasesFn = (
        window.indexedDB as IDBFactory & { databases?: () => Promise<IDBDatabaseInfo[]> }
    ).databases;
    if (typeof databasesFn === 'function') {
        try {
            const dbs = await databasesFn.call(window.indexedDB);
            staleDbs = dbs
                .map((info) => info.name)
                .filter((name): name is string => typeof name === 'string')
                .filter(
                    (name) =>
                        (name.startsWith(`${CRYPTO_STORE_PREFIX}${userId}:`) &&
                            name !== targetCryptoDb) ||
                        (name.startsWith(`${SYNC_STORE_PREFIX}${userId}:`) &&
                            name !== targetSyncDb),
                );
        } catch {
            // indexedDB.databases() can throw in some browsers; fall through.
        }
    }

    await Promise.all([...legacyDbs, ...staleDbs].map(deleteIndexedDb));
};

/**
 * Returns a matrix-js-sdk TokenRefreshFunction bound to the active session's
 * baseUrl + userId. The SDK invokes this when an authenticated request comes
 * back with M_UNKNOWN_TOKEN; if we don't supply it the SDK logs "no refresh
 * token or refresh function" and forces logout.
 */
const buildTokenRefreshFunction = (session: StoredSession): TokenRefreshFunction => {
    return async (refreshToken: string): Promise<AccessTokens> => {
        const refreshUrl = new URL('/_matrix/client/v3/refresh', session.baseUrl);
        const response = await fetch(refreshUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) {
            throw new MatrixInitError(
                response.status === 429 ? 'rate_limited' : 'invalid_credentials',
                `Token refresh failed (${response.status}).`,
            );
        }
        const data = (await response.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in_ms?: number;
        };
        if (!data.access_token) {
            throw new MatrixInitError(
                'invalid_credentials',
                'Refresh response missing access token.',
            );
        }

        const nextRefreshToken = data.refresh_token ?? refreshToken;
        const expiresAt = data.expires_in_ms ? Date.now() + data.expires_in_ms : undefined;
        saveSession({
            baseUrl: session.baseUrl,
            accessToken: data.access_token,
            refreshToken: nextRefreshToken,
            userId: session.userId,
            deviceId: session.deviceId,
            expiresAt,
        });

        return {
            accessToken: data.access_token,
            refreshToken: nextRefreshToken,
            expiry: data.expires_in_ms ? new Date(Date.now() + data.expires_in_ms) : undefined,
        };
    };
};

const initClientForSession = async (session: StoredSession): Promise<MatrixClient> => {
    ensureValidHomeserver(session.baseUrl);

    await cleanupStaleStoresForUser(session.userId, session.deviceId);

    const syncStore = new IndexedDBStore({
        indexedDB: window.indexedDB,
        localStorage: window.localStorage,
        dbName: syncStoreDbName(session.userId, session.deviceId),
    });

    const cryptoStore = new IndexedDBCryptoStore(
        window.indexedDB,
        cryptoStoreDbName(session.userId, session.deviceId),
    );

    const client = createClient({
        baseUrl: session.baseUrl,
        userId: session.userId,
        deviceId: session.deviceId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenRefreshFunction: session.refreshToken
            ? buildTokenRefreshFunction(session)
            : undefined,
        store: syncStore,
        cryptoStore,
        timelineSupport: true,
        verificationMethods: ['m.sas.v1'],
        cryptoCallbacks,
        // Filters matrix-js-sdk's benign per-sync push-rule WARN flood; all other
        // logs pass through. See ./matrixLogger.
        logger: filteredMatrixLogger,
    });

    await syncStore.startup();
    await client.initRustCrypto();
    client.setMaxListeners(100);

    return client;
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
        const client = await initClientForSession(session);
        await startSyncWithRetry(client);
        applyAuthAtoms(store, client, 'logged_in');
        // Bridge the Matrix session into a Blackout API JWT so /v1/* features
        // (invitations, entitlements, …) are authenticated. Fire-and-forget:
        // chat must not block on the API server being reachable.
        void exchangeMatrixForBlackoutToken(session);
        return client;
    } catch (error) {
        const normalizedError = normalizeMatrixError(error);
        applyAuthAtoms(store, null, 'logged_out');
        throw normalizedError;
    }
};

export const stopMatrixClient = (client: MatrixClient | null): void => {
    client?.stopClient();
};

/**
 * Delete the IndexedDB sync + crypto stores for a (userId, deviceId) pair.
 * Used to purge a burner identity's local data when it's burned without having
 * to log that client in first (it may not be the active session).
 */
export const deleteSessionStores = async (userId: string, deviceId: string): Promise<void> => {
    await Promise.all([
        deleteIndexedDb(cryptoStoreDbName(userId, deviceId)),
        deleteIndexedDb(syncStoreDbName(userId, deviceId)),
    ]);
};

export const initClient = (session: StoredSession): Promise<MatrixClient> =>
    initClientForSession(session);

export const startClient = async (client: MatrixClient): Promise<void> => {
    await startSyncWithRetry(client);

    // Opt-in DevTools-console hook for diagnosing sync state. Enable with
    //   localStorage.setItem('blackoutDebug', '1')
    // then reload, and `window.mxClient` exposes the live MatrixClient.
    if (window.localStorage.getItem('blackoutDebug') === '1') {
        (window as unknown as { mxClient: MatrixClient }).mxClient = client;
    }
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
    const userId = client.getUserId();
    const deviceId = client.getDeviceId();
    if (userId) {
        await Promise.all([
            ...(deviceId
                ? [
                      deleteIndexedDb(cryptoStoreDbName(userId, deviceId)),
                      deleteIndexedDb(syncStoreDbName(userId, deviceId)),
                  ]
                : []),
            deleteIndexedDb(`${CRYPTO_STORE_PREFIX}${userId}`),
            deleteIndexedDb(`${SYNC_STORE_PREFIX}${userId}`),
        ]);
    }
    clearSession(userId ?? undefined);
};

export const clearCacheAndReload = async (client: MatrixClient): Promise<void> => {
    stopMatrixClient(client);
    await client.clearStores();
    window.location.reload();
};
