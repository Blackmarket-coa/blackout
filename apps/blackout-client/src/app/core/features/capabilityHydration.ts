import {
    applyCapabilityEvent,
    isCapabilityGrantedEvent,
    isCapabilityRevokedEvent,
} from '@blackout/sdk';
import { capabilityContextAtom } from './capabilityContext';
import { runtimeFeatureFlags } from './featureFlags';

const DEV_ENV_KEYS = [
    // Vite-style: prefer `import.meta.env.VITE_BLACKOUT_DEV_CAPABILITIES`,
    // but support the unprefixed and Node-side names for tests + smokes.
    'VITE_BLACKOUT_DEV_CAPABILITIES',
    'BLACKOUT_DEV_CAPABILITIES',
] as const;

const tokenize = (raw: string | undefined | null): string[] => {
    if (!raw) return [];
    return raw
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
};

/**
 * Pure helper: resolves the dev-mode capability seed from the supplied
 * env map. The seed is intentionally additive to whatever the production
 * capability fetch returns, so dev environments can preview gated
 * surfaces without a backend.
 *
 * Surfaced for testing — the runtime path reads from
 * `import.meta.env` and `process.env` automatically.
 */
export const resolveDevCapabilitySeed = (
    env: Record<string, string | undefined> = {}
): string[] => {
    for (const key of DEV_ENV_KEYS) {
        const tokens = tokenize(env[key]);
        if (tokens.length > 0) return tokens;
    }
    return [];
};

const collectRuntimeEnv = (): Record<string, string | undefined> => {
    const env: Record<string, string | undefined> = {};
    if (typeof process !== 'undefined' && process.env) {
        Object.assign(env, process.env as Record<string, string | undefined>);
    }
    // Vite injects env at build time on `import.meta.env`. Guard the access
    // so the helper stays usable in non-Vite test runners.
    try {
        const meta = (Function('return import.meta')() as { env?: Record<string, string | undefined> }) ?? {};
        if (meta.env) Object.assign(env, meta.env);
    } catch {
        // ignore — `import.meta` is unavailable in some test contexts.
    }
    return env;
};

/**
 * Pure reducer: merges a fetched + dev-seeded capability list into the
 * existing context value. Dedupes preserving insertion order, keeps
 * `flags` as supplied. Surfaced for tests and for callers wanting to
 * compute the next state without touching the atom directly.
 */
export const buildCapabilityContextValue = (input: {
    fetched: string[];
    devSeed: string[];
    flags: typeof runtimeFeatureFlags;
}) => {
    const seen = new Set<string>();
    const capabilities: string[] = [];
    [...input.fetched, ...input.devSeed].forEach((cap) => {
        if (seen.has(cap)) return;
        seen.add(cap);
        capabilities.push(cap);
    });
    return { capabilities, flags: input.flags };
};

/**
 * Imperative-style hydrator: given a jotai store + a fetcher, populates
 * the capability atom with the fetched set merged with the dev seed.
 * Falls back to the dev seed alone when the fetch rejects (matches the
 * "preview gated surfaces locally" goal — a backend outage in dev should
 * not strip the previewable capabilities).
 *
 * `applyCapabilityEvent` integration: callers receiving live grant/revoke
 * envelopes should call `applyCapabilityEventToStore` (below) so the atom
 * stays current without re-fetching.
 */
export const hydrateCapabilityContext = async (
    store: { get: <T>(atom: { read: unknown }) => T; set: <T>(atom: unknown, value: T) => void },
    fetcher: () => Promise<{ capabilities: string[] }>
): Promise<string[]> => {
    const env = collectRuntimeEnv();
    const devSeed = resolveDevCapabilitySeed(env);

    let fetched: string[] = [];
    try {
        const result = await fetcher();
        fetched = Array.isArray(result?.capabilities) ? result.capabilities : [];
    } catch {
        fetched = [];
    }

    const next = buildCapabilityContextValue({
        fetched,
        devSeed,
        flags: runtimeFeatureFlags,
    });
    store.set(capabilityContextAtom, next);
    return next.capabilities;
};

/**
 * Imperative helper: applies a `co.bmc.capability.{granted,revoked}`
 * envelope to the store's current capability list. Ignores envelopes
 * that aren't capability events.
 */
export const applyCapabilityEventToStore = (
    store: {
        get: <T>(atom: { read: unknown }) => T;
        set: <T>(atom: unknown, value: T) => void;
    },
    envelope: unknown
): void => {
    if (!isCapabilityGrantedEvent(envelope) && !isCapabilityRevokedEvent(envelope)) return;
    const current = store.get(capabilityContextAtom) as {
        capabilities: string[];
        flags: typeof runtimeFeatureFlags;
    };
    const nextCapabilities = applyCapabilityEvent(current.capabilities, envelope);
    store.set(capabilityContextAtom, {
        capabilities: nextCapabilities,
        flags: current.flags,
    });
};
