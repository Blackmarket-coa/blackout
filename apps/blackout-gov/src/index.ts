import { resolveMatrixHomeserverUrl, type GovernanceRuntimeConfig } from "./config";

export const blackoutGovConfig: GovernanceRuntimeConfig = {
  homeserverUrl: resolveMatrixHomeserverUrl({
    VITE_MATRIX_HOMESERVER_URL: import.meta.env.VITE_MATRIX_HOMESERVER_URL,
    BLACKOUT_SERVER_URL: import.meta.env.BLACKOUT_SERVER_URL,
  }),
  mode: "governance",
};
