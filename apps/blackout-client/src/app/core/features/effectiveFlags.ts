import type { FeatureFlags } from './featureFlags';

/**
 * User-toggleable feature flags — the allowlist that bounds in-app (Labs)
 * feature toggling. This is the SECURITY BOUNDARY: only flags listed here may
 * be flipped by a per-user override. Everything else (monetization SKUs,
 * privileged ops, entitlement-tier plugins, structural routing) is resolved
 * exclusively from env/defaults and can never be raised by a user override.
 *
 * Keep this list to presentation/discovery surfaces with no entitlement or
 * privilege coupling. `satisfies` pins every entry to a real flag key.
 */
export const USER_TOGGLEABLE_FLAGS = [
    'stegoToolkit',
    'topics',
    'homeFeedSegments',
    'homeStreak',
    'homeBountyBoard',
    'seriesTag',
    'transparencyReports',
] as const satisfies readonly (keyof FeatureFlags)[];

export type UserToggleableFlag = typeof USER_TOGGLEABLE_FLAGS[number];

const USER_TOGGLEABLE_SET: ReadonlySet<string> = new Set(USER_TOGGLEABLE_FLAGS);

/** Type guard: is `name` a flag a user is allowed to toggle in-app? */
export const isUserToggleableFlag = (name: string): name is UserToggleableFlag =>
    USER_TOGGLEABLE_SET.has(name);

/** Human-readable labels for the Labs toggle rows. */
export const USER_TOGGLEABLE_FLAG_LABELS: Record<UserToggleableFlag, string> = {
    stegoToolkit: 'Steganography toolkit',
    topics: 'Topics',
    homeFeedSegments: 'Town Square feed segments',
    homeStreak: 'Town Square streak chip',
    homeBountyBoard: 'Town Square bounty board',
    seriesTag: 'Series badges',
    transparencyReports: 'Transparency reports',
};

/**
 * Pure: keep only allowlisted keys with boolean values. Anything else (unknown
 * keys, non-booleans, prototype junk) is dropped — so a compromised or buggy
 * override source can never flip a non-allowlisted flag.
 */
export const sanitizeFlagOverrides = (
    overrides: Record<string, unknown> | null | undefined
): Partial<FeatureFlags> => {
    const out: Partial<FeatureFlags> = {};
    if (!overrides) return out;
    for (const [key, value] of Object.entries(overrides)) {
        if (typeof value === 'boolean' && isUserToggleableFlag(key)) {
            out[key] = value;
        }
    }
    return out;
};

/**
 * Pure: layer per-user overrides on top of the resolved base flags. The
 * override set is sanitized first, so the result can only ever differ from
 * `base` on allowlisted keys.
 */
export const resolveEffectiveFlags = (
    base: FeatureFlags,
    overrides: Record<string, unknown> | null | undefined
): FeatureFlags => ({ ...base, ...sanitizeFlagOverrides(overrides) });
