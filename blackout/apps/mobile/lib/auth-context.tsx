import React, { createContext, useContext } from "react";
import { useAuth, type AuthState, type AuthActions } from "@blackout/core";
import { secureSessionStorage } from "./session-storage";

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth(secureSessionStorage);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useBlackoutAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useBlackoutAuth must be used within AuthProvider");
  return ctx;
}
