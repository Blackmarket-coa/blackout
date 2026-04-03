// ═══════════════════════════════════════════════════════
// useAuth Hook
// Manages authentication state for Blackout.
// Works on both mobile (SecureStore) and web (localStorage).
// ═══════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import type { MatrixClient } from "matrix-js-sdk";
import {
  createBlackoutClient,
  loginWithPassword,
  startSync,
  logout as matrixLogout,
} from "../client";
import type { SessionStorage, BlackoutSession } from "../session";

export type AuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
  client: MatrixClient | null;
  userId: string | null;
  error: string | null;
};

export type AuthActions = {
  login: (homeserverUrl: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
};

export function useAuth(storage: SessionStorage): AuthState & AuthActions {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    client: null,
    userId: null,
    error: null,
  });

  const clientRef = useRef<MatrixClient | null>(null);

  // Attempt to restore a saved session on mount
  const restoreSession = useCallback(async () => {
    setState((s: AuthState) => ({ ...s, isLoading: true, error: null }));

    try {
      const session = await storage.restore();
      if (!session) {
        setState((s: AuthState) => ({ ...s, isLoading: false }));
        return;
      }

      const client = createBlackoutClient({
        homeserverUrl: session.homeserverUrl,
        accessToken: session.accessToken,
        userId: session.userId,
        deviceId: session.deviceId,
      });

      startSync(client);
      clientRef.current = client;

      setState({
        isLoading: false,
        isAuthenticated: true,
        client,
        userId: session.userId,
        error: null,
      });
    } catch (err) {
      await storage.clear();
      setState({
        isLoading: false,
        isAuthenticated: false,
        client: null,
        userId: null,
        error: "Session expired. Please log in again.",
      });
    }
  }, [storage]);

  // Login with credentials
  const login = useCallback(
    async (homeserverUrl: string, username: string, password: string) => {
      setState((s: AuthState) => ({ ...s, isLoading: true, error: null }));

      try {
        const client = createBlackoutClient({ homeserverUrl });
        const session = await loginWithPassword(client, username, password);

        await storage.save(session);
        startSync(client);
        clientRef.current = client;

        setState({
          isLoading: false,
          isAuthenticated: true,
          client,
          userId: session.userId,
          error: null,
        });
      } catch (err: any) {
        setState((s: AuthState) => ({
          ...s,
          isLoading: false,
          error: err?.data?.error || err?.message || "Login failed",
        }));
      }
    },
    [storage]
  );

  // Logout
  const logout = useCallback(async () => {
    if (clientRef.current) {
      try {
        await matrixLogout(clientRef.current);
      } catch {
        // Best-effort logout
      }
      clientRef.current = null;
    }

    await storage.clear();

    setState({
      isLoading: false,
      isAuthenticated: false,
      client: null,
      userId: null,
      error: null,
    });
  }, [storage]);

  // Auto-restore on mount
  useEffect(() => {
    restoreSession();
    return () => {
      if (clientRef.current) {
        clientRef.current.stopClient();
      }
    };
  }, []);

  return { ...state, login, logout, restoreSession };
}
