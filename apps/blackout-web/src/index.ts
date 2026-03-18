import { resolveMatrixHomeserverUrl } from "./config";

export const blackoutWebConfig = {
  homeserverUrl: resolveMatrixHomeserverUrl({
    VITE_MATRIX_HOMESERVER_URL: import.meta.env.VITE_MATRIX_HOMESERVER_URL,
    BLACKOUT_SERVER_URL: (import.meta.env as Record<string, string | undefined>).BLACKOUT_SERVER_URL,
  }),
  mode: "daily-chat",
} as const;
