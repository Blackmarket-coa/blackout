import type { BlackoutThemeId } from '@blackout/core';
import { themeTokenMap, type ThemeTokens } from './theme-engine';

const hexToRgb = (hex: string) => {
    const normalized = hex.replace('#', '');
    const value = normalized.length === 3
        ? normalized
              .split('')
              .map((char) => char + char)
              .join('')
        : normalized;

    const intValue = Number.parseInt(value, 16);
    return {
        r: (intValue >> 16) & 255,
        g: (intValue >> 8) & 255,
        b: intValue & 255,
    };
};

const channelToLinear = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    const rl = channelToLinear(r);
    const gl = channelToLinear(g);
    const bl = channelToLinear(b);

    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
};

export const contrastRatio = (foregroundHex: string, backgroundHex: string) => {
    const foreground = relativeLuminance(foregroundHex);
    const background = relativeLuminance(backgroundHex);
    const lighter = Math.max(foreground, background);
    const darker = Math.min(foreground, background);

    return (lighter + 0.05) / (darker + 0.05);
};

export type ThemeContrastReport = {
    textPrimaryOnSurface: number;
    textSecondaryOnSurface: number;
    accentOnSurface: number;
};

export const getThemeContrastReport = (tokens: ThemeTokens): ThemeContrastReport => ({
    textPrimaryOnSurface: contrastRatio(tokens.text.primary, tokens.bg.surface),
    textSecondaryOnSurface: contrastRatio(tokens.text.secondary, tokens.bg.surface),
    accentOnSurface: contrastRatio(tokens.accent.primary, tokens.bg.surface),
});

export const getAllThemeContrastReports = (): Record<BlackoutThemeId, ThemeContrastReport> => ({
    dark_canopy: getThemeContrastReport(themeTokenMap.dark_canopy),
    light_grove: getThemeContrastReport(themeTokenMap.light_grove),
    amoled_night: getThemeContrastReport(themeTokenMap.amoled_night),
    storybook_meadow: getThemeContrastReport(themeTokenMap.storybook_meadow),
    adventure_spectrum: getThemeContrastReport(themeTokenMap.adventure_spectrum),
});
