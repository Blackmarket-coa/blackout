import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';

/**
 * The union of `features.*` entitlement keys the caller currently holds via
 * marketplace purchases and active subscriptions (System A → System B bridge).
 *
 * Subscription-tier grants ship no artifact bundle, so they never become an
 * `InstalledPluginRecord`; instead the boot hydrator writes their feature-key
 * bundle here. Town-Square premium widgets and other feature gates read this
 * (unioned with plan-tier/beta-unlock resolution) to decide what to light up.
 *
 * Persisted so a subscribed feature stays unlocked across reloads; reconciled
 * on each boot by `PluginEntitlementHydrator` against the server's granted
 * entitlements, so a lapse/refund takes effect on next load.
 */

const STORAGE_KEY = 'blackout.entitlements.featureKeys.v1';

const noopStorage: Storage = {
    length: 0,
    clear: () => undefined,
    key: () => null,
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
};

const safeJsonStorage = createJSONStorage<string[]>(() => {
    try {
        return window.localStorage;
    } catch {
        return noopStorage;
    }
});

export const grantedFeatureKeysAtom = atomWithStorage<string[]>(STORAGE_KEY, [], safeJsonStorage);

/** Read-only Set view for O(1) membership checks in widget/feature gates. */
export const grantedFeatureKeySetAtom = atom((get) => new Set(get(grantedFeatureKeysAtom)));
