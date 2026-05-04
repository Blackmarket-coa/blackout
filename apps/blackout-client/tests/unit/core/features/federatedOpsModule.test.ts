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

const flagsWithFederatedOps = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    federatedOps: true,
    ...overrides,
});

describe('federated-ops feature module (BKL-010)', () => {
    it('exposes federation-health surfaces on federation.health.read', () => {
        const flags = flagsWithFederatedOps();
        const registry = buildFeatureRegistry(flags);

        const ctx = { capabilities: ['federation.health.read'], flags };
        expect(composeFeatureRoutes(registry, ctx).map((r) => r.path)).toContain(
            '/ops/federation'
        );
        expect(
            composeShellPanels(registry, ctx)
                .map((p) => p.id)
                .filter((id) => id.startsWith('federation.'))
        ).toEqual(
            expect.arrayContaining(['federation.health.sidebar', 'federation.health.workspace'])
        );
        expect(composeFeatureSettings(registry, ctx).map((s) => s.section)).toContain(
            'Ops / Federation health'
        );
    });

    it('exposes townhall surfaces independently on townhall.ops.manage', () => {
        const flags = flagsWithFederatedOps();
        const registry = buildFeatureRegistry(flags);

        const ctx = { capabilities: ['townhall.ops.manage'], flags };
        expect(
            composeFeatureRoutes(registry, ctx)
                .map((r) => r.path)
                .filter((path) => path.startsWith('/ops/'))
        ).toEqual(['/ops/townhall']);
        expect(composeFeatureSettings(registry, ctx).map((s) => s.section)).toEqual([
            'Ops / Townhall',
        ]);
    });

    it('exposes revenue ops surfaces independently on revenue.ops.read', () => {
        const flags = flagsWithFederatedOps();
        const registry = buildFeatureRegistry(flags);

        const ctx = { capabilities: ['revenue.ops.read'], flags };
        expect(
            composeFeatureRoutes(registry, ctx)
                .map((r) => r.path)
                .filter((path) => path.startsWith('/ops/'))
        ).toEqual(['/ops/revenue']);
        expect(composeFeatureSettings(registry, ctx).map((s) => s.section)).toEqual([
            'Ops / Revenue',
        ]);
    });

    it('disabling the federatedOps flag prunes everything', () => {
        const flags = flagsWithFederatedOps({ federatedOps: false });
        const registry = buildFeatureRegistry(flags);
        const ctx = {
            capabilities: ['federation.health.read', 'townhall.ops.manage', 'revenue.ops.read'],
            flags,
        };

        expect(registry.map((f) => f.id)).not.toContain('federated-ops');
        expect(
            composeFeatureRoutes(registry, ctx)
                .map((r) => r.path)
                .some((path) => path.startsWith('/ops/'))
        ).toBe(false);
    });
});
