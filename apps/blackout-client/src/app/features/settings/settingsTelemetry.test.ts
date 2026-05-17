// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { trackSettingsInteraction, trackSettingsSaveFailure } from './settingsTelemetry';

type CapturedEvent = {
    type: string;
    detail: unknown;
};

describe('settingsTelemetry', () => {
    let events: CapturedEvent[];
    let previousHandler: EventListener | null = null;

    beforeEach(() => {
        // Detach any handler attached by the previous test before reattaching
        // a fresh one. The project's typed vitest surface does not expose
        // afterEach (see other tests under apps/blackout-client/src for the
        // same workaround), so we tear down at the start of the next case.
        if (previousHandler) {
            window.removeEventListener('blackout:telemetry', previousHandler);
        }
        events = [];
        const handler = (ev: Event) => {
            const ce = ev as CustomEvent;
            events.push({ type: ce.type, detail: ce.detail });
        };
        previousHandler = handler;
        window.addEventListener('blackout:telemetry', handler);
    });

    it('emits a settings_interaction CustomEvent with section/control/value', () => {
        trackSettingsInteraction('developer', 'diagnostics-enabled', true);
        expect(events).toHaveLength(1);
        expect(events[0]?.type).toBe('blackout:telemetry');
        expect(events[0]?.detail).toEqual({
            name: 'settings_interaction',
            section: 'developer',
            control: 'diagnostics-enabled',
            value: true,
        });
    });

    it('omits value from settings_interaction when not provided', () => {
        trackSettingsInteraction('appearance', 'reset');
        expect((events[0]?.detail as { value?: unknown }).value).toBeUndefined();
    });

    it('emits settings_save_failed with normalized error message on Error', () => {
        trackSettingsSaveFailure('blackout.settings.appearance', 'set', new Error('quota exceeded'));
        expect(events).toHaveLength(1);
        expect(events[0]?.detail).toEqual({
            name: 'settings_save_failed',
            key: 'blackout.settings.appearance',
            operation: 'set',
            reason: 'quota exceeded',
        });
    });

    it('emits settings_save_failed with coerced reason when given a non-Error', () => {
        trackSettingsSaveFailure('blackout.settings.appearance', 'remove', 'storage missing');
        expect((events[0]?.detail as { reason: string }).reason).toBe('storage missing');
    });
});
