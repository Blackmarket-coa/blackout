import type { PluginDefinition } from '../contracts';
import { isRuntimePluginEnabled } from '../manifest';

let unregisterLifecycle = (): void => {};

export const legacyThemePlugin: PluginDefinition<'theme.legacy-overrides'> & {
    applyMonochromeFilter: (monochromeMode: boolean) => string;
} = {
    id: 'theme.legacy-overrides',
    isEnabled: (): boolean => isRuntimePluginEnabled('theme.legacy-overrides'),
    register: () => {
        unregisterLifecycle = (): void => {};
        return unregisterLifecycle;
    },
    unregister: () => {
        unregisterLifecycle();
    },
    applyMonochromeFilter: (monochromeMode: boolean): string =>
        legacyThemePlugin.isEnabled() && monochromeMode ? 'grayscale(1)' : '',
};
