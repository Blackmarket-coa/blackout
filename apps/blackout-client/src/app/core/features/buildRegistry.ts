import type { FeatureFlags } from './featureFlags';
import { coreFeatureModules } from './coreModules';
import { collectFeatureModulesFromPlugins } from './pluginRuntime';
import type { BlackoutFeature, FeatureModulePlugin } from './types';

export const buildFeatureRegistry = (
    flags: FeatureFlags,
    pluginModules: FeatureModulePlugin[] = []
): BlackoutFeature[] => {
    const modules = [
        ...coreFeatureModules,
        ...collectFeatureModulesFromPlugins(pluginModules).map((module) => ({
            ...module,
            source: module.source ?? 'plugin',
        })),
    ];

    return modules
        .filter((module) => (module.flag ? flags[module.flag] : true))
        .map((module) => module.feature);
};
