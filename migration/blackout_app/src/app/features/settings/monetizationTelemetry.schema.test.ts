import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getMonetizationRouteMetadata,
    isValidMonetizationTelemetryEvent,
    monetizationRouteMetadataBySection,
    toSafeMonetizationTelemetryEvent,
} from './monetizationTelemetry';

test('monetization route metadata schema covers every monetization section', () => {
    assert.deepEqual(Object.keys(monetizationRouteMetadataBySection).sort(), [
        'monetization-billing',
        'monetization-boost',
        'monetization-marketplace',
        'monetization-plan',
        'monetization-theme-packs',
    ]);

    for (const sectionId of Object.keys(monetizationRouteMetadataBySection)) {
        const route = getMonetizationRouteMetadata(sectionId as never);
        assert.equal(route.sectionId, sectionId);
        assert.equal(/\s/.test(route.title), false);
        assert.equal(/\s/.test(route.featureId), false);
        assert.equal(/\s/.test(route.accessLevel), false);
    }
});

test('monetization telemetry schema accepts canonical event payloads', () => {
    const route = getMonetizationRouteMetadata('monetization-plan');
    const event = {
        name: 'monetization_trial_start' as const,
        route,
        trialType: 'free' as const,
    };

    assert.equal(isValidMonetizationTelemetryEvent(event), true);
    assert.deepEqual(toSafeMonetizationTelemetryEvent(event), event);
});

test('monetization telemetry schema rejects plaintext payload leaks', () => {
    const unsafeEvent = {
        name: 'monetization_checkout_open' as const,
        route: {
            ...getMonetizationRouteMetadata('monetization-billing'),
            title: 'Billing checkout readable title',
        },
        checkoutSurface: 'settings' as const,
    };

    assert.equal(isValidMonetizationTelemetryEvent(unsafeEvent), false);
    assert.equal(toSafeMonetizationTelemetryEvent(unsafeEvent as never), null);
});
