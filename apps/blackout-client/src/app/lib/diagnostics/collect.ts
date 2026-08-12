import packageJson from '../../../../package.json';
import { getSuppressedLogCounts, type SuppressedLogCounts } from '../../../client/matrixLogger';
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
    /**
     * Counts of matrix-js-sdk log lines `matrixLogger` deliberately drops.
     *
     * `decryptUtd` is the one that matters: a non-zero and growing value means
     * this device is missing room keys, which usually means key backup was never
     * set up or is failing to restore. That is BO-1, and the 2026-08-10
     * encryption audit could not size it because the logger suppressed the signal
     * and nothing counted it. The counter has existed since that audit; until it
     * was attached here it had no consumer, so the failure rate stayed
     * unmeasurable in exactly the population that hits it.
     *
     * Three integers since page load. No message content, no room or user
     * identifiers — safe to carry in a report that may end up on a public issue.
     */
    readonly suppressedLogCounts: SuppressedLogCounts;
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

const safeSuppressedLogCounts = (): SuppressedLogCounts => {
    try {
        return getSuppressedLogCounts();
    } catch {
        return { pushRule: 0, keyBackupProbe: 0, decryptUtd: 0 };
    }
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
        suppressedLogCounts: safeSuppressedLogCounts(),
    };
};
