export interface SessionState {
  token: string | null;
  userId: string | null;
}

const state: SessionState = {
  token: null,
  userId: null,
};

const listeners = new Set<(session: SessionState) => void>();

export function getSession() {
  return state;
}

export function setSession(token: string, userId: string) {
  state.token = token;
  state.userId = userId;
  listeners.forEach((listener) => listener(state));
}

export function clearSession() {
  state.token = null;
  state.userId = null;
  listeners.forEach((listener) => listener(state));
}

export function subscribeSession(listener: (session: SessionState) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
