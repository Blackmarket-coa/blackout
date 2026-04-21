export const LIVE_INTERACTION_WIDGET_PANEL_IDS = [
    'townhall_sfu',
    'element_call',
    'soundboard',
    'numbers_station',
    'stage_channels',
] as const;

export type LiveInteractionWidgetPanelId = (typeof LIVE_INTERACTION_WIDGET_PANEL_IDS)[number];

export type LiveInteractionDependencyId =
    | 'runtime.plugin.right_panel_slots'
    | 'runtime.plugin.live_interaction_bundle'
    | 'browser.media_devices'
    | 'browser.media_devices.enumerate'
    | 'browser.media_devices.get_user_media'
    | 'capability.features.call.element_call';

export interface LiveInteractionDependencyFailure {
    id: LiveInteractionDependencyId;
    message: string;
    adminHint: string;
}

export interface LiveInteractionDiagnostics {
    status: 'ready' | 'degraded';
    failures: LiveInteractionDependencyFailure[];
}

export interface LiveInteractionDependencyInput {
    rightPanelPluginEnabled: boolean;
    bundlePluginEnabled: boolean;
    callCapabilityEnabled?: boolean;
    mediaDevicesAvailable?: boolean;
    enumerateDevicesAvailable?: boolean;
    getUserMediaAvailable?: boolean;
}

export const isLiveInteractionWidgetPanelId = (
    panelId: string
): panelId is LiveInteractionWidgetPanelId =>
    LIVE_INTERACTION_WIDGET_PANEL_IDS.some((id) => id === panelId);

export const evaluateLiveInteractionDependencies = (
    input: LiveInteractionDependencyInput
): LiveInteractionDiagnostics => {
    const failures: LiveInteractionDependencyFailure[] = [];

    if (!input.rightPanelPluginEnabled) {
        failures.push({
            id: 'runtime.plugin.right_panel_slots',
            message: 'Right-panel slot runtime plugin is disabled.',
            adminHint: 'Enable runtime plugin "right-panel.slots" to mount widget entrypoints.',
        });
    }

    if (!input.bundlePluginEnabled) {
        failures.push({
            id: 'runtime.plugin.live_interaction_bundle',
            message: 'Live interaction bundle plugin is disabled.',
            adminHint:
                'Enable runtime plugin "live-interaction.bundle" (or set BLACKOUT_LIVE_INTERACTION_BUNDLE=true).',
        });
    }

    if (input.callCapabilityEnabled === false) {
        failures.push({
            id: 'capability.features.call.element_call',
            message: 'Element Call capability is disabled by entitlement policy.',
            adminHint:
                'Grant capability "features.call.elementCall" to the active role/profile if call surfaces should be available.',
        });
    }

    if (input.mediaDevicesAvailable === false) {
        failures.push({
            id: 'browser.media_devices',
            message: 'Browser MediaDevices API is unavailable.',
            adminHint: 'Use a secure context/browser that exposes navigator.mediaDevices.',
        });
    }

    if (input.enumerateDevicesAvailable === false) {
        failures.push({
            id: 'browser.media_devices.enumerate',
            message: 'MediaDevices.enumerateDevices() is unavailable.',
            adminHint: 'Use a browser build that supports device enumeration for live audio/video routing.',
        });
    }

    if (input.getUserMediaAvailable === false) {
        failures.push({
            id: 'browser.media_devices.get_user_media',
            message: 'MediaDevices.getUserMedia() is unavailable.',
            adminHint: 'Allow microphone/camera permissions and confirm getUserMedia support.',
        });
    }

    return {
        status: failures.length === 0 ? 'ready' : 'degraded',
        failures,
    };
};

export const getLiveInteractionDiagnostics = (input: {
    rightPanelPluginEnabled: boolean;
    bundlePluginEnabled: boolean;
    callCapabilityEnabled?: boolean;
}): LiveInteractionDiagnostics => {
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;

    return evaluateLiveInteractionDependencies({
        rightPanelPluginEnabled: input.rightPanelPluginEnabled,
        bundlePluginEnabled: input.bundlePluginEnabled,
        callCapabilityEnabled: input.callCapabilityEnabled,
        mediaDevicesAvailable: !!mediaDevices,
        enumerateDevicesAvailable: typeof mediaDevices?.enumerateDevices === 'function',
        getUserMediaAvailable: typeof mediaDevices?.getUserMedia === 'function',
    });
};
