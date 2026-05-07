import { describe, expect, it } from 'vitest';
import { getMessageActions } from '../../../../src/app/plugins/composer/quickActionCatalog';
import {
    composerQuickActionsPlugin,
    resolveComposerMessageSpacingItems,
} from '../../../../src/app/plugins/composer';
import {
    isRuntimePluginEnabled,
    orderedRuntimePlugins,
} from '../../../../src/app/plugins/manifest';
import { runtimeFeatureFlags } from '../../../../src/app/core/features/featureFlags';

describe('composer quick actions plugin', () => {
    it('uses deterministic manifest ordering and explicit toggle', () => {
        expect(orderedRuntimePlugins.map((plugin) => plugin.id)).toEqual([
            'shell.legacy-layout',
            'theme.legacy-overrides',
            'composer.quick-actions',
            'navigation.space-hierarchy',
            'notifications.adapter',
            'right-panel.slots',
            'live-interaction.bundle',
        ]);
        expect(isRuntimePluginEnabled('composer.quick-actions')).toBe(
            runtimeFeatureFlags.composerQuickActions
        );
    });

    it('supports additive/reversible message spacing behavior', () => {
        expect(resolveComposerMessageSpacingItems(false).map((item) => item.spacing)).toEqual([
            '200',
            '400',
            '500',
        ]);
        expect(resolveComposerMessageSpacingItems(true).map((item) => item.spacing)).toEqual([
            '0',
            '100',
            '200',
            '300',
            '400',
            '500',
        ]);
    });

    it('exposes register/unregister lifecycle hooks', () => {
        const unregister = composerQuickActionsPlugin.register();

        expect(typeof unregister).toBe('function');
        expect(() => composerQuickActionsPlugin.unregister()).not.toThrow();
    });

    it('preserves Matrix action payload adapters by delegating to legacy action mapping', () => {
        const message = { msgtype: 'm.text' };
        expect(composerQuickActionsPlugin.getTimelineQuickActions(message)).toEqual(
            getMessageActions(message)
        );
    });
});
