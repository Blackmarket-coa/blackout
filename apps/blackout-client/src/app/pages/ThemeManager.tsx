import React, { ReactNode, useEffect } from 'react';
import { configClass, varsClass } from 'folds';
import {
    DarkTheme,
    LightTheme,
    ThemeContextProvider,
    ThemeKind,
    useActiveTheme,
    useSystemThemeKind,
} from '../hooks/useTheme';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { legacyThemePlugin } from '../plugins/theme/legacyThemePlugin';

export function UnAuthRouteThemeManager() {
    const systemThemeKind = useSystemThemeKind();

    useEffect(() => {
        document.body.className = '';
        document.body.classList.add(configClass, varsClass);
        if (systemThemeKind === ThemeKind.Dark) {
            document.body.classList.add(...DarkTheme.classNames);
        }
        if (systemThemeKind === ThemeKind.Light) {
            document.body.classList.add(...LightTheme.classNames);
        }
    }, [systemThemeKind]);

    return null;
}

export function AuthRouteThemeManager({ children }: { children: ReactNode }) {
    const activeTheme = useActiveTheme();
    const [monochromeMode] = useSetting(settingsAtom, 'monochromeMode');

    useEffect(() => {
        document.body.className = '';
        document.body.classList.add(configClass, varsClass);

        document.body.classList.add(...activeTheme.classNames);

        document.body.style.filter = legacyThemePlugin.applyMonochromeFilter(monochromeMode ?? false);
    }, [activeTheme, monochromeMode]);

    return <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>;
}
