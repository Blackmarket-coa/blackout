import { normalizeThemeId, type BlackoutThemeId } from '../../lib/bmc-core';

export const bmcPalette = {
    neonLeaf: '#D7FF3F',
    solarMint: '#2EF2C5',
    forest: '#2A6B3F',
    darkForest: '#112619',
    ember: '#C66A2B',
    black: '#0B0F10',
    lightGreen: '#EFFFD1',
    white: '#F7FFF9',
    danger: '#FF5D5D',
    warning: '#FFB547',
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
        surfaceHover: '#151B1C',
        nav: bmcPalette.darkForest,
        input: '#1A2420',
    },
    text: { primary: bmcPalette.white, secondary: '#DDF6E6', muted: '#9EC4AF' },
    accent: { primary: bmcPalette.neonLeaf, hover: '#E8FF86', muted: '#2E5A42' },
    border: { default: '#2E5A42', active: bmcPalette.solarMint },
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
            surface: bmcPalette.lightGreen,
            surfaceHover: '#E5F9C0',
            nav: '#D7F2A7',
            input: '#F4FFD8',
        },
        text: { primary: '#102017', secondary: '#254132', muted: '#496859' },
        accent: { primary: '#1E6341', hover: '#154B31', muted: '#A5D5B8' },
        border: { default: '#9FCB8D', active: '#1E6341' },
    },
    amoled_night: {
        bg: { surface: '#000000', surfaceHover: '#0A0D0B', nav: '#000000', input: '#101512' },
        text: { secondary: '#D9EDE3', muted: '#90AFA0' },
        accent: { primary: '#BFFF2E', hover: '#D5FF66', muted: '#204635' },
        border: { default: '#1A2A22', active: '#2EF2C5' },
    },
    storybook_meadow: {
        bg: { surface: '#FFFBEF', surfaceHover: '#F6EED7', nav: '#E8F1D0', input: '#EDF7DD' },
        text: { primary: '#1D2C24', secondary: '#405A4C', muted: '#6D8477' },
        accent: { primary: '#2A6B3F', hover: '#1E5230', muted: '#C4DEAF' },
        border: { default: '#A5C38C', active: '#2A6B3F' },
        status: { success: '#2A6B3F' },
    },
    adventure_spectrum: {
        bg: { surface: '#121D1A', surfaceHover: '#1A2A25', nav: '#10221B', input: '#193129' },
        text: { primary: '#F4FFF8', secondary: '#C8F2DD', muted: '#86B8A2' },
        accent: { primary: '#D7FF3F', hover: '#2EF2C5', muted: '#FFB547' },
        border: { default: '#2D5E49', active: '#D7FF3F' },
        status: { warning: '#FFB547', success: '#2EF2C5' },
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
    classByPreference: Record<BlackoutThemeId, string>
) => {
    const normalizedPreference = normalizeThemeId(preference);
    const allClasses = Object.values(classByPreference);

    // The index.html pre-hydration guard seeds --bg-surface/--text-primary as
    // inline styles so the first paint matches the persisted theme. Inline
    // styles outrank the theme class, so clear the seeds the moment the real
    // class lands — otherwise runtime theme switches would keep the boot
    // theme's surface/text colors forever.
    if (root.dataset.themeBoot) {
        delete root.dataset.themeBoot;
        root.style.removeProperty('--bg-surface');
        root.style.removeProperty('--text-primary');
    }

    root.classList.remove(...allClasses);
    root.classList.add(classByPreference[normalizedPreference]);
    root.dataset.theme = normalizedPreference;
    root.style.colorScheme = themeColorSchemeByPreference[normalizedPreference];

    return normalizedPreference;
};
