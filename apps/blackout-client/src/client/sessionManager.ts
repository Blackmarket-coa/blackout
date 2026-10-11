import { storageNamespace } from './storageNamespace';
import { isSessionLength, type SessionLength } from './sessionLength';

export interface StoredSession {
    baseUrl: string;
    accessToken: string;
    refreshToken?: string;
    userId: string;
    deviceId: string;
    expiresAt?: number;
    /**
     * Chat panel only (launch-plan B3): the length chosen at sign-in. The
     * servers enforce it; this copy drives the panel's own sign-out timer and
     * header text.
     */
    sessionLength?: SessionLength;
    /** Chat panel only: when the session ends, in ms on this device's clock. */
    sessionEndsAt?: number;
}

export interface SessionMap {
    activeUserId: string | null;
    sessions: Record<string, StoredSession>;
}

// The full app's key is 'blackout.matrix.sessions.v1'; the chat panel with
// B3's client switch on keeps its sessions under its own key (see
// storageNamespace). With the switch off the panel uses the full app's key.
const sessionStorageKey = (): string => storageNamespace().sessionMapKey;

const createEmptySessionMap = (): SessionMap => ({
    activeUserId: null,
    sessions: {},
});

/**
 * Chat panel with B3's client switch on: a garbled session length or end must
 * not read as "no end", so such a session is dropped (the servers end it on
 * time regardless). Elsewhere the fields are not read, and are not checked.
 */
const hasValidPanelFields = (candidate: Partial<StoredSession>): boolean =>
    !storageNamespace().embed ||
    ((candidate.sessionLength === undefined || isSessionLength(candidate.sessionLength)) &&
        (candidate.sessionEndsAt === undefined ||
            (typeof candidate.sessionEndsAt === 'number' &&
                Number.isFinite(candidate.sessionEndsAt))));

const isStoredSession = (value: unknown): value is StoredSession => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StoredSession>;
    return (
        typeof candidate.baseUrl === 'string' &&
        typeof candidate.accessToken === 'string' &&
        typeof candidate.userId === 'string' &&
        typeof candidate.deviceId === 'string' &&
        hasValidPanelFields(candidate)
    );
};

export const loadSessionMap = (): SessionMap => {
    try {
        const raw = window.localStorage.getItem(sessionStorageKey());
        if (!raw) return createEmptySessionMap();

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
    } catch {
        return createEmptySessionMap();
    }
};

export const saveSessionMap = (sessionMap: SessionMap): void => {
    window.localStorage.setItem(sessionStorageKey(), JSON.stringify(sessionMap));
};

export const saveSession = (session: StoredSession): void => {
    const sessionMap = loadSessionMap();
    sessionMap.sessions[session.userId] = session;
    sessionMap.activeUserId = session.userId;
    saveSessionMap(sessionMap);
};

export const restoreActiveSession = (): StoredSession | null => {
    const { activeUserId, sessions } = loadSessionMap();
    if (!activeUserId) return null;
    return sessions[activeUserId] ?? null;
};

export const getSessionForUser = (userId: string): StoredSession | null => {
    return loadSessionMap().sessions[userId] ?? null;
};

export const setActiveSessionUser = (userId: string): void => {
    const sessionMap = loadSessionMap();
    if (!sessionMap.sessions[userId]) return;
    sessionMap.activeUserId = userId;
    saveSessionMap(sessionMap);
};

export const clearSession = (userId?: string): void => {
    if (!userId) {
        window.localStorage.removeItem(sessionStorageKey());
        return;
    }

    const sessionMap = loadSessionMap();
    delete sessionMap.sessions[userId];

    if (sessionMap.activeUserId === userId) {
        const nextUserId = Object.keys(sessionMap.sessions)[0] ?? null;
        sessionMap.activeUserId = nextUserId;
    }

    saveSessionMap(sessionMap);
};
