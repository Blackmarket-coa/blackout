import type { Session } from "../types";

const SESSION_STORAGE_KEY = "blackout.web.session";

export class SessionStore {
  load(): Session | null {
    const raw = globalThis.localStorage?.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Session;
      if (!parsed.jwt || !parsed.user?.id || !parsed.user?.username) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  save(session: Session): void {
    globalThis.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  clear(): void {
    globalThis.localStorage?.removeItem(SESSION_STORAGE_KEY);
  }
}
