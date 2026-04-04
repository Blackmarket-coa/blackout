import { createTheme, createThemeContract, globalStyle } from '@vanilla-extract/css';
import { BLACKOUT_THEME_IDS, normalizeThemeId, type BlackoutThemeId } from '@blackout/core';

export const bmcPalette = {
  seafoam: '#9FE2BF',
  forest: '#2B5D34',
  darkForest: '#163520',
  fallLeaves: '#8D3A2F',
  black: '#0A0A0A',
  lightGreen: '#E6F4EA',
  white: '#FAFAFA',
  danger: '#CC4444',
  warning: '#D4830A',
} as const;

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

export const darkCanopyThemeClass = createTheme(themeVars, {
  bg: { surface: bmcPalette.black, surfaceHover: '#111111', nav: bmcPalette.darkForest, input: '#1A1A1A' },
  text: { primary: bmcPalette.white, secondary: '#D3E8DA', muted: '#9EB5A6' },
  accent: { primary: bmcPalette.seafoam, hover: '#B7EED2', muted: '#2C5D46' },
  border: { default: '#30573D', active: bmcPalette.fallLeaves },
  status: { danger: bmcPalette.danger, warning: bmcPalette.warning, success: bmcPalette.forest },
});

export const lightGroveThemeClass = createTheme(themeVars, {
  bg: { surface: bmcPalette.white, surfaceHover: bmcPalette.lightGreen, nav: '#DCECD6', input: '#F1F8EE' },
  text: { primary: bmcPalette.black, secondary: '#2F3F2C', muted: '#5E6E5B' },
  accent: { primary: bmcPalette.forest, hover: '#1E4625', muted: '#B6D8C0' },
  border: { default: '#BDD5B8', active: bmcPalette.fallLeaves },
  status: { danger: bmcPalette.danger, warning: bmcPalette.warning, success: bmcPalette.forest },
});

export const amoledNightThemeClass = createTheme(themeVars, {
  bg: { surface: '#000000', surfaceHover: '#0D0D0D', nav: '#000000', input: '#111111' },
  text: { primary: bmcPalette.white, secondary: '#D0D0D0', muted: '#8E8E8E' },
  accent: { primary: bmcPalette.seafoam, hover: '#BFEFD8', muted: '#244D3A' },
  border: { default: '#1F1F1F', active: bmcPalette.fallLeaves },
  status: { danger: bmcPalette.danger, warning: bmcPalette.warning, success: bmcPalette.forest },
});

export const storybookMeadowThemeClass = createTheme(themeVars, {
  bg: { surface: '#fffdf7', surfaceHover: '#f8f3e5', nav: '#efe8d8', input: '#ecf2df' },
  text: { primary: '#2a2b22', secondary: '#58614b', muted: '#7f8c72' },
  accent: { primary: '#5a8d76', hover: '#4f6f3b', muted: '#c6d8b7' },
  border: { default: '#b8caa9', active: '#4f6f3b' },
  status: { danger: bmcPalette.danger, warning: bmcPalette.warning, success: '#4f6f3b' },
});

export const adventureSpectrumThemeClass = createTheme(themeVars, {
  bg: { surface: '#161b2c', surfaceHover: '#1d2440', nav: '#151a2a', input: '#1a2036' },
  text: { primary: '#f3f6ff', secondary: '#bbc7ec', muted: '#7e90bf' },
  accent: { primary: '#63d1c0', hover: '#ffcc59', muted: '#4f8cff' },
  border: { default: '#3a4670', active: '#ffcc59' },
  status: { danger: bmcPalette.danger, warning: '#ffcc59', success: '#63d1c0' },
});

export const themeClassByPreference: Record<BlackoutThemeId, string> = {
  dark_canopy: darkCanopyThemeClass,
  light_grove: lightGroveThemeClass,
  amoled_night: amoledNightThemeClass,
  storybook_meadow: storybookMeadowThemeClass,
  adventure_spectrum: adventureSpectrumThemeClass,
};

export const allThemeClasses = Object.values(themeClassByPreference);

for (const className of allThemeClasses) {
  exposeSemanticCustomProperties(`.${className}`);
}

export type ThemePreference = BlackoutThemeId;

export const normalizeThemePreference = (theme: string | null | undefined): ThemePreference => normalizeThemeId(theme);

export const THEME_PREFERENCE_IDS = BLACKOUT_THEME_IDS;

globalStyle(':root', {
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-surface)',
});
