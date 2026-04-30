import { describe, expect, it } from 'vitest';
import {
    isCapabilityGateSatisfied,
    resolveFeatureCustomizations,
} from '../../../../src/app/core/features/capabilityGate';
import type { BlackoutFeature } from '../../../../src/app/core/features/types';

describe('capabilityGate', () => {
    it('evaluates allOf and flags when context is provided', () => {
        const pass = isCapabilityGateSatisfied(
            { allOf: ['a.read'], flags: ['governance'] },
            { capabilities: ['a.read'], flags: { governance: true } }
        );
        const fail = isCapabilityGateSatisfied(
            { allOf: ['a.write'], flags: ['governance'] },
            { capabilities: ['a.read'], flags: { governance: true } }
        );

        expect(pass).toBe(true);
        expect(fail).toBe(false);
    });

    it('fails closed when gate requirements are not provided in context', () => {
        expect(isCapabilityGateSatisfied({ allOf: ['a.read'] }, {})).toBe(false);
        expect(isCapabilityGateSatisfied({ flags: ['governance'] }, {})).toBe(false);
    });

    it('rejects legacy top-level surfaces — every feature must declare plugin customizations', () => {
        // Anti-drift: the `tools/ci/check-feature-registry.mjs` script
        // forbids legacy fallback anchors in `capabilityGate.ts`; this
        // test pins the throw so a future relaxation breaks here too.
        const legacyFeature: BlackoutFeature = {
            id: 'legacy-feature',
            name: 'Legacy Feature',
            routes: [],
            navItems: [],
            settings: [],
        };

        expect(() => resolveFeatureCustomizations(legacyFeature)).toThrow(
            /must define plugin customizations/
        );
    });
});
