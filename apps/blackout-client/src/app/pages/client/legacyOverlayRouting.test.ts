import { describe, expect, it } from 'vitest';
import {
    getLegacyOverlayVisibility,
    parseLegacyOverlayId,
    withLegacyOverlay,
    withoutLegacyOverlay,
} from './legacyOverlayRouting';

describe('legacy overlay routing helpers', () => {
    it('opens settings overlay while preserving search params', () => {
        expect(withLegacyOverlay('?panel=threads', 'settings')).toBe('?panel=threads&overlay=settings');
    });

    it('closes overlays and keeps unrelated params', () => {
        expect(withoutLegacyOverlay('?overlay=welcome&overlaySpace=%21space%3Aexample.org&panel=search')).toBe(
            '?panel=search',
        );
    });

    it('derives visibility from route id and eligibility gates', () => {
        expect(getLegacyOverlayVisibility('welcome', false, true)).toEqual({
            settings: false,
            welcome: false,
            onboarding: false,
        });
        expect(getLegacyOverlayVisibility('onboarding', true, true)).toEqual({
            settings: false,
            welcome: false,
            onboarding: true,
        });
    });

    it('parses only known overlay ids', () => {
        expect(parseLegacyOverlayId('settings')).toBe('settings');
        expect(parseLegacyOverlayId('unknown')).toBeNull();
    });
});
