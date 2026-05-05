import { describe, expect, it } from 'vitest';
import { BLACKOUT_THEME_IDS } from '../../../lib/bmc-core';
import {
    designBreakpoints,
    designShellLayout,
    designSpacing,
} from '../../../../../../packages/design/src';
import { normalizeAppSettingsTheme } from '../../state/settings';
import { normalizeAppearanceTheme } from './settingsAtoms';
import { isSettingsMobileViewport, settingsLayoutMetrics } from './SettingsPage';
import { themePreviews } from './theme-previews';

describe('theme parity (blackout-client)', () => {
    it('exposes the canonical theme ids in appearance settings', () => {
        expect(themePreviews.map((theme) => theme.value).sort()).toEqual(
            [...BLACKOUT_THEME_IDS].sort()
        );
    });

    it('keeps settings layout collapse and touch targets aligned with shared design tokens', () => {
        expect(settingsLayoutMetrics.mobileMaxWidthPx).toBe(designBreakpoints.mobileMaxPx);
        expect(isSettingsMobileViewport(designBreakpoints.mobileMaxPx)).toBe(true);
        expect(isSettingsMobileViewport(designBreakpoints.mobileMaxPx + 1)).toBe(false);
        expect(settingsLayoutMetrics.panelPaddingPx).toBe(designShellLayout.desktopPanelPaddingPx);
        expect(settingsLayoutMetrics.sectionGapPx).toBe(designSpacing.comfortableGapPx);
        expect(settingsLayoutMetrics.minTouchTargetPx).toBe(designShellLayout.navRailButtonSizePx);
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
