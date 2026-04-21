import { lightTheme } from 'folds';
import { useAtomValue } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { onDarkFontWeight, onLightFontWeight } from '../../config.css';
import { butterTheme, darkTheme, silverTheme } from '../../colors.css';
import { themePreferenceAtom } from '../state/theme-atoms';
import { themeColorSchemeByPreference, type ThemePreference } from '../styles/theme.css';

export enum ThemeKind {
  Light = 'light',
  Dark = 'dark',
}

export type Theme = {
  id: string;
  kind: ThemeKind;
  classNames: string[];
};

export const LightTheme: Theme = {
  id: 'light-theme',
  kind: ThemeKind.Light,
  classNames: [lightTheme, onLightFontWeight, 'prism-light'],
};

export const SilverTheme: Theme = {
  id: 'silver-theme',
  kind: ThemeKind.Light,
  classNames: ['silver-theme', silverTheme, onLightFontWeight, 'prism-light'],
};
export const DarkTheme: Theme = {
  id: 'dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['dark-theme', darkTheme, onDarkFontWeight, 'prism-dark'],
};
export const ButterTheme: Theme = {
  id: 'butter-theme',
  kind: ThemeKind.Dark,
  classNames: ['butter-theme', butterTheme, onDarkFontWeight, 'prism-dark'],
};

export const useThemes = (): Theme[] => {
  const themes: Theme[] = useMemo(() => [LightTheme, SilverTheme, DarkTheme, ButterTheme], []);

  return themes;
};

export const useThemeNames = (): Record<string, string> =>
  useMemo(
    () => ({
      [LightTheme.id]: 'Light',
      [SilverTheme.id]: 'Silver',
      [DarkTheme.id]: 'Dark',
      [ButterTheme.id]: 'Butter',
    }),
    []
  );

export const useSystemThemeKind = (): ThemeKind => {
  const darkModeQueryList = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [themeKind, setThemeKind] = useState<ThemeKind>(
    darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light
  );

  useEffect(() => {
    const handleMediaQueryChange = () => {
      setThemeKind(darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light);
    };

    darkModeQueryList.addEventListener('change', handleMediaQueryChange);
    return () => {
      darkModeQueryList.removeEventListener('change', handleMediaQueryChange);
    };
  }, [darkModeQueryList, setThemeKind]);

  return themeKind;
};

const mapThemePreferenceToLegacyTheme = (preference: ThemePreference): Theme => {
  if (preference === 'light_grove') return LightTheme;
  if (preference === 'storybook_meadow') return SilverTheme;
  if (preference === 'adventure_spectrum') return ButterTheme;
  return DarkTheme;
};

export const useActiveTheme = (): Theme => {
  const themePreference = useAtomValue(themePreferenceAtom);
  return mapThemePreferenceToLegacyTheme(themePreference);
};

export const useTheme = (): Theme => {
  const themePreference = useAtomValue(themePreferenceAtom);
  const legacyTheme = mapThemePreferenceToLegacyTheme(themePreference);

  return {
    ...legacyTheme,
    id: themePreference,
    kind:
      themeColorSchemeByPreference[themePreference] === 'dark'
        ? ThemeKind.Dark
        : ThemeKind.Light,
  };
};
