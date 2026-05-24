/**
 * Temporary beta override: when the beta-unlock flag is set, every service is
 * visible and usable regardless of subscription/preset. Flip the env var off to
 * restore normal gating.
 *
 * The flag is read from `VITE_BLACKOUT_BETA_UNLOCK_ALL` (Vite client builds) or
 * `BLACKOUT_BETA_UNLOCK_ALL` (Node-side test/SSR contexts).
 */

const BETA_UNLOCK_ENV_KEYS = ['VITE_BLACKOUT_BETA_UNLOCK_ALL', 'BLACKOUT_BETA_UNLOCK_ALL'] as const;

/** Pure helper — resolves the flag from an explicit env map (used by tests). */
export const betaUnlockAllEnabledIn = (env: Record<string, string | undefined>): boolean =>
    BETA_UNLOCK_ENV_KEYS.some((key) => env[key] === 'true');

const collectRuntimeEnv = (): Record<string, string | undefined> => {
    const env: Record<string, string | undefined> = {};
    if (typeof process !== 'undefined' && process.env) {
        Object.assign(env, process.env as Record<string, string | undefined>);
    }
    // Vite injects env at build time on `import.meta.env`. Guard the access so
    // this stays usable in non-Vite test runners.
    try {
        const meta = (Function('return import.meta')() as { env?: Record<string, string | undefined> }) ?? {};
        if (meta.env) Object.assign(env, meta.env);
    } catch {
        // ignore — `import.meta` is unavailable in some test contexts.
    }
    return env;
};

/** Runtime check — reads both `process.env` and `import.meta.env`. */
export const betaUnlockAllEnabled = (): boolean => betaUnlockAllEnabledIn(collectRuntimeEnv());
