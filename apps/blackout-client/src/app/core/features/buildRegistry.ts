import type { FeatureFlags } from './featureFlags';
import { coreFeatureModules } from './coreModules';
import { orderFeatureModulePlugins } from './composition';
import type { BlackoutFeature, FeatureModule, FeatureModulePlugin } from './types';

const dedupeFeatureModules = (modules: FeatureModule[]): FeatureModule[] => {
    const seenFeatureIds = new Set<string>();

    return modules.filter((module) => {
        const { id } = module.feature;
        if (seenFeatureIds.has(id)) return false;
        seenFeatureIds.add(id);
        return true;
    });
};

export const buildFeatureRegistry = (
    flags: FeatureFlags,
    plugins: FeatureModulePlugin[] = []
): BlackoutFeature[] => {
    const orderedPlugins = orderFeatureModulePlugins(plugins);

    const modules = dedupeFeatureModules([
        ...coreFeatureModules,
        ...orderedPlugins.flatMap((plugin) => plugin.modules),
    ]);

    return modules
        .filter((module) => (module.flag ? flags[module.flag] : true))
        .map((module) => module.feature);
};
