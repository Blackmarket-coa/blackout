import type { FeatureModule, FeatureModulePlugin } from './types';

export const collectFeatureModulesFromPlugins = (
    plugins: FeatureModulePlugin[] = []
): FeatureModule[] => plugins.flatMap((plugin) => plugin.getFeatureModules());
