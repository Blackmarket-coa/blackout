import { buildFeatureRegistry } from './buildRegistry';
import { defaultFeatureFlags } from './featureFlags';
import { featurePlugins } from './plugins';

export const featureRegistry = buildFeatureRegistry(defaultFeatureFlags, featurePlugins);
