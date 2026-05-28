import {
    clearSession as clearPersistedSession,
    restoreActiveSession,
    saveSession,
    type StoredSession,
} from './sessionManager';

export type SessionSnapshot = StoredSession;

export const loadSession = (): SessionSnapshot | null => restoreActiveSession();

export const saveSessionSnapshot = (snapshot: SessionSnapshot): void => {
    saveSession(snapshot);
};

export const clearSession = async (): Promise<void> => {
    await clearPersistedSession();
};
