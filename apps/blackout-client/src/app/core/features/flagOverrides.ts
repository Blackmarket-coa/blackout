import type { LabsFeatureDescriptor } from '@blackout/sdk';
import type { LabsFetcher } from '../../features/settings-parity';
import { capabilityContextAtom } from './capabilityContext';
import { runtimeFeatureFlags, type FeatureFlags } from './featureFlags';
import {
    USER_TOGGLEABLE_FLAGS,
    USER_TOGGLEABLE_FLAG_LABELS,
    isUserToggleableFlag,
    resolveEffectiveFlags,
    sanitizeFlagOverrides,
    type UserToggleableFlag,
} from './effectiveFlags';

/**
 * Per-user feature-flag overrides are persisted in the same place the Labs tab
 * already writes: the `(account, labs)` settings bucket. Each toggle is one key
 * `flag.<name>` → boolean. Cross-device by virtue of the `account` scope; clears
 * to env/default when the value is removed server-side.
 */
export const FLAG_OVERRIDE_SCOPE = 'account' as const;
export const FLAG_OVERRIDE_CATEGORY = 'labs' as const;
const FLAG_KEY_PREFIX = 'flag.';
/** Render bucket the synthetic flag rows appear under in the Labs list. */
export const LABS_FLAG_GROUP = 'Feature flags';

export const flagOverrideKey = (name: UserToggleableFlag): string => `${FLAG_KEY_PREFIX}${name}`;

/** Parse a bucket key back to a flag name, or null if it isn't an allowlisted flag key. */
export const parseFlagOverrideKey = (key: string): UserToggleableFlag | null => {
    if (!key.startsWith(FLAG_KEY_PREFIX)) return null;
    const name = key.slice(FLAG_KEY_PREFIX.length);
    return isUserToggleableFlag(name) ? name : null;
};

/** Pure: read a settings-bucket value map into sanitized flag overrides. */
export const readFlagOverridesFromValues = (
    values: Record<string, unknown> | null | undefined
): Partial<FeatureFlags> => {
    const overrides: Record<string, unknown> = {};
    if (values) {
        for (const [key, value] of Object.entries(values)) {
            const name = parseFlagOverrideKey(key);
            if (name) overrides[name] = value;
        }
    }
    return sanitizeFlagOverrides(overrides);
};

/** Pure: synthesize the Labs descriptor rows for every user-toggleable flag. */
export const buildFlagLabsDescriptors = (flags: FeatureFlags): LabsFeatureDescriptor[] =>
    USER_TOGGLEABLE_FLAGS.map((name) => ({
        id: flagOverrideKey(name),
        label: USER_TOGGLEABLE_FLAG_LABELS[name],
        group: LABS_FLAG_GROUP,
        enabled: flags[name] === true,
    }));

/**
 * Loose structural store contract — mirrors `capabilityHydration.ts` so jotai's
 * stricter generic store satisfies it via a cast at the call site.
 */
type StructuralStore = {
    get: <T>(atom: { read: unknown }) => T;
    set: <T>(atom: unknown, value: T) => void;
};

type CapabilityContextValue = { capabilities: string[]; flags: FeatureFlags };

/**
 * Imperative: apply a single flag override to the capability atom. Reads the
 * current value, recomputes effective flags (allowlist-enforced), and writes
 * back — leaving `capabilities` untouched. `BootstrapStatus` rebuilds the router
 * off the atom's `flags`, so the toggle takes effect without a reload. Ignores
 * non-allowlisted names (defense in depth).
 */
export const applyFlagOverrideToStore = (
    store: StructuralStore,
    name: string,
    enabled: boolean
): void => {
    if (!isUserToggleableFlag(name)) return;
    const current = store.get(capabilityContextAtom) as CapabilityContextValue;
    const flags = resolveEffectiveFlags(current.flags, { [name]: enabled });
    store.set(capabilityContextAtom, { capabilities: current.capabilities, flags });
};

/** Imperative: layer a fetched override set onto the atom's flags (boot path). */
export const applyFlagOverridesToStore = (
    store: StructuralStore,
    overrides: Partial<FeatureFlags>
): void => {
    const current = store.get(capabilityContextAtom) as CapabilityContextValue;
    const flags = resolveEffectiveFlags(current.flags, overrides);
    store.set(capabilityContextAtom, { capabilities: current.capabilities, flags });
};

type FlagSettingsBridge = {
    fetchBucket: (
        scope: typeof FLAG_OVERRIDE_SCOPE,
        category: typeof FLAG_OVERRIDE_CATEGORY
    ) => Promise<{ bucket?: { values?: Record<string, unknown> } | null } | null | undefined>;
    setSetting: (
        scope: typeof FLAG_OVERRIDE_SCOPE,
        category: typeof FLAG_OVERRIDE_CATEGORY,
        key: string,
        value: boolean
    ) => Promise<unknown>;
};

/**
 * Boot hydrator: fetch persisted overrides from the `(account, labs)` bucket and
 * layer them onto the atom. Tolerant of fetch failure — absence of overrides
 * leaves the env/default-resolved flags intact.
 */
export const hydrateFlagOverrides = async (
    store: StructuralStore,
    fetchBucket: FlagSettingsBridge['fetchBucket']
): Promise<void> => {
    try {
        const response = await fetchBucket(FLAG_OVERRIDE_SCOPE, FLAG_OVERRIDE_CATEGORY);
        const overrides = readFlagOverridesFromValues(response?.bucket?.values);
        applyFlagOverridesToStore(store, overrides);
    } catch {
        // ignore — no overrides applied
    }
};

/**
 * Wrap the production `labs` fetcher so the Labs tab also lists the
 * user-toggleable feature flags and their toggles persist + take effect live:
 * - `fetchLabsFeatures` appends synthetic `flag.<name>` rows whose `enabled`
 *   reflects the persisted override merged onto the env/default base.
 * - `setLabsFeatureEnabled` routes `flag.*` ids to the `(account, labs)` bucket
 *   and updates the atom (live router rebuild); all other ids pass through to
 *   the real labs-features endpoint unchanged.
 */
export const wrapLabsFetcherWithFlags = (
    base: LabsFetcher,
    store: StructuralStore,
    settings: FlagSettingsBridge
): LabsFetcher => ({
    ...base,
    fetchLabsFeatures: async () => {
        const [real, overrides] = await Promise.all([
            base.fetchLabsFeatures().catch(() => ({ features: [] as LabsFeatureDescriptor[] })),
            settings
                .fetchBucket(FLAG_OVERRIDE_SCOPE, FLAG_OVERRIDE_CATEGORY)
                .then((response) => readFlagOverridesFromValues(response?.bucket?.values))
                .catch(() => ({}) as Partial<FeatureFlags>),
        ]);
        const effective = resolveEffectiveFlags(runtimeFeatureFlags, overrides);
        return { features: [...(real.features ?? []), ...buildFlagLabsDescriptors(effective)] };
    },
    setLabsFeatureEnabled: async (featureId: string, enabled: boolean) => {
        const name = parseFlagOverrideKey(featureId);
        if (!name) return base.setLabsFeatureEnabled(featureId, enabled);
        const result = await settings.setSetting(
            FLAG_OVERRIDE_SCOPE,
            FLAG_OVERRIDE_CATEGORY,
            flagOverrideKey(name),
            enabled
        );
        applyFlagOverrideToStore(store, name, enabled);
        return result;
    },
});
