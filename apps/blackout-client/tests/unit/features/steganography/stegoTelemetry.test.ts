// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import {
    openStegoUpgradeFlow,
    trackStegoBaselineUsage,
} from '../../../../src/app/features/steganography/stegoTelemetry';

describe('stegoTelemetry', () => {
    it('emits baseline and upgrade telemetry events separately', () => {
        const listener = vi.fn();
        window.addEventListener('blackout:telemetry', listener as EventListener);

        trackStegoBaselineUsage(false);
        openStegoUpgradeFlow('composer_advanced_controls');

        const details = listener.mock.calls.map((call) => (call[0] as CustomEvent).detail);
        expect(details.some((detail) => detail.name === 'stego_baseline_used')).toBe(true);
        expect(details.some((detail) => detail.name === 'stego_upgrade_intent')).toBe(true);
    });
});
