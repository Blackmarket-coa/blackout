import { useEffect, type PropsWithChildren } from 'react';
import { useAtomValue } from 'jotai';
import { themePreferenceAtom } from '../state/theme-atoms';
import { allThemeClasses, themeClassByPreference } from '../styles/theme.css';

export const ThemeProvider = ({ children }: PropsWithChildren) => {
    const preference = useAtomValue(themePreferenceAtom);

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove(...allThemeClasses);
        root.classList.add(themeClassByPreference[preference]);

        return () => {
            root.classList.remove(...allThemeClasses);
        };
    }, [preference]);

    return children;
};
