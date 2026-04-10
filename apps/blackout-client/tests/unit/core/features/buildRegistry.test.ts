import { describe, expect, it } from 'vitest';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import type { FeatureFlags } from '../../../../src/app/core/features/featureFlags';

describe('buildFeatureRegistry', () => {
    it('includes only enabled features', () => {
        const flags: FeatureFlags = {
            governance: true,
            forum: false,
            deaddrop: true,
            steganography: false,
            moderation: false,
            logistics: false,
        };

        const registry = buildFeatureRegistry(flags);

        expect(registry.map((feature) => feature.id)).toEqual(['governance', 'deaddrop']);
    });
});
