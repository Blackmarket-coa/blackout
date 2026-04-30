import { atom, useAtomValue } from 'jotai';
import { runtimeFeatureFlags, type FeatureFlags } from './featureFlags';
import type { CapabilityGateContext } from './capabilityGate';

/**
 * Authoritative source for the canonical client's capability set.
 *
 * Defaults to an empty list — every registry-declared surface is hidden
 * until something (the SDK's capability fetch, a tenant override, a dev
 * `BLACKOUT_DEV_CAPABILITIES`) populates the atom. The flags slice is
 * sourced from `runtimeFeatureFlags` so env-driven flag toggles take
 * effect without app restart.
 */
export const capabilityContextAtom = atom<{
    capabilities: string[];
    flags: FeatureFlags;
}>({
    capabilities: [],
    flags: runtimeFeatureFlags,
});

/**
 * Hook returning a `CapabilityGateContext` ready to pass into the
 * `compose*` helpers. Memoization is delegated to jotai — the atom is
 * referentially stable across renders unless `setCapabilityContext` is
 * called.
 */
export const useCapabilityContext = (): CapabilityGateContext => {
    const value = useAtomValue(capabilityContextAtom);
    return { capabilities: value.capabilities, flags: value.flags };
};
