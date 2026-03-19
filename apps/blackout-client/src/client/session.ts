export interface SessionSnapshot {
  accessToken: string;
  userId: string;
  deviceId: string;
  baseUrl: string;
}

export const SESSION_STORAGE_KEY = 'blackout.session';

export const loadSession = (): SessionSnapshot | null => {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as SessionSnapshot;
};

export const saveSession = (snapshot: SessionSnapshot): void => {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
};

export const clearSession = (): void => {
  localStorage.removeItem(SESSION_STORAGE_KEY);
};
