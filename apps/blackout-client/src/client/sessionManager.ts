import {
    initSessionCrypto,
    securelyStoreSession,
    securelyLoadSession,
    loadEncryptedBlob,
    clearSecureSession,
} from './sessionCrypto';

export interface StoredSession {
    baseUrl: string;
    accessToken: string;
    refreshToken?: string;
    userId: string;
    deviceId: string;
    expiresAt?: number;
}

export interface SessionMap {
    activeUserId: string | null;
    sessions: Record<string, StoredSession>;
}

const SESSION_STORAGE_KEY = 'blackout.matrix.sessions.v1';

const createEmptySessionMap = (): SessionMap => ({
    activeUserId: null,
    sessions: {},
});

const isStoredSession = (value: unknown): value is StoredSession => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StoredSession>;
    return (
        typeof candidate.baseUrl === 'string' &&
        typeof candidate.accessToken === 'string' &&
        typeof candidate.userId === 'string' &&
        typeof candidate.deviceId === 'string'
    );
};

let cachedSessionMap: SessionMap | null = null;

const parseSessionMapFromJson = (raw: string): SessionMap => {
    const parsed = JSON.parse(raw) as Partial<SessionMap>;
    if (!parsed || typeof parsed !== 'object') return createEmptySessionMap();

    const sessions = Object.entries(parsed.sessions ?? {}).reduce<
        Record<string, StoredSession>
    >((acc, [userId, session]) => {
        if (isStoredSession(session)) acc[userId] = session;
        return acc;
    }, {});

    const activeUserId =
        typeof parsed.activeUserId === 'string' && sessions[parsed.activeUserId]
            ? parsed.activeUserId
            : null;

    return { activeUserId, sessions };
};

const tryLoadUnencryptedSession = (): SessionMap | null => {
    try {
        const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return null;
        return parseSessionMapFromJson(raw);
    } catch {
        return null;
    }
};

const hasEncryptedSession = (): boolean => loadEncryptedBlob() !== null;

export const initSessionManager = async (): Promise<void> => {
    await initSessionCrypto();

    if (hasEncryptedSession()) {
        const encrypted = await securelyLoadSession();
        if (encrypted) {
            try {
                cachedSessionMap = parseSessionMapFromJson(encrypted);
                return;
            } catch {
                cachedSessionMap = createEmptySessionMap();
            }
        }
    }

    const unencrypted = tryLoadUnencryptedSession();
    if (unencrypted) {
        cachedSessionMap = unencrypted;
        await securelyStoreSession(JSON.stringify(unencrypted));
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        return;
    }

    cachedSessionMap = createEmptySessionMap();
};

const getSessionMap = (): SessionMap => {
    if (cachedSessionMap) return cachedSessionMap;
    cachedSessionMap = createEmptySessionMap();
    return cachedSessionMap;
};

const persistSessionMap = (sessionMap: SessionMap): void => {
    cachedSessionMap = sessionMap;
    securelyStoreSession(JSON.stringify(sessionMap)).catch(() => {
        // Fallback: write unencrypted so data is not lost on crypto failure
        try {
            window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionMap));
        } catch {
            // Best effort
        }
    });
};

export const loadSessionMap = (): SessionMap => getSessionMap();

export const saveSessionMap = (sessionMap: SessionMap): void => {
    persistSessionMap(sessionMap);
};

export const saveSession = (session: StoredSession): void => {
    const sessionMap = getSessionMap();
    sessionMap.sessions[session.userId] = session;
    sessionMap.activeUserId = session.userId;
    persistSessionMap(sessionMap);
};

export const restoreActiveSession = (): StoredSession | null => {
    const { activeUserId, sessions } = getSessionMap();
    if (!activeUserId) return null;
    return sessions[activeUserId] ?? null;
};

export const getSessionForUser = (userId: string): StoredSession | null => {
    return getSessionMap().sessions[userId] ?? null;
};

export const setActiveSessionUser = (userId: string): void => {
    const sessionMap = getSessionMap();
    if (!sessionMap.sessions[userId]) return;
    sessionMap.activeUserId = userId;
    persistSessionMap(sessionMap);
};

export const clearSession = async (userId?: string): Promise<void> => {
    if (!userId) {
        await clearSecureSession();
        cachedSessionMap = createEmptySessionMap();
        return;
    }

    const sessionMap = getSessionMap();
    delete sessionMap.sessions[userId];

    if (sessionMap.activeUserId === userId) {
        const nextUserId = Object.keys(sessionMap.sessions)[0] ?? null;
        sessionMap.activeUserId = nextUserId;
    }

    persistSessionMap(sessionMap);
};
