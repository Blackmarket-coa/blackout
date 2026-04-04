export const BLACKOUT_THEMES = [
  {
    id: 'dark_canopy',
    label: 'Dark canopy',
    description: 'Deep green and black surfaces for extended low-light sessions.',
  },
  {
    id: 'light_grove',
    label: 'Light grove',
    description: 'Light green and white surfaces for daylight readability.',
  },
  {
    id: 'amoled_night',
    label: 'AMOLED night',
    description: 'Pure black OLED surfaces with teal interaction accents.',
  },
  {
    id: 'storybook_meadow',
    label: 'Storybook meadow',
    description: 'Warm natural tones with soft highlights for calm reading and collaboration.',
  },
  {
    id: 'adventure_spectrum',
    label: 'Adventure spectrum',
    description: 'Playful high-contrast accents and clear landmarks for color-blind-friendly navigation.',
  },
] as const;

export type BlackoutThemeId = (typeof BLACKOUT_THEMES)[number]['id'];

export const BLACKOUT_THEME_IDS = BLACKOUT_THEMES.map((theme) => theme.id) as readonly BlackoutThemeId[];

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
