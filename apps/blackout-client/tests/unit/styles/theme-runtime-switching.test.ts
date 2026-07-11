// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
    applyThemeToRoot,
    themeColorSchemeByPreference,
} from '../../../src/app/styles/theme-engine';

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
            Object.values(classByPreference).filter((name) => root.classList.contains(name))
        ).toEqual([classByPreference.light_grove]);
    });

    it('falls back to dark canopy for unknown theme IDs', () => {
        const root = document.createElement('html');
        const normalized = applyThemeToRoot(root, 'unknown_theme', classByPreference);

        expect(normalized).toBe('dark_canopy');
        expect(root.classList.contains(classByPreference.dark_canopy)).toBe(true);
    });

    it('clears the index.html boot seeds when the real theme class lands', () => {
        const root = document.createElement('html');
        // Simulate the pre-hydration guard from index.html.
        root.dataset.themeBoot = '1';
        root.style.setProperty('--bg-surface', '#EFFFD1');
        root.style.setProperty('--text-primary', '#102017');

        applyThemeToRoot(root, 'amoled_night', classByPreference);

        expect(root.dataset.themeBoot).toBeUndefined();
        expect(root.style.getPropertyValue('--bg-surface')).toBe('');
        expect(root.style.getPropertyValue('--text-primary')).toBe('');
        expect(root.classList.contains(classByPreference.amoled_night)).toBe(true);
    });

    it('leaves inline styles untouched when no boot seed marker is present', () => {
        const root = document.createElement('html');
        // An unrelated inline var (e.g. the custom accent set by
        // RuntimeSettingsBridge) must survive a theme switch.
        root.style.setProperty('--accent-primary', '#4ECDC4');

        applyThemeToRoot(root, 'light_grove', classByPreference);

        expect(root.style.getPropertyValue('--accent-primary')).toBe('#4ECDC4');
    });
});
