import { BLACKOUT_THEME_IDS, normalizeThemeId, type BlackoutThemeId } from '../../lib/bmc-core';
import { allThemeClasses, themeClassByPreference } from './theme.css';
import { applyThemeToRoot as applyThemeToRootEngine, themeColorSchemeByPreference } from './theme-engine';

export type ThemePreference = BlackoutThemeId;

export const applyThemeToRoot = (root: HTMLElement, preference: string | null | undefined) =>
    applyThemeToRootEngine(root, preference, themeClassByPreference);

export const normalizeThemePreference = (theme: string | null | undefined): ThemePreference =>
    normalizeThemeId(theme);

export const THEME_PREFERENCE_IDS = BLACKOUT_THEME_IDS;

export { allThemeClasses, themeColorSchemeByPreference };
