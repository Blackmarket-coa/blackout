import { describe, expect, it } from 'vitest';
import { buildRegistryRouteObjects } from '../../../../src/app/core/features/RegistryRouteList';
import { resolveEffectiveFlags } from '../../../../src/app/core/features/effectiveFlags';
import { runtimeFeatureFlags } from '../../../../src/app/core/features/featureFlags';

/**
 * End-to-end proof that a user flag override surfaces its route through the same
 * `buildRegistryRouteObjects` path the live router rebuilds from
 * (`main.tsx` BootstrapStatus re-memoizes on `capabilityContextAtom.flags`). The
 * `topics` feature gates on `flags.topics` AND capability `discovery.read`.
 */
const topicsPathsFor = (override: Record<string, boolean>, capabilities: string[]) => {
    const flags = resolveEffectiveFlags(runtimeFeatureFlags, override);
    return buildRegistryRouteObjects({ capabilities, flags }).map((route) => route.path);
};

describe('flag override → route surfacing (topics)', () => {
    it('omits /topics when the override is off', () => {
        expect(topicsPathsFor({ topics: false }, ['discovery.read'])).not.toContain('/topics');
    });

    it('includes /topics when the override is on and the capability is granted', () => {
        expect(topicsPathsFor({ topics: true }, ['discovery.read'])).toContain('/topics');
    });

    it('still enforces the capability gate even when the flag is on', () => {
        // A flag override must not bypass capability gating.
        expect(topicsPathsFor({ topics: true }, [])).not.toContain('/topics');
    });
});
