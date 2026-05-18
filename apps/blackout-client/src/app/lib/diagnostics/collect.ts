import packageJson from '../../../../package.json';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
import { getConsoleTail, getLastError } from './consoleCapture';

export interface CollectedDiagnostics {
  readonly clientVersion: string;
  readonly userAgent: string;
  readonly platform: string;
  readonly consoleTail: string[];
  readonly currentPath: string;
  readonly buildChannel: string;
  readonly lastError: string | null;
  readonly featureFlagsFingerprint: string;
}

const safeNavigator = (): Navigator | null => {
  try {
    return typeof navigator !== 'undefined' ? navigator : null;
  } catch {
    return null;
  }
};

// Path-only (no query, no fragment). Matrix auth flows historically put
// `access_token` in the URL fragment; query strings may carry OAuth state or
// redirect URLs we don't want in a public GitHub issue.
const safePathOnly = (): string => {
  try {
    return typeof window !== 'undefined' && window.location
      ? window.location.pathname
      : 'unknown';
  } catch {
    return 'unknown';
  }
};

const safeBuildChannel = (): string => {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
    return env.MODE ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

// djb2 — same shape as the client-side hasher in sentry/init.ts. Sufficient for
// "give me a short identifier for this flag fingerprint" — not cryptographic.
const djb2 = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const computeFeatureFlagsFingerprint = (): string => {
  try {
    const entries = Object.entries(runtimeFeatureFlags as unknown as Record<string, unknown>)
      .map(([k, v]) => `${k}:${String(v)}`)
      .sort();
    return `ff:${djb2(entries.join(','))}`;
  } catch {
    return 'ff:unknown';
  }
};

export const collectDiagnostics = (): CollectedDiagnostics => {
  const nav = safeNavigator();
  return {
    clientVersion: typeof packageJson.version === 'string' ? packageJson.version : 'unknown',
    userAgent: nav?.userAgent ?? 'unknown',
    platform: nav?.platform ?? 'unknown',
    consoleTail: getConsoleTail(),
    currentPath: safePathOnly(),
    buildChannel: safeBuildChannel(),
    lastError: getLastError(),
    featureFlagsFingerprint: computeFeatureFlagsFingerprint(),
  };
};
