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

const flagsWithEducation = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    education: true,
    ...overrides,
});

describe('education feature module (BKL-012)', () => {
    it('exposes route + sidebar + workspace + settings on education.modules.read', () => {
        const flags = flagsWithEducation();
        const registry = buildFeatureRegistry(flags);
        const ctx = { capabilities: ['education.modules.read'], flags };

        expect(composeFeatureRoutes(registry, ctx).map((r) => r.path)).toContain('/education');
        const ids = composeShellPanels(registry, ctx).map((p) => p.id);
        expect(ids).toContain('education.sidebar');
        expect(ids).toContain('education.workspace');
        expect(composeFeatureSettings(registry, ctx).map((s) => s.section)).toEqual([
            'Education',
        ]);
    });

    it('hides everything without the capability', () => {
        const flags = flagsWithEducation();
        const registry = buildFeatureRegistry(flags);
        const ctx = { capabilities: [], flags };

        expect(composeFeatureRoutes(registry, ctx).map((r) => r.path)).not.toContain('/education');
        expect(
            composeShellPanels(registry, ctx)
                .map((p) => p.id)
                .some((id) => id.startsWith('education.'))
        ).toBe(false);
    });

    it('disabling the education flag prunes everything', () => {
        const flags = flagsWithEducation({ education: false });
        const registry = buildFeatureRegistry(flags);
        const ctx = { capabilities: ['education.modules.read'], flags };
        expect(registry.map((f) => f.id)).not.toContain('education');
        expect(composeFeatureRoutes(registry, ctx).map((r) => r.path)).not.toContain('/education');
    });
});
