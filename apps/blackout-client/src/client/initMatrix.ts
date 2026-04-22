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
import { clearSession, restoreActiveSession, type StoredSession } from './sessionManager';

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

const initClientForSession = async (session: StoredSession): Promise<MatrixClient> => {
    ensureValidHomeserver(session.baseUrl);

    const syncStore = new IndexedDBStore({
        indexedDB: window.indexedDB,
        localStorage: window.localStorage,
        dbName: `blackout-sync-store:${session.userId}`,
    });

    const cryptoStore = new IndexedDBCryptoStore(
        window.indexedDB,
        `blackout-crypto-store:${session.userId}`,
    );

    const client = createClient({
        baseUrl: session.baseUrl,
        userId: session.userId,
        deviceId: session.deviceId,
        accessToken: session.accessToken,
        store: syncStore,
        cryptoStore,
        timelineSupport: true,
        verificationMethods: ['m.sas.v1'],
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
    initClientForSession(session);

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
