import { useEffect, type PropsWithChildren } from 'react';
import { useAtomValue } from 'jotai';
import { themePreferenceAtom } from '../state/theme-atoms';
import { allThemeClasses, applyThemeToRoot } from '../styles/theme-runtime';

export const ThemeProvider = ({ children }: PropsWithChildren) => {
    const preference = useAtomValue(themePreferenceAtom);

    useEffect(() => {
        const root = document.documentElement;
        applyThemeToRoot(root, preference);

        return () => {
            root.classList.remove(...allThemeClasses);
            delete root.dataset.theme;
            root.style.colorScheme = '';
        };
    }, [preference]);

    return children;
};
