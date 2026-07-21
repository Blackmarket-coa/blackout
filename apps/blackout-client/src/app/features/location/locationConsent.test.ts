// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import {
    DEFAULT_LOCATION_CONSENT,
    LOCATION_DISCLOSURE_VERSION,
    isConsentGranted,
    locationConsentAtom,
} from './locationConsent';

describe('locationConsent atom', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults to off with nothing collected', () => {
        const store = createStore();
        const state = store.get(locationConsentAtom);
        expect(state).toEqual(DEFAULT_LOCATION_CONSENT);
        expect(state.status).toBe('off');
        expect(isConsentGranted(state)).toBe(false);
    });

    it('treats a granted state at the current disclosure version as consent', () => {
        expect(
            isConsentGranted({
                status: 'granted',
                grantedAt: 123,
                disclosureVersion: LOCATION_DISCLOSURE_VERSION,
            })
        ).toBe(true);
    });

    it('does not honour consent granted against a stale disclosure version', () => {
        expect(
            isConsentGranted({
                status: 'granted',
                grantedAt: 123,
                disclosureVersion: LOCATION_DISCLOSURE_VERSION - 1,
            })
        ).toBe(false);
    });

    it('persists a grant and a revoke to local storage', () => {
        const store = createStore();
        store.set(locationConsentAtom, {
            status: 'granted',
            grantedAt: 456,
            disclosureVersion: LOCATION_DISCLOSURE_VERSION,
        });
        let stored = JSON.parse(localStorage.getItem('blackout.location.consent.v1') ?? '{}');
        expect(stored.status).toBe('granted');

        store.set(locationConsentAtom, DEFAULT_LOCATION_CONSENT);
        stored = JSON.parse(localStorage.getItem('blackout.location.consent.v1') ?? '{}');
        expect(stored.status).toBe('off');
    });
});
