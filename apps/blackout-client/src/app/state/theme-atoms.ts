import { atom } from 'jotai';
import type { ThemePreference } from '../styles/theme.css';
import { settingsAtom } from './settings';

export const themePreferenceAtom = atom<ThemePreference, [ThemePreference], void>(
    (get) => get(settingsAtom).theme,
    (_get, set, nextTheme) => {
        set(settingsAtom, (previous) => ({ ...previous, theme: nextTheme }));
    },
);
