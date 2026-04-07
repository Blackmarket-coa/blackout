// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import {
    accessibilitySettingsAtom,
    appearanceSettingsAtom,
} from '../../../../src/app/features/settings/settingsAtoms';

describe('settings atoms persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('persists updates to local storage', () => {
        const store = createStore();
        store.set(appearanceSettingsAtom, (prev) => ({ ...prev, accentColor: '#123456' }));
        store.set(accessibilitySettingsAtom, (prev) => ({ ...prev, highContrast: true }));

        const appearance = JSON.parse(localStorage.getItem('blackout.settings.appearance.v1') ?? '{}');
        const accessibility = JSON.parse(localStorage.getItem('blackout.settings.accessibility.v1') ?? '{}');

        expect(appearance.accentColor).toBe('#123456');
        expect(accessibility.highContrast).toBe(true);
    });

    it('emits save failure telemetry when storage writes fail', () => {
        const telemetry = vi.fn();
        window.addEventListener('blackout:telemetry', telemetry as EventListener);

        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded');
        });

        const store = createStore();
        store.set(accessibilitySettingsAtom, (prev) => ({ ...prev, reducedMotion: true }));

        expect(telemetry).toHaveBeenCalled();
        const event = telemetry.mock.calls.at(-1)?.[0] as CustomEvent;
        expect(event.detail.name).toBe('settings_save_failed');
        expect(event.detail.operation).toBe('set');

        setItem.mockRestore();
    });
});
