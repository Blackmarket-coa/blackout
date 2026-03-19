import { createTheme, createThemeContract, globalStyle } from '@vanilla-extract/css';

export const bmcPalette = {
  forest: '#2D5A27',
  darkGreen: '#1E3D1A',
  teal: '#4ECDC4',
  black: '#1A1A1A',
  lightGreen: '#E8F5E2',
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
    surfaceHover: '#242424',
    nav: bmcPalette.darkGreen,
    input: '#262626',
  },
  text: {
    primary: bmcPalette.white,
    secondary: '#D8E7D3',
    muted: '#A8B4A3',
  },
  accent: {
    primary: bmcPalette.teal,
    hover: '#63DBD3',
    muted: '#317E79',
  },
  border: {
    default: '#365132',
    active: bmcPalette.teal,
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
    primary: '#2AAEA6',
    hover: '#208F88',
    muted: '#9DD7D2',
  },
  border: {
    default: '#BDD5B8',
    active: bmcPalette.teal,
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
    primary: bmcPalette.teal,
    hover: '#6DE0D9',
    muted: '#2E6D69',
  },
  border: {
    default: '#1F1F1F',
    active: bmcPalette.teal,
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
