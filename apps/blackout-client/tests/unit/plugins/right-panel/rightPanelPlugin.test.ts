import { describe, expect, it } from 'vitest';
import {
    rightPanelPlugin,
    resolveRightPanelSlotRegistry,
} from '../../../../src/app/plugins/right-panel';
import { isRuntimePluginEnabled } from '../../../../src/app/plugins/manifest';

describe('right panel plugin slots', () => {
    it('maps kill-switch wiring to runtime manifest', () => {
        expect(rightPanelPlugin.isEnabled()).toBe(isRuntimePluginEnabled('right-panel.slots'));
    });

    it('exposes slot plugin lifecycle hooks', () => {
        const unregister = rightPanelPlugin.register();

        expect(typeof unregister).toBe('function');
        expect(() => rightPanelPlugin.unregister()).not.toThrow();
    });

    it('keeps baseline slots when plugin is disabled', () => {
        const registry = resolveRightPanelSlotRegistry(false, true);

        expect(registry.roles).toBeUndefined();
        expect(typeof registry.members).toBe('function');
        expect(typeof registry.search).toBe('function');
    });

    it('adds typed roles slot only when plugin and feature are both enabled', () => {
        const registry = resolveRightPanelSlotRegistry(true, true);
        const withoutRoles = resolveRightPanelSlotRegistry(true, false);

        expect(typeof registry.roles).toBe('function');
        expect(withoutRoles.roles).toBeUndefined();
    });

    it('gates live interaction widget surfaces behind bundle toggle', () => {
        const registry = resolveRightPanelSlotRegistry(true, false, true, true);
        const withoutLiveBundle = resolveRightPanelSlotRegistry(true, false, true, false);

        expect(typeof registry.townhall_sfu).toBe('function');
        expect(typeof registry.element_call).toBe('function');
        expect(typeof registry.soundboard).toBe('function');
        expect(typeof registry.numbers_station).toBe('function');
        expect(typeof registry.stage_channels).toBe('function');

        expect(withoutLiveBundle.townhall_sfu).toBeUndefined();
        expect(withoutLiveBundle.element_call).toBeUndefined();
        expect(withoutLiveBundle.soundboard).toBeUndefined();
        expect(withoutLiveBundle.numbers_station).toBeUndefined();
        expect(withoutLiveBundle.stage_channels).toBeUndefined();
        expect(typeof withoutLiveBundle.media_pipeline).toBe('function');
    });
});
