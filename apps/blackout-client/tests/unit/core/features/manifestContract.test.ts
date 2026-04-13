import { describe, expect, it } from 'vitest';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import { resolveFeatureCustomizations } from '../../../../src/app/core/features/capabilityGate';
import type { FeatureFlags } from '../../../../src/app/core/features/featureFlags';

const allEnabled: FeatureFlags = {
    governance: true,
    forum: true,
    deaddrop: true,
    steganography: true,
    moderation: true,
    logistics: true,
};

describe('feature metadata contract governance', () => {
    it('ensures all registered features satisfy metadata contract', () => {
        const registry = buildFeatureRegistry(allEnabled);

        expect(registry.length).toBeGreaterThan(0);

        const ids = new Set<string>();
        const routePaths = new Set<string>();

        for (const feature of registry) {
            expect(feature.id).toMatch(/^[a-z0-9-]+$/);
            expect(feature.name.length).toBeGreaterThan(0);
            expect(feature.capabilities?.length ?? 0).toBeGreaterThan(0);

            expect(ids.has(feature.id)).toBe(false);
            ids.add(feature.id);

            const customizations = resolveFeatureCustomizations(feature, {
                capabilities: feature.capabilities,
                flags: allEnabled,
            });

            expect(customizations.length).toBeGreaterThan(0);

            for (const customization of customizations) {
                expect(customization.id).toMatch(/^[a-z0-9-]+$/);
                expect(customization.name.length).toBeGreaterThan(0);
                expect(customization.category).toMatch(
                    /^(visual\/layout plugin|interaction plugin|workflow plugin|service-backed plugin)$/
                );

                for (const route of customization.routes ?? []) {
                    expect(route.path.startsWith('/')).toBe(true);
                    expect(route.component).toBeTypeOf('function');
                    expect(routePaths.has(route.path)).toBe(false);
                    routePaths.add(route.path);
                }

                for (const item of customization.navItems ?? []) {
                    expect(item.to.startsWith('/')).toBe(true);
                    expect(item.label.length).toBeGreaterThan(0);
                }

                for (const section of customization.settings ?? []) {
                    expect(section.section.length).toBeGreaterThan(0);
                    expect(section.component).toBeTypeOf('function');
                }
            }
        }
    });
});
