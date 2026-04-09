import { describe, expect, it } from 'vitest';
import {
    contrastRatio,
    getAllThemeContrastReports,
} from '../../../src/app/styles/theme-accessibility';
import { themeTokenMap } from '../../../src/app/styles/theme-engine';

describe('theme accessibility contrast checks', () => {
    it('ensures text contrast passes WCAG AA across all themes', () => {
        const reports = getAllThemeContrastReports();

        for (const [themeId, report] of Object.entries(reports)) {
            expect(report.textPrimaryOnSurface, `${themeId} primary text`).toBeGreaterThanOrEqual(4.5);
            expect(report.textSecondaryOnSurface, `${themeId} secondary text`).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('keeps accent contrast >= 3:1 for non-text indicators', () => {
        const reports = getAllThemeContrastReports();

        for (const [themeId, report] of Object.entries(reports)) {
            expect(report.accentOnSurface, `${themeId} accent contrast`).toBeGreaterThanOrEqual(3);
        }
    });

    it('keeps light and AMOLED variants sufficiently separated from dark baseline surface', () => {
        const darkSurface = themeTokenMap.dark_canopy.bg.surface;
        const lightSurface = themeTokenMap.light_grove.bg.surface;
        const amoledSurface = themeTokenMap.amoled_night.bg.surface;

        expect(contrastRatio(lightSurface, darkSurface)).toBeGreaterThanOrEqual(18);
        expect(contrastRatio(amoledSurface, darkSurface)).toBeLessThanOrEqual(1.1);
    });
});
