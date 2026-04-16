import test from 'node:test';
import assert from 'node:assert/strict';
import { getMonetizationRouteMetadata } from './monetizationTelemetry';
import { trackMonetizationTelemetry } from './settingsTelemetry';

test('settings telemetry dispatches valid monetization payload shape', () => {
    const dispatched: Event[] = [];
    const dispatchEvent = (event: Event) => {
        dispatched.push(event);
        return true;
    };

    (globalThis as { window?: { dispatchEvent: (event: Event) => boolean } }).window = { dispatchEvent };

    const event = {
        name: 'monetization_marketplace_open' as const,
        route: getMonetizationRouteMetadata('monetization-marketplace'),
        listingScope: 'owned' as const,
    };

    trackMonetizationTelemetry(event);

    assert.equal(dispatched.length, 1);
    const telemetryEvent = dispatched[0] as CustomEvent;
    assert.equal(telemetryEvent.type, 'blackout:telemetry');
    assert.deepEqual(telemetryEvent.detail, event);
});

test('settings telemetry drops invalid monetization payload shape', () => {
    const dispatched: Event[] = [];
    const dispatchEvent = (event: Event) => {
        dispatched.push(event);
        return true;
    };

    (globalThis as { window?: { dispatchEvent: (event: Event) => boolean } }).window = { dispatchEvent };

    trackMonetizationTelemetry({
        name: 'monetization_theme_bundle_open',
        route: getMonetizationRouteMetadata('monetization-theme-packs'),
        bundleScope: 'featured bundle page' as never,
    });

    assert.equal(dispatched.length, 0);
});
