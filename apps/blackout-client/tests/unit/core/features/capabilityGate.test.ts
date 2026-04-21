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

    it('adapts legacy feature surfaces as workflow plugin', () => {
        const legacyFeature: BlackoutFeature = {
            id: 'legacy-feature',
            name: 'Legacy Feature',
            routes: [],
            navItems: [],
            settings: [],
        };

        const customizations = resolveFeatureCustomizations(legacyFeature);

        expect(customizations).toHaveLength(1);
        expect(customizations[0].category).toBe('workflow plugin');
        expect(customizations[0].id).toBe('legacy-feature-legacy');
    });
});
