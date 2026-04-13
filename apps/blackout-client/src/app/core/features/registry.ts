import { buildFeatureRegistry } from './buildRegistry';
import { coreFeatureModules } from './coreModules';
import { defaultFeatureFlags } from './featureFlags';
import { assertFeatureModulesRegistered, orderFeatureModulePlugins } from './composition';
import { featurePlugins } from './plugins';

import { featureModuleManifest } from './manifest';

const orderedFeaturePlugins = orderFeatureModulePlugins(featurePlugins);

assertFeatureModulesRegistered(coreFeatureModules, featureModuleManifest, 'core');
assertFeatureModulesRegistered(
    orderedFeaturePlugins.flatMap((plugin) => plugin.modules),
    featureModuleManifest,
    'plugin'
);

export const featureRegistry = buildFeatureRegistry(defaultFeatureFlags, orderedFeaturePlugins);
