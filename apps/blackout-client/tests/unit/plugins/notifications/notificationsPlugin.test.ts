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
            'composer.quick-actions',
            'navigation.space-hierarchy',
            'notifications.adapter',
            'right-panel.slots',
        ]);
        expect(notificationsAdapterPlugin.isEnabled()).toBe(
            isRuntimePluginEnabled('notifications.adapter')
        );
    });

    it('resolves distinct baseline and legacy adapters for reversible migration', () => {
        expect(resolveNotificationsAdapter(false)).not.toBe(resolveNotificationsAdapter(true));
    });
});
