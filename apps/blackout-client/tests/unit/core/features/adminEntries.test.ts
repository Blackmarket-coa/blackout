import { describe, expect, it } from 'vitest';
import {
    composeAdminEntries,
    composeFeatureNavItems,
    composeFeatureRoutes,
    composeFeatureSettings,
    composeShellPanels,
    hasAdminEntries,
} from '../../../../src/app/core/features/composition';
import { buildFeatureRegistry } from '../../../../src/app/core/features/buildRegistry';
import type { FeatureFlags } from '../../../../src/app/core/features/featureFlags';
import { defaultFeatureFlags } from '../../../../src/app/core/features/featureFlags';
import type { BlackoutFeature } from '../../../../src/app/core/features/types';

const buildFlags = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    ...overrides,
});

const opsContext = (capabilities: string[]) => ({
    capabilities,
    flags: buildFlags({ platformOps: true }),
});

describe('platform-ops feature module wiring', () => {
    it('platform-ops contributes routes/nav/panels/settings when the flag and read capability are present', () => {
        const flags = buildFlags({ platformOps: true });
        const registry = buildFeatureRegistry(flags);
        const context = opsContext(['platform-ops.read']);

        expect(registry.map((feature) => feature.id)).toContain('platform-ops');
        expect(composeFeatureRoutes(registry, context).map((route) => route.path)).toContain(
            '/ops/platform'
        );
        expect(composeFeatureNavItems(registry, context).map((item) => item.to)).toContain(
            '/ops/platform'
        );
        expect(composeShellPanels(registry, context).map((panel) => panel.id)).toEqual(
            expect.arrayContaining([
                'platform-ops.workspace',
                'platform-ops.sidebar',
                'platform-ops.right-panel',
            ])
        );
        expect(composeFeatureSettings(registry, context).map((item) => item.section)).toEqual(
            expect.arrayContaining(['Operations', 'Operations / Mobile'])
        );
    });

    it('platform-ops admin customization is hidden until platform-ops.admin is granted', () => {
        const flags = buildFlags({ platformOps: true });
        const registry = buildFeatureRegistry(flags);

        const readOnly = composeAdminEntries(registry, opsContext(['platform-ops.read']));
        expect(readOnly).toEqual([]);
        expect(hasAdminEntries(registry, opsContext(['platform-ops.read']))).toBe(false);

        const admin = composeAdminEntries(
            registry,
            opsContext(['platform-ops.read', 'platform-ops.admin'])
        );
        expect(admin.map((entry) => entry.id)).toEqual(['platform-ops-admin']);
        expect(
            hasAdminEntries(registry, opsContext(['platform-ops.read', 'platform-ops.admin']))
        ).toBe(true);
    });

    it('admin-only routes/panels are not exposed without platform-ops.admin', () => {
        const flags = buildFlags({ platformOps: true });
        const registry = buildFeatureRegistry(flags);
        const readOnly = opsContext(['platform-ops.read']);

        expect(composeFeatureRoutes(registry, readOnly).map((route) => route.path)).not.toContain(
            '/ops/platform/admin'
        );
        expect(composeShellPanels(registry, readOnly).map((panel) => panel.id)).not.toContain(
            'platform-ops.admin.sidebar'
        );

        const adminContext = opsContext([
            'platform-ops.read',
            'platform-ops.admin',
        ]);
        expect(composeFeatureRoutes(registry, adminContext).map((route) => route.path)).toContain(
            '/ops/platform/admin'
        );
        expect(composeShellPanels(registry, adminContext).map((panel) => panel.id)).toContain(
            'platform-ops.admin.sidebar'
        );
    });

    it('platform-ops is omitted from the registry when the platformOps flag is off', () => {
        const flags = buildFlags({ platformOps: false });
        const registry = buildFeatureRegistry(flags);
        expect(registry.map((feature) => feature.id)).not.toContain('platform-ops');

        // composeAdminEntries with the disabled flag yields nothing even
        // for users with the admin capability.
        const adminWithoutFlag = composeAdminEntries(registry, {
            capabilities: ['platform-ops.read', 'platform-ops.admin'],
            flags,
        });
        expect(adminWithoutFlag).toEqual([]);
    });

    it('composeAdminEntries returns customizations annotated with adminEntry: true', () => {
        const synthetic: BlackoutFeature = {
            id: 'governance',
            name: 'Governance',
            customizations: [
                {
                    id: 'gov-base',
                    name: 'Governance Base',
                    category: 'workflow plugin',
                    routes: [],
                },
                {
                    id: 'gov-admin',
                    name: 'Governance Admin',
                    category: 'service-backed plugin',
                    adminEntry: true,
                    routes: [],
                },
            ],
        };

        const entries = composeAdminEntries([synthetic]);
        expect(entries.map((entry) => entry.id)).toEqual(['gov-admin']);
    });
});
