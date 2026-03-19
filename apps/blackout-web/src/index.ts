import { resolveBlackoutRuntimeConfig } from "./config";

export const blackoutWebConfig = resolveBlackoutRuntimeConfig({
  VITE_MATRIX_HOMESERVER_URL: import.meta.env.VITE_MATRIX_HOMESERVER_URL,
  BLACKOUT_SERVER_URL: (import.meta.env as Record<string, string | undefined>).BLACKOUT_SERVER_URL,
  VITE_FEATURE_DEPLOYMENT_DEFAULTS: (import.meta.env as Record<string, string | undefined>).VITE_FEATURE_DEPLOYMENT_DEFAULTS,
  VITE_FEATURE_TENANT_POLICY: (import.meta.env as Record<string, string | undefined>).VITE_FEATURE_TENANT_POLICY,
  VITE_FEATURE_USER_OVERRIDES: (import.meta.env as Record<string, string | undefined>).VITE_FEATURE_USER_OVERRIDES,
});
