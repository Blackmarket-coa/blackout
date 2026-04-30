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

const flagsWithAuthThreads = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    authThreads: true,
    ...overrides,
});

describe('auth-threads feature module (BKL-011)', () => {
    it('exposes auth-oidc surfaces on auth.oidc.bootstrap', () => {
        const flags = flagsWithAuthThreads();
        const registry = buildFeatureRegistry(flags);
        const ctx = { capabilities: ['auth.oidc.bootstrap'], flags };

        expect(composeFeatureRoutes(registry, ctx).map((r) => r.path)).toEqual(['/auth/oidc']);
        expect(
            composeShellPanels(registry, ctx)
                .map((p) => p.id)
                .filter((id) => id.startsWith('auth.'))
        ).toEqual(['auth.oidc.sidebar']);
        expect(composeFeatureSettings(registry, ctx).map((s) => s.section)).toEqual([
            'Auth / Delegated login',
        ]);
    });

    it('exposes thread-activity surfaces independently on threads.activity.read', () => {
        const flags = flagsWithAuthThreads();
        const registry = buildFeatureRegistry(flags);
        const ctx = { capabilities: ['threads.activity.read'], flags };

        expect(composeFeatureRoutes(registry, ctx).map((r) => r.path)).toEqual(['/inbox/threads']);
        expect(
            composeShellPanels(registry, ctx)
                .map((p) => p.id)
                .filter((id) => id.startsWith('threads.'))
        ).toEqual(
            expect.arrayContaining([
                'threads.activity.right-panel',
                'threads.activity.sidebar',
            ])
        );
        expect(composeFeatureSettings(registry, ctx).map((s) => s.section)).toEqual([
            'Inbox / Thread activity',
        ]);
    });

    it('disabling the authThreads flag prunes everything', () => {
        const flags = flagsWithAuthThreads({ authThreads: false });
        const registry = buildFeatureRegistry(flags);
        const ctx = {
            capabilities: ['auth.oidc.bootstrap', 'threads.activity.read'],
            flags,
        };
        expect(registry.map((f) => f.id)).not.toContain('auth-threads');
        expect(
            composeFeatureRoutes(registry, ctx)
                .map((r) => r.path)
                .some((path) => path === '/auth/oidc' || path === '/inbox/threads')
        ).toBe(false);
    });
});
