import { describe, expect, it } from 'vitest';
import {
    composeFeatureRoutes,
    composeFeatureSettings,
    composeShellPanels,
} from '../../../../src/app/core/features/composition';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import {
    defaultFeatureFlags,
    type FeatureFlags,
} from '../../../../src/app/core/features/featureFlags';

const flagsWithDeaddrop = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    deaddrop: true,
    ...overrides,
});

describe('deaddrop feature module — mutual-aid customization (BKL-013)', () => {
    it('exposes the mutual-aid surfaces only when deaddrop.mutual-aid.read is granted', () => {
        const flags = flagsWithDeaddrop();
        const registry = buildFeatureRegistry(flags);

        const without = { capabilities: ['deaddrop.read'], flags };
        const withMutualAid = { capabilities: ['deaddrop.mutual-aid.read'], flags };

        expect(composeFeatureRoutes(registry, without).map((r) => r.path)).not.toContain(
            '/mutual-aid'
        );
        expect(
            composeShellPanels(registry, without)
                .map((p) => p.id)
                .some((id) => id.startsWith('mutual-aid.'))
        ).toBe(false);

        expect(composeFeatureRoutes(registry, withMutualAid).map((r) => r.path)).toContain(
            '/mutual-aid'
        );
        expect(
            composeShellPanels(registry, withMutualAid)
                .map((p) => p.id)
                .filter((id) => id.startsWith('mutual-aid.'))
        ).toEqual(expect.arrayContaining(['mutual-aid.sidebar', 'mutual-aid.workspace']));
        expect(composeFeatureSettings(registry, withMutualAid).map((s) => s.section)).toContain(
            'Mutual aid'
        );
    });

    it('disabling the deaddrop flag prunes mutual-aid too', () => {
        const flags = flagsWithDeaddrop({ deaddrop: false });
        const registry = buildFeatureRegistry(flags);
        const ctx = { capabilities: ['deaddrop.mutual-aid.read'], flags };

        expect(registry.map((f) => f.id)).not.toContain('deaddrop');
        expect(composeFeatureRoutes(registry, ctx).map((r) => r.path)).not.toContain('/mutual-aid');
    });
});
