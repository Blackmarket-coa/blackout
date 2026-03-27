import { resolveMatrixHomeserverUrl } from "./config";

export const blackoutGovConfig = {
  homeserverUrl: resolveMatrixHomeserverUrl({
    VITE_MATRIX_HOMESERVER_URL: undefined,
    BLACKOUT_SERVER_URL: undefined,
  }),
  mode: "governance",
} as const;
