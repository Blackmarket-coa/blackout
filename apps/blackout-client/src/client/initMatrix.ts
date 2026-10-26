import '@matrix-org/matrix-sdk-crypto-wasm';
import {
    createClient,
    HttpApiEvent,
    IndexedDBCryptoStore,
    IndexedDBStore,
    TokenRefreshLogoutError,
    type MatrixClient,
    type MatrixError,
} from 'matrix-js-sdk';
import { type AccessTokens, type TokenRefreshFunction } from 'matrix-js-sdk/lib/http-api';
import { createStore } from 'jotai/vanilla';
import {
    authStateAtom,
    matrixClientAtom,
    panelSignedOutReasonAtom,
    userIdAtom,
    type AuthState,
    type PanelSignedOutReason,
} from '../app/state/auth';
import {
    clearSession,
    restoreActiveSession,
    saveSession,
    type StoredSession,
} from './sessionManager';
import {
    clearBlackoutApiToken,
    exchangeMatrixForBlackoutToken,
    revokeBlackoutApiToken,
} from './blackoutApiSession';
import { storageNamespace } from './storageNamespace';
import { isTimedSessionLength, MAX_TIMER_DELAY_MS, signOutDeviceByToken } from './sessionLength';
import { cryptoCallbacks } from './secretStorageKeys';
import { startEncryptionHealthTracking, stopEncryptionHealthTracking } from './encryptionHealth';
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
    | 'session_length_unavailable'
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

// 'blackout-sync-store:' / 'blackout-crypto-store:' in the full app; the chat
// panel uses its own names (see storageNamespace).
const syncStorePrefix = (): string => storageNamespace().syncStorePrefix;
const cryptoStorePrefix = (): string => storageNamespace().cryptoStorePrefix;

const cryptoStoreDbName = (userId: string, deviceId: string): string =>
    `${cryptoStorePrefix()}${userId}:${deviceId}`;

const syncStoreDbName = (userId: string, deviceId: string): string =>
    `${syncStorePrefix()}${userId}:${deviceId}`;

/**
 * matrix-js-sdk's IndexedDBStore opens `matrix-js-sdk:<dbName>`, not `<dbName>`
 * (`lib/store/indexeddb-local-backend.js`), so the sync store's real database
 * carries this prefix.
 */
const SDK_SYNC_DB_PREFIX = 'matrix-js-sdk:';

/** The Rust crypto store's two IndexedDB databases for a prefix (the SDK's naming). */
const rustCryptoDbNames = (prefix: string): string[] => [
    `${prefix}::matrix-sdk-crypto`,
    `${prefix}::matrix-sdk-crypto-meta`,
];

/**
 * `client.clearStores()` with the Rust crypto store name this page uses: the
 * SDK default in the full app (so the call is unchanged there), the
 * per-device name in the chat panel.
 */
export const clearClientStores = async (client: MatrixClient): Promise<void> => {
    const userId = client.getUserId();
    const deviceId = client.getDeviceId();
    const prefix =
        userId && deviceId ? storageNamespace().rustCryptoPrefix(userId, deviceId) : undefined;
    await (prefix === undefined
        ? client.clearStores()
        : client.clearStores({ cryptoDatabasePrefix: prefix }));
};

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
const cleanupStaleStoresForUser = async (userId: string, activeDeviceId: string): Promise<void> => {
    const targetCryptoDb = cryptoStoreDbName(userId, activeDeviceId);
    const targetSyncDb = syncStoreDbName(userId, activeDeviceId);

    // Always remove the legacy un-suffixed databases from earlier builds.
    const legacyDbs = [`${cryptoStorePrefix()}${userId}`, `${syncStorePrefix()}${userId}`];
    // The chat panel's Rust crypto stores are per device; prune other devices'.
    const rustUserPrefix = storageNamespace().rustCryptoUserPrefix(userId);
    const activeRustPrefix = storageNamespace().rustCryptoPrefix(userId, activeDeviceId);

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
                        (name.startsWith(`${cryptoStorePrefix()}${userId}:`) &&
                            name !== targetCryptoDb) ||
                        (name.startsWith(`${syncStorePrefix()}${userId}:`) &&
                            name !== targetSyncDb) ||
                        (rustUserPrefix !== undefined &&
                            name.startsWith(rustUserPrefix) &&
                            !(
                                activeRustPrefix !== undefined &&
                                name.startsWith(`${activeRustPrefix}::`)
                            )) ||
                        // The panel also prunes its sync stores under the
                        // name the SDK really gives them. (The full app's
                        // filter above never matches that name; unchanged here.)
                        (storageNamespace().embed &&
                            name.startsWith(
                                `${SDK_SYNC_DB_PREFIX}${syncStorePrefix()}${userId}:`
                            ) &&
                            name !== `${SDK_SYNC_DB_PREFIX}${targetSyncDb}`)
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
            // The homeserver refuses a deleted device's refresh token with 401
            // M_UNKNOWN_TOKEN and an expired one with 403 M_FORBIDDEN: the
            // session is over. matrix-js-sdk signs the client out only when this
            // function throws a MatrixError or a TokenRefreshLogoutError; any
            // other error counts as transient and it keeps retrying, so an open
            // panel did not notice its device being deleted elsewhere (D1 in
            // docs/black-mask-account-link-design.md §7). Rate limiting and
            // server errors stay transient.
            if (response.status === 401 || response.status === 403) {
                const body = (await response.json().catch(() => ({}))) as { errcode?: string };
                const errcode = typeof body.errcode === 'string' ? ` ${body.errcode}` : '';
                throw new TokenRefreshLogoutError(
                    new Error(`Token refresh refused (${response.status}${errcode}).`)
                );
            }
            throw new MatrixInitError(
                response.status === 429 ? 'rate_limited' : 'invalid_credentials',
                `Token refresh failed (${response.status}).`
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
                'Refresh response missing access token.'
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
            // A chat panel session (B3's client switch on) keeps its chosen
            // length across refreshes.
            ...(storageNamespace().embed && session.sessionLength !== undefined
                ? { sessionLength: session.sessionLength, sessionEndsAt: session.sessionEndsAt }
                : {}),
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
        cryptoStoreDbName(session.userId, session.deviceId)
    );

    const client = createClient({
        baseUrl: session.baseUrl,
        userId: session.userId,
        deviceId: session.deviceId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenRefreshFunction: session.refreshToken ? buildTokenRefreshFunction(session) : undefined,
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
    const rustCryptoPrefix = storageNamespace().rustCryptoPrefix(session.userId, session.deviceId);
    await (rustCryptoPrefix === undefined
        ? client.initRustCrypto()
        : client.initRustCrypto({ cryptoDatabasePrefix: rustCryptoPrefix }));
    client.setMaxListeners(100);

    // BO-1: keep the key-backup / cross-signing posture readable by the
    // synchronous diagnostics collector. Fire-and-forget; never blocks boot.
    startEncryptionHealthTracking(client);

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

/**
 * Local teardown for a session the homeserver has invalidated
 * (M_UNKNOWN_TOKEN with no way to refresh). matrix-js-sdk emits
 * `HttpApiEvent.SessionLoggedOut` in that case and stops syncing; without a
 * handler the app zombies along on cached data while every authenticated
 * request (homeserver + `/v1/*` via the Matrix→Blackout exchange) 401s.
 *
 * Mirrors the local-cleanup half of `auth.ts`'s `logout()` — but deliberately
 * skips `client.logout()` (the token is already dead) and, in the full app,
 * `clearStores()` (keeping the IndexedDB crypto store preserves megolm keys
 * for the next login; stale stores are pruned by `cleanupStaleStoresForUser`
 * anyway). The chat panel with B3's client switch on does clear its stores
 * (see below); with the switch off it behaves as the full app.
 * Dropping the stored session means a reload lands on the sign-in card
 * instead of re-entering the zombie state.
 */
export const handleSessionLoggedOut = (store: AtomStore, client: MatrixClient): void => {
    stopMatrixClient(client);
    // The chat panel (B3's client switch on) also asks the API to refuse its
    // API token, and drops one an exchange still running would mint; the
    // local part is immediate, the request is not awaited.
    if (storageNamespace().embed) void revokeBlackoutApiToken();
    else clearBlackoutApiToken();
    const userId = client.getUserId();
    clearSession(userId ?? undefined);
    applyAuthAtoms(store, null, 'logged_out');
    if (storageNamespace().embed) {
        // The chat panel (B3's client switch on) also deletes what the dead
        // session stored in this browser: a panel sign-in may be on a shared or
        // borrowed device, and the device is gone on the server, so nothing
        // here is reusable.
        clearPanelSessionTimer();
        store.set(panelSignedOutReasonAtom, 'signed_out');
        const deviceId = client.getDeviceId();
        void clearClientStores(client).catch(() => undefined);
        if (userId && deviceId) void deletePanelSessionData(userId, deviceId);
    }
};

/** Delete one device's IndexedDB stores, including the panel's per-device Rust crypto store. */
const deletePanelSessionData = async (userId: string, deviceId: string): Promise<void> => {
    const rustPrefix = storageNamespace().rustCryptoPrefix(userId, deviceId);
    await Promise.all([
        deleteIndexedDb(cryptoStoreDbName(userId, deviceId)),
        deleteIndexedDb(syncStoreDbName(userId, deviceId)),
        // The sync store's real database (the timeline cache).
        deleteIndexedDb(`${SDK_SYNC_DB_PREFIX}${syncStoreDbName(userId, deviceId)}`),
        ...(rustPrefix === undefined ? [] : rustCryptoDbNames(rustPrefix).map(deleteIndexedDb)),
    ]);
};

let panelSessionTimer: number | undefined;

/** Stop the chat panel's own end-of-session timer (on sign-out, or a new session). */
export const clearPanelSessionTimer = (): void => {
    if (panelSessionTimer !== undefined) window.clearTimeout(panelSessionTimer);
    panelSessionTimer = undefined;
};

/**
 * Chat panel only (launch-plan B3): sign this device out because its session
 * is over. The servers enforce the end on their own — the homeserver refuses
 * the device's tokens from the end on and deletes the device, and the
 * Blackout API refuses its tokens too — so this is the panel catching up:
 * stop syncing, end the device on the server now if it is still there (logout
 * is accepted with an expired token), delete what the session stored in this
 * browser, and say why.
 */
export const endPanelSession = async (
    store: AtomStore,
    client: MatrixClient | null,
    session: StoredSession,
    reason: PanelSignedOutReason
): Promise<void> => {
    clearPanelSessionTimer();
    if (client) {
        client.removeAllListeners(HttpApiEvent.SessionLoggedOut);
        stopMatrixClient(client);
        try {
            await client.logout();
        } catch {
            // Already gone on the server (refused or swept): nothing to end.
        }
        try {
            await clearClientStores(client);
        } catch {
            // Deleted below by name as well.
        }
    } else {
        // Found already past its end (the panel was closed when it came): end
        // the device on the server now rather than leaving it for the sweep.
        // Not awaited: the signed-out panel must not wait on the network.
        void signOutDeviceByToken(session.baseUrl, session.accessToken);
    }
    await deletePanelSessionData(session.userId, session.deviceId);
    // Only touch the stored session and the screen if this is still the
    // session on show; never sign out a newer one.
    const stored = restoreActiveSession();
    if (stored && (stored.userId !== session.userId || stored.deviceId !== session.deviceId)) {
        return;
    }
    clearSession(session.userId);
    // Refuse the panel's API token on the API too (not awaited), and drop one
    // an exchange still running would mint.
    void revokeBlackoutApiToken();
    store.set(panelSignedOutReasonAtom, reason);
    applyAuthAtoms(store, null, 'logged_out');
};

/** Re-arm in steps no longer than `setTimeout` allows (30-day sessions exceed it). */
const schedulePanelSessionEnd = (
    store: AtomStore,
    client: MatrixClient,
    session: StoredSession
): void => {
    clearPanelSessionTimer();
    const endsAt = session.sessionEndsAt;
    if (endsAt === undefined) return;
    const tick = (): void => {
        const remaining = endsAt - Date.now();
        if (remaining <= 0) {
            panelSessionTimer = undefined;
            void endPanelSession(store, client, session, 'session_ended');
            return;
        }
        panelSessionTimer = window.setTimeout(tick, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };
    tick();
};

const hasEnded = (session: StoredSession): boolean =>
    session.sessionEndsAt !== undefined && session.sessionEndsAt <= Date.now();

/**
 * Chat panel (B3's client switch on): may this stored session run? Only with a
 * chosen length, and, for a timed length, with the end the panel's own timer
 * counts down to. Sign-in never stores anything else; a session found without
 * them (a sign-in path that lost the length, or altered storage) is ended
 * rather than run with no end.
 */
const hasUsablePanelLength = (session: StoredSession): boolean => {
    if (session.sessionLength === undefined) return false;
    return !isTimedSessionLength(session.sessionLength) || session.sessionEndsAt !== undefined;
};

export const initMatrixFromStoredSession = async (
    store: AtomStore
): Promise<MatrixClient | null> => {
    applyAuthAtoms(store, null, 'loading');

    const session = restoreActiveSession();
    if (!session) {
        applyAuthAtoms(store, null, 'logged_out');
        return null;
    }

    // Only the chat panel with B3's client switch on reads a session's length
    // (the full app, and the panel with the switch off, start the session as
    // before B3). Past its end, never start the session again from this
    // browser: clean up and land on the signed-out panel. Without a usable
    // length, end it the same way rather than run it with no end.
    const panel = storageNamespace().embed;
    if (panel && hasEnded(session)) {
        await endPanelSession(store, null, session, 'session_ended');
        return null;
    }
    if (panel && !hasUsablePanelLength(session)) {
        await endPanelSession(store, null, session, 'signed_out');
        return null;
    }

    try {
        const client = await initClientForSession(session);
        client.once(HttpApiEvent.SessionLoggedOut, () => handleSessionLoggedOut(store, client));
        await startSyncWithRetry(client);
        applyAuthAtoms(store, client, 'logged_in');
        if (panel) {
            store.set(panelSignedOutReasonAtom, null);
            if (session.sessionEndsAt !== undefined) {
                schedulePanelSessionEnd(store, client, session);
            }
        }
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
    // Reset BO-1 health tracking first so a report filed after logout reads
    // "unsampled" instead of the dead session's posture.
    stopEncryptionHealthTracking(client);
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

    await clearClientStores(client);
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
            deleteIndexedDb(`${cryptoStorePrefix()}${userId}`),
            deleteIndexedDb(`${syncStorePrefix()}${userId}`),
        ]);
    }
    clearSession(userId ?? undefined);
};

export const clearCacheAndReload = async (client: MatrixClient): Promise<void> => {
    stopMatrixClient(client);
    await clearClientStores(client);
    window.location.reload();
};
