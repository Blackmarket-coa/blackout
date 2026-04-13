import { describe, expect, it } from 'vitest';
import {
    notificationsAdapterPlugin,
    resolveNotificationsAdapter,
} from '../../../../../src/app/plugins/notifications';
import {
    isRuntimePluginEnabled,
    orderedRuntimePlugins,
} from '../../../../../src/app/plugins/manifest';

describe('notifications adapter plugin', () => {
    it('has deterministic manifest order and kill-switch wiring', () => {
        expect(orderedRuntimePlugins.map((plugin) => plugin.id)).toEqual([
            'shell.legacy-layout',
            'theme.legacy-overrides',
            'composer.quick-actions',
            'navigation.space-hierarchy',
            'notifications.adapter',
            'right-panel.slots',
        ]);
        expect(notificationsAdapterPlugin.isEnabled()).toBe(
            isRuntimePluginEnabled('notifications.adapter')
        );
    });

    it('provides additive lifecycle hooks for reversible migration', () => {
        const unregister = notificationsAdapterPlugin.register();

        expect(typeof unregister).toBe('function');
        expect(() => notificationsAdapterPlugin.unregister()).not.toThrow();
    });

    it('resolves distinct baseline and legacy adapters for reversible migration', () => {
        expect(resolveNotificationsAdapter(false)).not.toBe(resolveNotificationsAdapter(true));
    });
});
