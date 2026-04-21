export const BLACKOUT_THEMES = [
    {
        id: 'dark_canopy',
        label: 'Dark canopy',
        description: 'Coalition dark mode: charcoal canopy, neon-leaf accents, and high-visibility contrast.',
    },
    {
        id: 'light_grove',
        label: 'Light grove',
        description: 'Solarpunk daylight palette with bright greens and crisp, readable contrast.',
    },
    {
        id: 'amoled_night',
        label: 'AMOLED night',
        description: 'Pure black OLED surfaces with lime + mint highlights for night-time clarity.',
    },
    {
        id: 'storybook_meadow',
        label: 'Storybook meadow',
        description: 'Warm solarpunk meadow tones tuned for calm reading without losing visibility.',
    },
    {
        id: 'adventure_spectrum',
        label: 'Adventure spectrum',
        description:
            'Black Market Coalition high-visibility accents with energetic solarpunk wayfinding.',
    },
] as const;

export type BlackoutThemeId = typeof BLACKOUT_THEMES[number]['id'];

export const BLACKOUT_THEME_IDS = BLACKOUT_THEMES.map(
    (theme) => theme.id
) as readonly BlackoutThemeId[];

const LEGACY_THEME_MAP = {
    dark: 'dark_canopy',
    light: 'light_grove',
    amoled: 'amoled_night',
} as const;

export type LegacyThemeId = keyof typeof LEGACY_THEME_MAP;

export const normalizeThemeId = (theme: string | null | undefined): BlackoutThemeId => {
    if (!theme) return 'dark_canopy';
    if ((BLACKOUT_THEME_IDS as readonly string[]).includes(theme)) {
        return theme as BlackoutThemeId;
    }

    const mapped = LEGACY_THEME_MAP[theme as LegacyThemeId];
    return mapped ?? 'dark_canopy';
};
