// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyThemeToRoot, themeColorSchemeByPreference } from '../../../src/app/styles/theme-engine';

const classByPreference = {
    dark_canopy: 'theme-dark',
    light_grove: 'theme-light',
    amoled_night: 'theme-amoled',
    storybook_meadow: 'theme-storybook',
    adventure_spectrum: 'theme-adventure',
} as const;

describe('runtime theme switching', () => {
    it('normalizes legacy IDs and updates root class + data attributes', () => {
        const root = document.createElement('html');
        root.classList.add(...Object.values(classByPreference));

        const normalized = applyThemeToRoot(root, 'light', classByPreference);

        expect(normalized).toBe('light_grove');
        expect(root.classList.contains(classByPreference.light_grove)).toBe(true);
        expect(root.dataset.theme).toBe('light_grove');
        expect(root.style.colorScheme).toBe(themeColorSchemeByPreference.light_grove);
        expect(
            Object.values(classByPreference).filter((name) => root.classList.contains(name)),
        ).toEqual([classByPreference.light_grove]);
    });

    it('falls back to dark canopy for unknown theme IDs', () => {
        const root = document.createElement('html');
        const normalized = applyThemeToRoot(root, 'unknown_theme', classByPreference);

        expect(normalized).toBe('dark_canopy');
        expect(root.classList.contains(classByPreference.dark_canopy)).toBe(true);
    });
});
