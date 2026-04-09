import { normalizeThemeId, type BlackoutThemeId } from '@blackout/core';

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

export type ThemeTokens = {
    bg: {
        surface: string;
        surfaceHover: string;
        nav: string;
        input: string;
    };
    text: {
        primary: string;
        secondary: string;
        muted: string;
    };
    accent: {
        primary: string;
        hover: string;
        muted: string;
    };
    border: {
        default: string;
        active: string;
    };
    status: {
        danger: string;
        warning: string;
        success: string;
    };
};

const baseDarkTokens: ThemeTokens = {
    bg: {
        surface: bmcPalette.black,
        surfaceHover: '#111111',
        nav: bmcPalette.darkForest,
        input: '#1A1A1A',
    },
    text: { primary: bmcPalette.white, secondary: '#D3E8DA', muted: '#9EB5A6' },
    accent: { primary: bmcPalette.seafoam, hover: '#B7EED2', muted: '#2C5D46' },
    border: { default: '#30573D', active: bmcPalette.fallLeaves },
    status: { danger: bmcPalette.danger, warning: bmcPalette.warning, success: bmcPalette.forest },
};

type ThemeTokenDelta = {
    bg?: Partial<ThemeTokens['bg']>;
    text?: Partial<ThemeTokens['text']>;
    accent?: Partial<ThemeTokens['accent']>;
    border?: Partial<ThemeTokens['border']>;
    status?: Partial<ThemeTokens['status']>;
};

const themeDeltas: Record<BlackoutThemeId, ThemeTokenDelta> = {
    dark_canopy: {},
    light_grove: {
        bg: {
            surface: bmcPalette.white,
            surfaceHover: bmcPalette.lightGreen,
            nav: '#DCECD6',
            input: '#F1F8EE',
        },
        text: { primary: bmcPalette.black, secondary: '#2F3F2C', muted: '#5E6E5B' },
        accent: { primary: bmcPalette.forest, hover: '#1E4625', muted: '#B6D8C0' },
        border: { default: '#BDD5B8' },
    },
    amoled_night: {
        bg: { surface: '#000000', surfaceHover: '#0D0D0D', nav: '#000000', input: '#111111' },
        text: { secondary: '#D0D0D0', muted: '#8E8E8E' },
        accent: { hover: '#BFEFD8', muted: '#244D3A' },
        border: { default: '#1F1F1F' },
    },
    storybook_meadow: {
        bg: { surface: '#fffdf7', surfaceHover: '#f8f3e5', nav: '#efe8d8', input: '#ecf2df' },
        text: { primary: '#2a2b22', secondary: '#58614b', muted: '#7f8c72' },
        accent: { primary: '#5a8d76', hover: '#4f6f3b', muted: '#c6d8b7' },
        border: { default: '#b8caa9', active: '#4f6f3b' },
        status: { success: '#4f6f3b' },
    },
    adventure_spectrum: {
        bg: { surface: '#161b2c', surfaceHover: '#1d2440', nav: '#151a2a', input: '#1a2036' },
        text: { primary: '#f3f6ff', secondary: '#bbc7ec', muted: '#7e90bf' },
        accent: { primary: '#63d1c0', hover: '#ffcc59', muted: '#4f8cff' },
        border: { default: '#3a4670', active: '#ffcc59' },
        status: { warning: '#ffcc59', success: '#63d1c0' },
    },
};

const mergeThemeTokens = (base: ThemeTokens, delta: ThemeTokenDelta): ThemeTokens => ({
    bg: { ...base.bg, ...delta.bg },
    text: { ...base.text, ...delta.text },
    accent: { ...base.accent, ...delta.accent },
    border: { ...base.border, ...delta.border },
    status: { ...base.status, ...delta.status },
});

export const themeTokenMap: Record<BlackoutThemeId, ThemeTokens> = {
    dark_canopy: mergeThemeTokens(baseDarkTokens, themeDeltas.dark_canopy),
    light_grove: mergeThemeTokens(baseDarkTokens, themeDeltas.light_grove),
    amoled_night: mergeThemeTokens(baseDarkTokens, themeDeltas.amoled_night),
    storybook_meadow: mergeThemeTokens(baseDarkTokens, themeDeltas.storybook_meadow),
    adventure_spectrum: mergeThemeTokens(baseDarkTokens, themeDeltas.adventure_spectrum),
};

export const themeColorSchemeByPreference: Record<BlackoutThemeId, 'light' | 'dark'> = {
    dark_canopy: 'dark',
    light_grove: 'light',
    amoled_night: 'dark',
    storybook_meadow: 'light',
    adventure_spectrum: 'dark',
};

export const applyThemeToRoot = (
    root: HTMLElement,
    preference: string | null | undefined,
    classByPreference: Record<BlackoutThemeId, string>,
) => {
    const normalizedPreference = normalizeThemeId(preference);
    const allClasses = Object.values(classByPreference);

    root.classList.remove(...allClasses);
    root.classList.add(classByPreference[normalizedPreference]);
    root.dataset.theme = normalizedPreference;
    root.style.colorScheme = themeColorSchemeByPreference[normalizedPreference];

    return normalizedPreference;
};
