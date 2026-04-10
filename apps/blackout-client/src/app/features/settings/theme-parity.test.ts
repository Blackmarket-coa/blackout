import { describe, expect, it } from 'vitest';
import { BLACKOUT_THEME_IDS } from '../../../lib/bmc-core';
import { normalizeAppSettingsTheme } from '../../state/bmc-settings';
import { normalizeAppearanceTheme } from './settingsAtoms';
import { themePreviews } from './theme-previews';

describe('theme parity (blackout-client)', () => {
    it('exposes the canonical theme ids in appearance settings', () => {
        expect(themePreviews.map((theme) => theme.value).sort()).toEqual(
            [...BLACKOUT_THEME_IDS].sort(),
        );
    });

    it('hydrates legacy theme ids for persisted appearance/app settings', () => {
        expect(normalizeAppearanceTheme('dark')).toBe('dark_canopy');
        expect(normalizeAppearanceTheme('light')).toBe('light_grove');
        expect(normalizeAppearanceTheme('amoled')).toBe('amoled_night');
        expect(normalizeAppSettingsTheme('dark')).toBe('dark_canopy');
        expect(normalizeAppSettingsTheme('light')).toBe('light_grove');
        expect(normalizeAppSettingsTheme('amoled')).toBe('amoled_night');
    });
});
