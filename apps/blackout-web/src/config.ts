const DEFAULT_HOMESERVER_URL = "https://matrix.blackout.local";

function normalizeRailwayReference(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;

  const railwayMatch = trimmed.match(/^railway:(?<service>[a-z0-9-_.]+)$/i);
  if (railwayMatch?.groups?.service) {
    return `https://${railwayMatch.groups.service}.up.railway.app`;
  }

  return trimmed;
}

export function resolveMatrixHomeserverUrl(env: Record<string, string | undefined>): string {
  const candidate = env.VITE_MATRIX_HOMESERVER_URL ?? env.BLACKOUT_SERVER_URL;
  if (!candidate) return DEFAULT_HOMESERVER_URL;

  const normalized = normalizeRailwayReference(candidate);
  if (!normalized.startsWith("https://") && !normalized.startsWith("http://")) {
    return `https://${normalized}`;
  }
  return normalized;
}
