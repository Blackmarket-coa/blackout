import { atom } from 'jotai';
import type { ThemePreference } from '../styles/theme.css';

export const themePreferenceAtom = atom<ThemePreference>('dark');
