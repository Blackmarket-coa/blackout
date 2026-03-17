import { resolveMatrixHomeserverUrl } from "./config";

export const blackoutWebConfig = {
  homeserverUrl: resolveMatrixHomeserverUrl({
    VITE_MATRIX_HOMESERVER_URL: undefined,
    BLACKOUT_SERVER_URL: undefined,
  }),
  mode: "daily-chat",
} as const;
