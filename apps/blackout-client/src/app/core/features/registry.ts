import { buildFeatureRegistry } from './buildRegistry';
import { coreFeatureModules } from './coreModules';
import { defaultFeatureFlags } from './featureFlags';
import { assertFeatureModulesRegistered } from './composition';
import { featurePlugins } from './plugins';

import { featureModuleManifest } from './manifest';

assertFeatureModulesRegistered(coreFeatureModules, featureModuleManifest, 'core');
assertFeatureModulesRegistered(
    featurePlugins.flatMap((plugin) => plugin.modules),
    featureModuleManifest,
    'plugin'
);

export const featureRegistry = buildFeatureRegistry(defaultFeatureFlags, featurePlugins);
