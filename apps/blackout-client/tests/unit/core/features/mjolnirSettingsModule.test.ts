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

const flagsWithModeration = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    moderation: true,
    ...overrides,
});

describe('moderation feature module — mjolnir-settings customization (BKL-009)', () => {
    it('exposes the mjolnir route + sidebar entry + section on moderation.mjolnir.manage', () => {
        const flags = flagsWithModeration();
        const registry = buildFeatureRegistry(flags);

        const without = { capabilities: ['moderation.read'], flags };
        const withMjolnir = { capabilities: ['moderation.mjolnir.manage'], flags };

        expect(composeFeatureRoutes(registry, without).map((r) => r.path)).not.toContain(
            '/settings/moderation/mjolnir'
        );
        const mjolnirRoutes = composeFeatureRoutes(registry, withMjolnir).map((r) => r.path);
        expect(mjolnirRoutes).toContain('/settings/moderation/mjolnir');

        expect(
            composeShellPanels(registry, withMjolnir)
                .map((p) => p.id)
                .filter((id) => id.startsWith('moderation.mjolnir.'))
        ).toEqual(['moderation.mjolnir.sidebar']);

        const sections = composeFeatureSettings(registry, withMjolnir).map((s) => s.section);
        expect(sections).toContain('Moderation / Mjolnir');
    });

    it('keeps the draupnir-console customization independent of mjolnir-settings', () => {
        const flags = flagsWithModeration();
        const registry = buildFeatureRegistry(flags);

        const draupnirOnly = { capabilities: ['moderation.read'], flags };
        const draupnirRoutes = composeFeatureRoutes(registry, draupnirOnly).map((r) => r.path);
        // Draupnir routes are present; mjolnir route is not.
        expect(draupnirRoutes).not.toContain('/settings/moderation/mjolnir');
        expect(
            composeFeatureSettings(registry, draupnirOnly)
                .map((s) => s.section)
                .includes('Moderation / Mjolnir')
        ).toBe(false);
    });

    it('disabling the moderation flag prunes mjolnir-settings too', () => {
        const flags = flagsWithModeration({ moderation: false });
        const registry = buildFeatureRegistry(flags);
        const fullCaps = {
            capabilities: ['moderation.read', 'moderation.mjolnir.manage'],
            flags,
        };

        expect(registry.map((f) => f.id)).not.toContain('moderation');
        expect(composeFeatureRoutes(registry, fullCaps).map((r) => r.path)).not.toContain(
            '/settings/moderation/mjolnir'
        );
        expect(
            composeShellPanels(registry, fullCaps)
                .map((p) => p.id)
                .some((id) => id.startsWith('moderation.mjolnir.'))
        ).toBe(false);
        expect(
            composeFeatureSettings(registry, fullCaps)
                .map((s) => s.section)
                .includes('Moderation / Mjolnir')
        ).toBe(false);
    });
});
