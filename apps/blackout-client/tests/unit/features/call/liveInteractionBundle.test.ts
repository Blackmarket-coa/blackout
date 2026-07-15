import { describe, expect, it } from 'vitest';
import {
    evaluateLiveInteractionDependencies,
    isLiveInteractionWidgetPanelId,
} from '../../../../src/app/features/call/liveInteractionBundle';

describe('live interaction bundle diagnostics', () => {
    it('reports ready when runtime, capability, and browser dependencies are healthy', () => {
        const diagnostics = evaluateLiveInteractionDependencies({
            rightPanelPluginEnabled: true,
            bundlePluginEnabled: true,
            callCapabilityEnabled: true,
            mediaDevicesAvailable: true,
            enumerateDevicesAvailable: true,
            getUserMediaAvailable: true,
        });

        expect(diagnostics.status).toBe('ready');
        expect(diagnostics.failures).toEqual([]);
    });

    it('returns admin-facing dependency failures when requirements are missing', () => {
        const diagnostics = evaluateLiveInteractionDependencies({
            rightPanelPluginEnabled: false,
            bundlePluginEnabled: false,
            callCapabilityEnabled: false,
            mediaDevicesAvailable: false,
            enumerateDevicesAvailable: false,
            getUserMediaAvailable: false,
        });

        expect(diagnostics.status).toBe('degraded');
        expect(diagnostics.failures.map((failure) => failure.id)).toEqual([
            'runtime.plugin.right_panel_slots',
            'runtime.plugin.live_interaction_bundle',
            'capability.features.call.element_call',
            'browser.media_devices',
            'browser.media_devices.enumerate',
            'browser.media_devices.get_user_media',
        ]);
    });

    it('matches only the live-stage inventory IDs', () => {
        expect(isLiveInteractionWidgetPanelId('townhall_sfu')).toBe(true);
        expect(isLiveInteractionWidgetPanelId('stage_channels')).toBe(true);
        expect(isLiveInteractionWidgetPanelId('soundboard')).toBe(true);
        expect(isLiveInteractionWidgetPanelId('numbers_station')).toBe(true);
        expect(isLiveInteractionWidgetPanelId('element_call')).toBe(true);
        expect(isLiveInteractionWidgetPanelId('watch_party')).toBe(true);
        expect(isLiveInteractionWidgetPanelId('media_pipeline')).toBe(false);
    });
});
