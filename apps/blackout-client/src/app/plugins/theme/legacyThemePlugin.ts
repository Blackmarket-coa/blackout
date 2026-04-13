import { isRuntimePluginEnabled } from '../manifest';

export const legacyThemePlugin = {
    id: 'theme.legacy-overrides' as const,
    isEnabled: (): boolean => isRuntimePluginEnabled('theme.legacy-overrides'),
    applyMonochromeFilter: (monochromeMode: boolean): string =>
        legacyThemePlugin.isEnabled() && monochromeMode ? 'grayscale(1)' : '',
};
