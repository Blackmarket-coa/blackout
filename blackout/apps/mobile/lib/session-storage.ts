// ═══════════════════════════════════════════════════════
// MOBILE SESSION STORAGE
// Uses expo-secure-store for encrypted token persistence.
// ═══════════════════════════════════════════════════════

import * as SecureStore from "expo-secure-store";
import type { SessionStorage, BlackoutSession } from "@blackout/core";

const STORAGE_KEY = "blackout_session";

export const secureSessionStorage: SessionStorage = {
  async save(session: BlackoutSession) {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
  },

  async restore(): Promise<BlackoutSession | null> {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async clear() {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  },
};
