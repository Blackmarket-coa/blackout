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

const flagsWithNotifications = (overrides: Partial<FeatureFlags> = {}): FeatureFlags => ({
    ...defaultFeatureFlags,
    notificationsPresence: true,
    ...overrides,
});

describe('notifications-presence feature module (BKL-004)', () => {
    it('exposes presence digest route + panels when notifications.presence.read is granted', () => {
        const flags = flagsWithNotifications();
        const registry = buildFeatureRegistry(flags);

        const without = {
            capabilities: ['notifications.rules.manage'],
            flags,
        };
        const withPresence = {
            capabilities: ['notifications.rules.manage', 'notifications.presence.read'],
            flags,
        };

        expect(composeFeatureRoutes(registry, without).map((r) => r.path)).not.toContain(
            '/notifications/presence-digest'
        );
        expect(composeFeatureRoutes(registry, withPresence).map((r) => r.path)).toContain(
            '/notifications/presence-digest'
        );

        expect(composeShellPanels(registry, withPresence).map((p) => p.id)).toEqual(
            expect.arrayContaining([
                'notifications.presence-digest.right-panel',
                'notifications.presence-digest.sidebar',
            ])
        );
        expect(composeShellPanels(registry, without).map((p) => p.id)).not.toContain(
            'notifications.presence-digest.right-panel'
        );
    });

    it('exposes Notifications / Rules settings only when notifications.rules.manage is granted', () => {
        const flags = flagsWithNotifications();
        const registry = buildFeatureRegistry(flags);

        const reader = {
            capabilities: ['notifications.presence.read'],
            flags,
        };
        const manager = {
            capabilities: ['notifications.rules.manage'],
            flags,
        };

        expect(
            composeFeatureSettings(registry, reader)
                .map((s) => s.section)
                .includes('Notifications / Rules')
        ).toBe(false);
        expect(
            composeFeatureSettings(registry, manager)
                .map((s) => s.section)
                .includes('Notifications / Rules')
        ).toBe(true);
    });

    it('disabling the notificationsPresence flag prunes everything', () => {
        const flags = flagsWithNotifications({ notificationsPresence: false });
        const registry = buildFeatureRegistry(flags);
        const fullCaps = {
            capabilities: ['notifications.rules.manage', 'notifications.presence.read'],
            flags,
        };

        expect(registry.map((f) => f.id)).not.toContain('notifications-presence');
        expect(composeFeatureRoutes(registry, fullCaps).map((r) => r.path)).not.toContain(
            '/notifications/presence-digest'
        );
        expect(
            composeFeatureSettings(registry, fullCaps)
                .map((s) => s.section)
                .some((s) => s.startsWith('Notifications /'))
        ).toBe(false);
    });
});
