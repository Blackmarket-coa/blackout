import { useEffect, type PropsWithChildren } from 'react';
import { useAtomValue } from 'jotai';
import { themePreferenceAtom } from '../state/theme-atoms';
import {
  amoledThemeClass,
  darkThemeClass,
  lightThemeClass,
  themeClassByPreference,
} from '../styles/theme.css';

const ALL_THEME_CLASSES = [darkThemeClass, lightThemeClass, amoledThemeClass];

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const preference = useAtomValue(themePreferenceAtom);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...ALL_THEME_CLASSES);
    root.classList.add(themeClassByPreference[preference]);

    return () => {
      root.classList.remove(...ALL_THEME_CLASSES);
    };
  }, [preference]);

  return children;
};
