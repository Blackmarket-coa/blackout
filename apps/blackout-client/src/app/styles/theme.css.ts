import { createTheme, createThemeContract, globalStyle } from '@vanilla-extract/css';
import { BLACKOUT_THEME_IDS, normalizeThemeId, type BlackoutThemeId } from '@blackout/core';
import {
    applyThemeToRoot as applyThemeToRootEngine,
    themeColorSchemeByPreference,
    themeTokenMap,
    type ThemeTokens,
} from './theme-engine';

export const themeVars = createThemeContract({
    bg: {
        surface: 'bg-surface',
        surfaceHover: 'bg-surface-hover',
        nav: 'bg-nav',
        input: 'bg-input',
    },
    text: {
        primary: 'text-primary',
        secondary: 'text-secondary',
        muted: 'text-muted',
    },
    accent: {
        primary: 'accent-primary',
        hover: 'accent-hover',
        muted: 'accent-muted',
    },
    border: {
        default: 'border-default',
        active: 'border-active',
    },
    status: {
        danger: 'danger',
        warning: 'warning',
        success: 'success',
    },
});

const exposeSemanticCustomProperties = (selector: string) => {
    globalStyle(selector, {
        '--bg-surface': themeVars.bg.surface,
        '--bg-surface-hover': themeVars.bg.surfaceHover,
        '--bg-nav': themeVars.bg.nav,
        '--bg-input': themeVars.bg.input,
        '--text-primary': themeVars.text.primary,
        '--text-secondary': themeVars.text.secondary,
        '--text-muted': themeVars.text.muted,
        '--accent-primary': themeVars.accent.primary,
        '--accent-hover': themeVars.accent.hover,
        '--accent-muted': themeVars.accent.muted,
        '--border-default': themeVars.border.default,
        '--border-active': themeVars.border.active,
        '--danger': themeVars.status.danger,
        '--warning': themeVars.status.warning,
        '--success': themeVars.status.success,
    } as Record<string, string>);
};

const createThemeFromTokens = (tokens: ThemeTokens) => createTheme(themeVars, tokens);

export const darkCanopyThemeClass = createThemeFromTokens(themeTokenMap.dark_canopy);
export const lightGroveThemeClass = createThemeFromTokens(themeTokenMap.light_grove);
export const amoledNightThemeClass = createThemeFromTokens(themeTokenMap.amoled_night);
export const storybookMeadowThemeClass = createThemeFromTokens(themeTokenMap.storybook_meadow);
export const adventureSpectrumThemeClass = createThemeFromTokens(themeTokenMap.adventure_spectrum);

export const themeClassByPreference: Record<BlackoutThemeId, string> = {
    dark_canopy: darkCanopyThemeClass,
    light_grove: lightGroveThemeClass,
    amoled_night: amoledNightThemeClass,
    storybook_meadow: storybookMeadowThemeClass,
    adventure_spectrum: adventureSpectrumThemeClass,
};

export { themeColorSchemeByPreference, themeTokenMap };

export const allThemeClasses = Object.values(themeClassByPreference);

for (const className of allThemeClasses) {
    exposeSemanticCustomProperties(`.${className}`);
}

export const applyThemeToRoot = (root: HTMLElement, preference: string | null | undefined) =>
    applyThemeToRootEngine(root, preference, themeClassByPreference);

export type ThemePreference = BlackoutThemeId;

export const normalizeThemePreference = (theme: string | null | undefined): ThemePreference =>
    normalizeThemeId(theme);

export const THEME_PREFERENCE_IDS = BLACKOUT_THEME_IDS;

globalStyle(':root', {
    color: 'var(--text-primary)',
    backgroundColor: 'var(--bg-surface)',
});
