import { createTheme, createThemeContract, globalStyle } from '@vanilla-extract/css';

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

export const darkThemeClass = createTheme(themeVars, {
  bg: {
    surface: bmcPalette.black,
    surfaceHover: '#111111',
    nav: bmcPalette.darkForest,
    input: '#1A1A1A',
  },
  text: {
    primary: bmcPalette.white,
    secondary: '#D3E8DA',
    muted: '#9EB5A6',
  },
  accent: {
    primary: bmcPalette.seafoam,
    hover: '#B7EED2',
    muted: '#2C5D46',
  },
  border: {
    default: '#30573D',
    active: bmcPalette.fallLeaves,
  },
  status: {
    danger: bmcPalette.danger,
    warning: bmcPalette.warning,
    success: bmcPalette.forest,
  },
});

export const lightThemeClass = createTheme(themeVars, {
  bg: {
    surface: bmcPalette.white,
    surfaceHover: bmcPalette.lightGreen,
    nav: '#DCECD6',
    input: '#F1F8EE',
  },
  text: {
    primary: bmcPalette.black,
    secondary: '#2F3F2C',
    muted: '#5E6E5B',
  },
  accent: {
    primary: bmcPalette.forest,
    hover: '#1E4625',
    muted: '#B6D8C0',
  },
  border: {
    default: '#BDD5B8',
    active: bmcPalette.fallLeaves,
  },
  status: {
    danger: bmcPalette.danger,
    warning: bmcPalette.warning,
    success: bmcPalette.forest,
  },
});

export const amoledThemeClass = createTheme(themeVars, {
  bg: {
    surface: '#000000',
    surfaceHover: '#0D0D0D',
    nav: '#000000',
    input: '#111111',
  },
  text: {
    primary: bmcPalette.white,
    secondary: '#D0D0D0',
    muted: '#8E8E8E',
  },
  accent: {
    primary: bmcPalette.seafoam,
    hover: '#BFEFD8',
    muted: '#244D3A',
  },
  border: {
    default: '#1F1F1F',
    active: bmcPalette.fallLeaves,
  },
  status: {
    danger: bmcPalette.danger,
    warning: bmcPalette.warning,
    success: bmcPalette.forest,
  },
});

exposeSemanticCustomProperties(`.${darkThemeClass}`);
exposeSemanticCustomProperties(`.${lightThemeClass}`);
exposeSemanticCustomProperties(`.${amoledThemeClass}`);

export const themeClassByPreference = {
  dark: darkThemeClass,
  light: lightThemeClass,
  amoled: amoledThemeClass,
} as const;

export type ThemePreference = keyof typeof themeClassByPreference;

globalStyle(':root', {
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-surface)',
});
