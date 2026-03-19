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

export const loadSessionMap = (): SessionMap => {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return createEmptySessionMap();

    const parsed = JSON.parse(raw) as Partial<SessionMap>;
    if (!parsed || typeof parsed !== 'object') return createEmptySessionMap();

    const sessions = Object.entries(parsed.sessions ?? {}).reduce<Record<string, StoredSession>>(
      (acc, [userId, session]) => {
        if (isStoredSession(session)) acc[userId] = session;
        return acc;
      },
      {},
    );

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
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionMap));
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
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
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
