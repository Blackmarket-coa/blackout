const DEFAULT_HOMESERVER_URL = "https://matrix.theblackout.app";

export function resolveMatrixHomeserverUrl(env: Record<string, string | undefined>): string {
  const candidate = env.VITE_MATRIX_HOMESERVER_URL ?? env.BLACKOUT_SERVER_URL;
  if (!candidate) return DEFAULT_HOMESERVER_URL;

  const trimmed = candidate.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  return `https://${trimmed}`;
}

export interface GovernanceRuntimeConfig {
  homeserverUrl: string;
  mode: "governance";
}
