// ═══════════════════════════════════════════════════════
// SESSION STORAGE
// Platform-agnostic interface for persisting auth sessions.
// Mobile implements with expo-secure-store.
// Web implements with localStorage (or IndexedDB).
// ═══════════════════════════════════════════════════════

export type BlackoutSession = {
  userId: string;
  accessToken: string;
  deviceId: string;
  homeserverUrl: string;
};

/**
 * Storage backend interface.
 * Each platform provides its own implementation.
 */
export interface SessionStorage {
  save(session: BlackoutSession): Promise<void>;
  restore(): Promise<BlackoutSession | null>;
  clear(): Promise<void>;
}

/**
 * In-memory fallback (for testing or when no persistent storage is available).
 */
export function createMemorySessionStorage(): SessionStorage {
  let stored: BlackoutSession | null = null;

  return {
    async save(session) {
      stored = { ...session };
    },
    async restore() {
      return stored ? { ...stored } : null;
    },
    async clear() {
      stored = null;
    },
  };
}
