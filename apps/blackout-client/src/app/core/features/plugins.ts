import type { FeatureModulePlugin } from './types';

/**
 * Plugin boundary: runtime customization modules must be registered in
 * `registeredFeatureModuleIds` before they can be added here.
 */
export const featurePlugins: FeatureModulePlugin[] = [];
